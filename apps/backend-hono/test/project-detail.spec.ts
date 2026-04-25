import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import app from '../src/index';
import { db } from '../src/db/client';
import { members, projects, users } from '../src/db/schema';
import { auth } from '../src/lib/auth';
import type { ProjectDetailResponse } from '../src/lib/projects';

const authHeaders = {
  origin: 'http://localhost:5173',
  host: 'localhost:8787',
};
const verificationCallbackURL = 'http://localhost:8787/sign-in';

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

  return new Headers({
    ...authHeaders,
    cookie: sessionCookie.split(';', 1)[0] ?? sessionCookie,
  });
}

async function getUserByEmail(email: string) {
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  expect(user).toBeTruthy();

  if (!user) {
    throw new Error('Expected user to exist.');
  }

  return user;
}

async function getMember(organizationId: string, userId: string) {
  const member = await db
    .select()
    .from(members)
    .where(and(eq(members.organizationId, organizationId), eq(members.userId, userId)))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  expect(member).toBeTruthy();

  if (!member) {
    throw new Error('Expected organization member to exist.');
  }

  return member;
}

async function createSignedInOwner(prefix: string) {
  const credentials = createCredentials(prefix);
  await signUpUser(credentials);
  const headers = await signInUser(credentials);
  const organization = (await auth.api.listOrganizations({ headers }))[0];
  const user = await getUserByEmail(credentials.email);

  expect(organization).toBeTruthy();

  if (!organization) {
    throw new Error('Expected default organization to exist.');
  }

  return {
    credentials,
    headers,
    organization,
    user,
    member: await getMember(organization.id, user.id),
  };
}

async function addMemberToOrganization(organizationId: string, prefix: string) {
  const credentials = createCredentials(prefix);
  await signUpUser(credentials);
  const user = await getUserByEmail(credentials.email);
  const memberId = crypto.randomUUID();

  await db.insert(members).values({
    id: memberId,
    organizationId,
    role: 'member',
    userId: user.id,
  });

  return {
    credentials,
    headers: await signInUser(credentials),
    memberId,
    user,
  };
}

async function createProject(input: {
  organizationId: string;
  projectOwnerMemberId: string | null;
  slug: string;
}) {
  const now = new Date();

  await db.insert(projects).values({
    id: crypto.randomUUID(),
    organizationId: input.organizationId,
    name: 'Vendor Risk Review',
    description: 'Governance work for reviewing critical vendor risk.',
    slug: input.slug,
    projectOwnerMemberId: input.projectOwnerMemberId,
    createdAt: now,
    updatedAt: now,
  });
}

async function getProjectDetail(headers: Headers, organizationSlug: string, projectSlug: string) {
  const response = await app.request(
    `http://example.com/api/organizations/${organizationSlug}/projects/${projectSlug}`,
    { headers },
  );

  return {
    body: (await response.json()) as { project?: ProjectDetailResponse; error?: string },
    status: response.status,
  };
}

describe('Project detail API', () => {
  it('requires authentication', async () => {
    const response = await app.request(
      'http://example.com/api/organizations/acme/projects/vendor-risk',
    );

    expect(response.status).toBe(401);
  });

  it('loads a Project by organization-local slug for Organization members', async () => {
    const owner = await createSignedInOwner('project-detail-owner');
    const member = await addMemberToOrganization(owner.organization.id, 'project-detail-member');

    await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: owner.member.id,
      slug: 'vendor-risk',
    });

    const response = await getProjectDetail(member.headers, owner.organization.slug, 'vendor-risk');

    expect(response.status).toBe(200);
    expect(response.body.project).toMatchObject({
      name: 'Vendor Risk Review',
      description: 'Governance work for reviewing critical vendor risk.',
      slug: 'vendor-risk',
      projectOwner: {
        email: owner.credentials.email,
        name: owner.credentials.name,
        role: 'owner',
      },
    });
    expect(response.body.project?.createdAt).toBeTruthy();
    expect(response.body.project?.archivedAt).toBeNull();
  });

  it('hides missing, inaccessible, and wrong-Organization Projects behind not found', async () => {
    const owner = await createSignedInOwner('project-detail-hidden-owner');
    const outsider = await createSignedInOwner('project-detail-outsider');

    await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'internal-controls',
    });

    await expect(
      getProjectDetail(owner.headers, owner.organization.slug, 'missing-project'),
    ).resolves.toMatchObject({ status: 404 });
    await expect(
      getProjectDetail(outsider.headers, owner.organization.slug, 'internal-controls'),
    ).resolves.toMatchObject({ status: 404 });
    await expect(
      getProjectDetail(outsider.headers, outsider.organization.slug, 'internal-controls'),
    ).resolves.toMatchObject({ status: 404 });
  });
});
