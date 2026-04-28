import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import app from '../src/index';
import { db } from '../src/db/client';
import { members, projects, users } from '../src/db/schema';
import { auth } from '../src/lib/auth';
import type { ProjectComponentResponse } from '../src/lib/projects';

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
    member: await getMember(organization.id, user.id),
    organization,
    user,
  };
}

async function addMemberToOrganization(
  organizationId: string,
  prefix: string,
  role: 'admin' | 'member' = 'member',
) {
  const credentials = createCredentials(prefix);
  await signUpUser(credentials);
  const user = await getUserByEmail(credentials.email);
  const memberId = crypto.randomUUID();

  await db.insert(members).values({
    id: memberId,
    organizationId,
    role,
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
  const id = crypto.randomUUID();

  await db.insert(projects).values({
    id,
    organizationId: input.organizationId,
    name: 'Vendor Risk Review',
    description: 'Governance work for reviewing critical vendor risk.',
    slug: input.slug,
    projectOwnerMemberId: input.projectOwnerMemberId,
    createdAt: now,
    updatedAt: now,
  });

  return id;
}

async function requestProjectComponents(
  headers: Headers,
  organizationSlug: string,
  projectSlug: string,
  status: 'active' | 'archived' = 'active',
) {
  const query = status === 'archived' ? '?status=archived' : '';
  const response = await app.request(
    `http://example.com/api/organizations/${organizationSlug}/projects/${projectSlug}/components${query}`,
    { headers },
  );

  return {
    body: (await response.json()) as { components?: ProjectComponentResponse[]; error?: string },
    status: response.status,
  };
}

async function createProjectComponent(
  headers: Headers,
  organizationSlug: string,
  projectSlug: string,
  body: Record<string, unknown>,
) {
  const response = await app.request(
    `http://example.com/api/organizations/${organizationSlug}/projects/${projectSlug}/components`,
    {
      body: JSON.stringify(body),
      headers,
      method: 'POST',
    },
  );

  return {
    body: (await response.json()) as { component?: ProjectComponentResponse; error?: string },
    status: response.status,
  };
}

async function updateProjectComponent(
  headers: Headers,
  organizationSlug: string,
  projectSlug: string,
  componentId: string,
  body: Record<string, unknown>,
) {
  const response = await app.request(
    `http://example.com/api/organizations/${organizationSlug}/projects/${projectSlug}/components/${componentId}`,
    {
      body: JSON.stringify(body),
      headers,
      method: 'PATCH',
    },
  );

  return {
    body: (await response.json()) as { component?: ProjectComponentResponse; error?: string },
    status: response.status,
  };
}

async function setProjectComponentArchived(
  headers: Headers,
  organizationSlug: string,
  projectSlug: string,
  componentId: string,
  action: 'archive' | 'restore',
) {
  const response = await app.request(
    `http://example.com/api/organizations/${organizationSlug}/projects/${projectSlug}/components/${componentId}/${action}`,
    { headers, method: 'PATCH' },
  );

  return {
    body: (await response.json()) as { component?: ProjectComponentResponse; error?: string },
    status: response.status,
  };
}

describe('Project Components API', () => {
  it('lets Organization owners manage Project Components and members view active data', async () => {
    const owner = await createSignedInOwner('component-owner');
    const member = await addMemberToOrganization(owner.organization.id, 'component-viewer');

    await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'vendor-risk',
    });

    const createResponse = await createProjectComponent(
      owner.headers,
      owner.organization.slug,
      'vendor-risk',
      {
        description: 'Controls for payment processing scope.',
        name: 'Payments Platform',
      },
    );

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.component).toMatchObject({
      archivedAt: null,
      description: 'Controls for payment processing scope.',
      name: 'Payments Platform',
    });
    expect(createResponse.body.component?.id).toBeTruthy();
    expect(createResponse.body.component?.createdAt).toBeTruthy();

    const memberListResponse = await requestProjectComponents(
      member.headers,
      owner.organization.slug,
      'vendor-risk',
    );

    expect(memberListResponse.status).toBe(200);
    expect(memberListResponse.body.components).toMatchObject([
      {
        description: 'Controls for payment processing scope.',
        name: 'Payments Platform',
      },
    ]);
  });

  it('enforces required names and Project-local uniqueness across active and archived components', async () => {
    const owner = await createSignedInOwner('component-validation-owner');

    await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'vendor-risk',
    });
    await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'customer-risk',
    });

    await expect(
      createProjectComponent(owner.headers, owner.organization.slug, 'vendor-risk', { name: '' }),
    ).resolves.toMatchObject({
      body: { error: 'Project Component name is required.' },
      status: 400,
    });

    const first = await createProjectComponent(
      owner.headers,
      owner.organization.slug,
      'vendor-risk',
      { name: 'API' },
    );

    expect(first.body.component?.id).toBeTruthy();

    await expect(
      createProjectComponent(owner.headers, owner.organization.slug, 'vendor-risk', {
        name: 'API',
      }),
    ).resolves.toMatchObject({
      body: { error: 'Project Component name is already used in this Project.' },
      status: 400,
    });
    await expect(
      createProjectComponent(owner.headers, owner.organization.slug, 'customer-risk', {
        name: 'API',
      }),
    ).resolves.toMatchObject({ status: 201 });

    if (!first.body.component?.id) {
      throw new Error('Expected Project Component id.');
    }

    await setProjectComponentArchived(
      owner.headers,
      owner.organization.slug,
      'vendor-risk',
      first.body.component.id,
      'archive',
    );
    await expect(
      createProjectComponent(owner.headers, owner.organization.slug, 'vendor-risk', {
        name: 'API',
      }),
    ).resolves.toMatchObject({ status: 400 });
  });

  it('allows admins and Project Owners to manage components while blocking other members', async () => {
    const owner = await createSignedInOwner('component-access-owner');
    const admin = await addMemberToOrganization(owner.organization.id, 'component-admin', 'admin');
    const projectOwner = await addMemberToOrganization(
      owner.organization.id,
      'component-project-owner',
    );
    const member = await addMemberToOrganization(owner.organization.id, 'component-member');

    await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: projectOwner.memberId,
      slug: 'vendor-risk',
    });

    const adminCreateResponse = await createProjectComponent(
      admin.headers,
      owner.organization.slug,
      'vendor-risk',
      { name: 'Admin Managed' },
    );

    expect(adminCreateResponse.status).toBe(201);
    expect(adminCreateResponse.body.component?.id).toBeTruthy();

    if (!adminCreateResponse.body.component?.id) {
      throw new Error('Expected admin-created Project Component id.');
    }

    await expect(
      updateProjectComponent(
        projectOwner.headers,
        owner.organization.slug,
        'vendor-risk',
        adminCreateResponse.body.component.id,
        { description: 'Owned Project scope.', name: 'Project Owner Managed' },
      ),
    ).resolves.toMatchObject({
      body: { component: { description: 'Owned Project scope.', name: 'Project Owner Managed' } },
      status: 200,
    });
    await expect(
      createProjectComponent(member.headers, owner.organization.slug, 'vendor-risk', {
        name: 'Member Attempt',
      }),
    ).resolves.toMatchObject({ status: 403 });
    await expect(
      updateProjectComponent(
        member.headers,
        owner.organization.slug,
        'vendor-risk',
        adminCreateResponse.body.component.id,
        { name: 'Member Edit' },
      ),
    ).resolves.toMatchObject({ status: 403 });
  });

  it('archives and restores Project Components without losing archived data', async () => {
    const owner = await createSignedInOwner('component-archive-owner');
    const member = await addMemberToOrganization(owner.organization.id, 'component-archive-member');

    await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'vendor-risk',
    });
    const createResponse = await createProjectComponent(
      owner.headers,
      owner.organization.slug,
      'vendor-risk',
      { description: 'Archived scope.', name: 'Legacy App' },
    );

    if (!createResponse.body.component?.id) {
      throw new Error('Expected Project Component id.');
    }

    await expect(
      setProjectComponentArchived(
        member.headers,
        owner.organization.slug,
        'vendor-risk',
        createResponse.body.component.id,
        'archive',
      ),
    ).resolves.toMatchObject({ status: 403 });

    const archiveResponse = await setProjectComponentArchived(
      owner.headers,
      owner.organization.slug,
      'vendor-risk',
      createResponse.body.component.id,
      'archive',
    );

    expect(archiveResponse.status).toBe(200);
    expect(archiveResponse.body.component).toMatchObject({
      description: 'Archived scope.',
      name: 'Legacy App',
    });
    expect(archiveResponse.body.component?.archivedAt).toBeTruthy();
    await expect(
      requestProjectComponents(owner.headers, owner.organization.slug, 'vendor-risk'),
    ).resolves.toMatchObject({ body: { components: [] }, status: 200 });
    await expect(
      requestProjectComponents(owner.headers, owner.organization.slug, 'vendor-risk', 'archived'),
    ).resolves.toMatchObject({
      body: { components: [{ description: 'Archived scope.', name: 'Legacy App' }] },
      status: 200,
    });

    await expect(
      setProjectComponentArchived(
        member.headers,
        owner.organization.slug,
        'vendor-risk',
        createResponse.body.component.id,
        'restore',
      ),
    ).resolves.toMatchObject({ status: 403 });

    const restoreResponse = await setProjectComponentArchived(
      owner.headers,
      owner.organization.slug,
      'vendor-risk',
      createResponse.body.component.id,
      'restore',
    );

    expect(restoreResponse.status).toBe(200);
    expect(restoreResponse.body.component).toMatchObject({ archivedAt: null, name: 'Legacy App' });
  });
});
