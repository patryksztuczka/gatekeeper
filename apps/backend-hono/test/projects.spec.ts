import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import app from '../src/index';
import { db } from '../src/db/client';
import { members, projects, users } from '../src/db/schema';
import { auth } from '../src/lib/auth';

const authHeaders = {
  origin: 'http://localhost:5173',
  host: 'localhost:8787',
};
const verificationCallbackURL = 'http://localhost:8787/sign-in';
const mailpitSendUrl = 'http://127.0.0.1:8025/api/v1/send';

function createCredentials(prefix: string) {
  const token = crypto.randomUUID();

  return {
    name: `${prefix} user`,
    email: `${prefix}-${token}@example.com`,
    password: `Password-${token}`,
  };
}

async function signUpUser(credentials: ReturnType<typeof createCredentials>) {
  await auth.api.signUpEmail({
    body: {
      ...credentials,
      callbackURL: verificationCallbackURL,
    },
    headers: authHeaders,
  });

  await db.update(users).set({ emailVerified: true }).where(eq(users.email, credentials.email));
}

async function signInUser(credentials: ReturnType<typeof createCredentials>) {
  const result = await auth.api.signInEmail({
    body: {
      email: credentials.email,
      password: credentials.password,
    },
    headers: authHeaders,
    returnHeaders: true,
  });

  const sessionCookie = result.headers.get('set-cookie');

  expect(sessionCookie).toBeTruthy();

  if (!sessionCookie) {
    throw new Error('Expected Better Auth to return a session cookie.');
  }

  const cookie = sessionCookie.split(';', 1)[0] ?? sessionCookie;

  return new Headers({
    ...authHeaders,
    cookie,
  });
}

async function createSignedInOwner(prefix: string) {
  const credentials = createCredentials(prefix);

  await signUpUser(credentials);

  const headers = await signInUser(credentials);
  const organization = (await auth.api.listOrganizations({ headers }))[0];

  expect(organization?.id).toBeTruthy();

  if (!organization?.id) {
    throw new Error('Expected a default organization.');
  }

  return { headers, organization };
}

async function createProjectRequest(
  organizationSlug: string,
  headers: Headers,
  body: Record<string, unknown>,
) {
  const response = await app.request(
    `http://example.com/api/organizations/${organizationSlug}/projects`,
    {
      body: JSON.stringify(body),
      headers,
      method: 'POST',
    },
  );

  return {
    body: (await response.json()) as Record<string, unknown>,
    status: response.status,
  };
}

