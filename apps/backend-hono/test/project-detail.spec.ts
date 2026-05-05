import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '../src/db/client';
import { members, projectAssignments, projects, users } from '../src/db/schema';
import { auth } from '../src/lib/auth';
import { callTRPC } from './trpc-test-utils';

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
  projectOwnerAssignmentMemberId: string | null;
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
    createdAt: now,
    updatedAt: now,
  });

  if (input.projectOwnerAssignmentMemberId) {
    await db.insert(projectAssignments).values({
      createdAt: now,
      id: crypto.randomUUID(),
      organizationMemberId: input.projectOwnerAssignmentMemberId,
      projectId: id,
      role: 'project_owner',
      updatedAt: now,
    });
  }

  return id;
}

async function getProjectDetail(headers: Headers, organizationSlug: string, projectSlug: string) {
  return callTRPC(headers, (caller) => caller.projects.detail({ organizationSlug, projectSlug }));
}

async function updateProject(
  headers: Headers,
  organizationSlug: string,
  projectSlug: string,
  body: Record<string, unknown>,
) {
  return callTRPC(headers, (caller) =>
    caller.projects.update({ ...body, organizationSlug, projectSlug } as never),
  );
}

describe('Project detail API', () => {
  it('requires authentication', async () => {
    const response = await callTRPC(undefined, (caller) =>
      caller.projects.detail({ organizationSlug: 'acme', projectSlug: 'vendor-risk' }),
    );

    expect(response.status).toBe(401);
  });

  it('loads a Project by organization-local slug for assigned Organization members', async () => {
    const owner = await createSignedInOwner('project-detail-owner');
    const member = await addMemberToOrganization(owner.organization.id, 'project-detail-member');

    await createProject({
      organizationId: owner.organization.id,
      projectOwnerAssignmentMemberId: member.memberId,
      slug: 'vendor-risk',
    });

    const response = await getProjectDetail(member.headers, owner.organization.slug, 'vendor-risk');

    expect(response.status).toBe(200);
    expect(response.body.project).toMatchObject({
      name: 'Vendor Risk Review',
      description: 'Governance work for reviewing critical vendor risk.',
      slug: 'vendor-risk',
      projectOwner: {
        email: member.credentials.email,
        name: member.credentials.name,
        role: 'member',
      },
    });
    expect(response.body.project?.createdAt).toBeTruthy();
    expect(response.body.project?.archivedAt).toBeNull();
  });

  it('keeps archived Project detail URLs reachable for assigned Organization members', async () => {
    const owner = await createSignedInOwner('project-detail-archived-owner');
    const member = await addMemberToOrganization(
      owner.organization.id,
      'project-detail-archived-member',
    );
    const projectId = await createProject({
      organizationId: owner.organization.id,
      projectOwnerAssignmentMemberId: member.memberId,
      slug: 'archived-project',
    });
    const archivedAt = new Date();

    await db.update(projects).set({ archivedAt }).where(eq(projects.id, projectId));

    const response = await getProjectDetail(
      member.headers,
      owner.organization.slug,
      'archived-project',
    );

    expect(response.status).toBe(200);
    expect(response.body.project).toMatchObject({
      archivedAt: archivedAt.toISOString(),
      slug: 'archived-project',
    });
  });

  it('hides missing, inaccessible, and wrong-Organization Projects behind not found', async () => {
    const owner = await createSignedInOwner('project-detail-hidden-owner');
    const outsider = await createSignedInOwner('project-detail-outsider');

    await createProject({
      organizationId: owner.organization.id,
      projectOwnerAssignmentMemberId: null,
      slug: 'internal-controls',
    });

    await expect(
      getProjectDetail(owner.headers, owner.organization.slug, 'missing-project'),
    ).resolves.toMatchObject({ body: { status: 'unavailable' }, status: 200 });
    await expect(
      getProjectDetail(outsider.headers, owner.organization.slug, 'internal-controls'),
    ).resolves.toMatchObject({ body: { status: 'unavailable' }, status: 200 });
    await expect(
      getProjectDetail(outsider.headers, outsider.organization.slug, 'internal-controls'),
    ).resolves.toMatchObject({ body: { status: 'unavailable' }, status: 200 });
  });

  it('hides direct Project URLs from unassigned regular Organization members', async () => {
    const owner = await createSignedInOwner('project-detail-unassigned-owner');
    const member = await addMemberToOrganization(owner.organization.id, 'project-detail-unassigned');

    await createProject({
      organizationId: owner.organization.id,
      projectOwnerAssignmentMemberId: null,
      slug: 'unassigned-project',
    });

    await expect(
      getProjectDetail(member.headers, owner.organization.slug, 'unassigned-project'),
    ).resolves.toMatchObject({ body: { status: 'unavailable' }, status: 200 });
    await expect(
      getProjectDetail(owner.headers, owner.organization.slug, 'unassigned-project'),
    ).resolves.toMatchObject({
      body: { project: { slug: 'unassigned-project' }, status: 'available' },
      status: 200,
    });
  });

  it('lets Organization owners edit Project settings without changing the slug', async () => {
    const owner = await createSignedInOwner('project-settings-owner');

    await createProject({
      organizationId: owner.organization.id,
      projectOwnerAssignmentMemberId: null,
      slug: 'vendor-risk',
    });

    const response = await updateProject(owner.headers, owner.organization.slug, 'vendor-risk', {
      description: 'Updated governance work for critical vendor risk.',
      name: 'Critical Vendor Risk',
      slug: 'ignored-new-slug',
    });

    expect(response.status).toBe(200);
    expect(response.body.project).toMatchObject({
      description: 'Updated governance work for critical vendor risk.',
      name: 'Critical Vendor Risk',
      projectOwner: null,
      slug: 'vendor-risk',
    });

    const renamedProject = await getProjectDetail(
      owner.headers,
      owner.organization.slug,
      'vendor-risk',
    );

    expect(renamedProject.status).toBe(200);
    expect(renamedProject.body.project?.slug).toBe('vendor-risk');
  });

  it('prevents members from mutating Project settings', async () => {
    const owner = await createSignedInOwner('project-settings-readonly-owner');
    const member = await addMemberToOrganization(
      owner.organization.id,
      'project-settings-readonly',
    );

    await createProject({
      organizationId: owner.organization.id,
      projectOwnerAssignmentMemberId: owner.member.id,
      slug: 'vendor-risk',
    });

    const response = await updateProject(member.headers, owner.organization.slug, 'vendor-risk', {
      description: 'Member mutation attempt.',
      name: 'Member Mutation',
    });

    expect(response.status).toBe(403);

    const project = await getProjectDetail(owner.headers, owner.organization.slug, 'vendor-risk');

    expect(project.body.project).toMatchObject({
      description: 'Governance work for reviewing critical vendor risk.',
      name: 'Vendor Risk Review',
    });
  });

  it('validates Project settings updates', async () => {
    const owner = await createSignedInOwner('project-settings-validation-owner');

    await createProject({
      organizationId: owner.organization.id,
      projectOwnerAssignmentMemberId: null,
      slug: 'vendor-risk',
    });

    await expect(
      updateProject(owner.headers, owner.organization.slug, 'vendor-risk', {
        description: '',
        name: 'Missing Description',
      }),
    ).resolves.toMatchObject({
      body: { error: 'Project description is required.' },
      status: 400,
    });
  });
});