beforeEach(() => {
  const originalFetch = globalThis.fetch;

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (url === mailpitSendUrl) {
      return new Response(null, { status: 200 });
    }

    return originalFetch(input, init);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('organization projects', () => {
  it('lets Organization owners create and list active Projects', async () => {
    const { headers, organization } = await createSignedInOwner('project-owner');
    const ownerMembership = await db
      .select({ id: members.id })
      .from(members)
      .where(eq(members.organizationId, organization.id))
      .limit(1)
      .then((rows) => rows[0]);

    expect(ownerMembership?.id).toBeTruthy();

    if (!ownerMembership?.id) {
      throw new Error('Expected an owner membership.');
    }

    const createResponse = await createProjectRequest(organization.slug, headers, {
      description: 'SOC 2 readiness work for this Organization.',
      name: 'SOC 2 Readiness',
      projectOwnerMemberId: ownerMembership.id,
      slug: 'soc-2-readiness',
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.project).toMatchObject({
      description: 'SOC 2 readiness work for this Organization.',
      name: 'SOC 2 Readiness',
      projectOwner: { id: ownerMembership.id },
      slug: 'soc-2-readiness',
    });

    const listResponse = await app.request(
      `http://example.com/api/organizations/${organization.slug}/projects`,
      { headers },
    );

    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toMatchObject({
      projects: [
        {
          name: 'SOC 2 Readiness',
          slug: 'soc-2-readiness',
        },
      ],
    });
  });

  it('prevents members from creating Projects but allows them to list active Projects', async () => {
    const { headers: ownerHeaders, organization } =
      await createSignedInOwner('project-member-owner');
    const member = createCredentials('project-member');

    await signUpUser(member);

    const invitation = await auth.api.createInvitation({
      body: {
        email: member.email,
        organizationId: organization.id,
        role: 'member',
      },
      headers: ownerHeaders,
    });
    const memberHeaders = await signInUser(member);

    await auth.api.acceptInvitation({
      body: { invitationId: invitation.id },
      headers: memberHeaders,
    });

    await createProjectRequest(organization.slug, ownerHeaders, {
      description: 'Vendor review work.',
      name: 'Vendor Review',
      slug: 'vendor-review',
    });

    const forbiddenCreateResponse = await createProjectRequest(organization.slug, memberHeaders, {
      description: 'Member-created work.',
      name: 'Member Project',
      slug: 'member-project',
    });
    const listResponse = await app.request(
      `http://example.com/api/organizations/${organization.slug}/projects`,
      { headers: memberHeaders },
    );

    expect(forbiddenCreateResponse.status).toBe(403);
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toMatchObject({
      projects: [{ slug: 'vendor-review' }],
    });
  });

  it('validates required fields, Organization-local slug uniqueness, and Project Owner membership', async () => {
    const first = await createSignedInOwner('project-first-org');
    const second = await createSignedInOwner('project-second-org');
    const secondOwnerMembership = await db
      .select({ id: members.id })
      .from(members)
      .where(eq(members.organizationId, second.organization.id))
      .limit(1)
      .then((rows) => rows[0]);

    expect(secondOwnerMembership?.id).toBeTruthy();

    if (!secondOwnerMembership?.id) {
      throw new Error('Expected a second owner membership.');
    }

    const missingDescriptionResponse = await createProjectRequest(
      first.organization.slug,
      first.headers,
      {
        description: '',
        name: 'Missing Description',
        slug: 'missing-description',
      },
    );

    expect(missingDescriptionResponse.status).toBe(400);
    expect(missingDescriptionResponse.body).toMatchObject({
      error: 'Project description is required.',
    });

    const wrongOwnerResponse = await createProjectRequest(first.organization.slug, first.headers, {
      description: 'Wrong owner membership.',
      name: 'Wrong Owner',
      projectOwnerMemberId: secondOwnerMembership.id,
      slug: 'wrong-owner',
    });

    expect(wrongOwnerResponse.status).toBe(400);
    expect(wrongOwnerResponse.body).toMatchObject({
      error: 'Project Owner must be a member of this Organization.',
    });

    await createProjectRequest(first.organization.slug, first.headers, {
      description: 'First instance.',
      name: 'Shared Slug',
      slug: 'shared-slug',
    });
    const duplicateResponse = await createProjectRequest(first.organization.slug, first.headers, {
      description: 'Duplicate instance.',
      name: 'Shared Slug Duplicate',
      slug: 'shared-slug',
    });

    expect(duplicateResponse.status).toBe(400);
    expect(duplicateResponse.body).toMatchObject({
      error: 'Project slug is already used in this Organization.',
    });

    const otherOrganizationResponse = await createProjectRequest(
      second.organization.slug,
      second.headers,
      {
        description: 'Same slug in another Organization.',
        name: 'Shared Slug',
        slug: 'shared-slug',
      },
    );

    expect(otherOrganizationResponse.status).toBe(201);

    const archivedDuplicate = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(eq(projects.organizationId, first.organization.id), eq(projects.slug, 'shared-slug')),
      )
      .then((rows) => rows[0]);

    expect(archivedDuplicate?.id).toBeTruthy();

    if (!archivedDuplicate?.id) {
      throw new Error('Expected the first Project.');
    }

    await db
      .update(projects)
      .set({ archivedAt: new Date() })
      .where(eq(projects.id, archivedDuplicate.id));

    const archivedSlugResponse = await createProjectRequest(
      first.organization.slug,
      first.headers,
      {
        description: 'Archived slug reuse attempt.',
        name: 'Archived Slug Reuse',
        slug: 'shared-slug',
      },
    );

    expect(archivedSlugResponse.status).toBe(400);
  });
});
