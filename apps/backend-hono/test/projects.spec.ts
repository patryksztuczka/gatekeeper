import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '../src/db/client';
import { auditEvents, members, projects, users } from '../src/db/schema';
import { auth } from '../src/lib/auth';
import { callTRPC } from './trpc-test-utils';

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
  return callTRPC(
    headers,
    (caller) => caller.projects.create({ ...body, organizationSlug } as never),
    201,
  );
}

async function archiveProjectRequest(
  organizationSlug: string,
  projectSlug: string,
  headers: Headers,
) {
  return callTRPC(headers, (caller) => caller.projects.archive({ organizationSlug, projectSlug }));
}

async function restoreProjectRequest(
  organizationSlug: string,
  projectSlug: string,
  headers: Headers,
) {
  return callTRPC(headers, (caller) => caller.projects.restore({ organizationSlug, projectSlug }));
}

async function listProjectsRequest(
  organizationSlug: string,
  headers: Headers,
  status: 'active' | 'archived' = 'active',
) {
  return callTRPC(headers, (caller) => caller.projects.list({ organizationSlug, status }));
}

async function listOrganizationMembersRequest(organizationSlug: string, headers: Headers) {
  return callTRPC(headers, (caller) => caller.organizations.members({ organizationSlug }));
}

async function listAuditEventsRequest(organizationSlug: string, headers: Headers) {
  return callTRPC(headers, (caller) => caller.auditLog.list({ organizationSlug }));
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

    const listResponse = await listProjectsRequest(organization.slug, headers);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toMatchObject({
      projects: [
        {
          name: 'SOC 2 Readiness',
          slug: 'soc-2-readiness',
        },
      ],
    });
  });

  it('records an Audit Event when an Organization owner creates a Project', async () => {
    const { headers, organization } = await createSignedInOwner('project-audit-owner');
    const ownerMembership = await db
      .select({ id: members.id, userId: members.userId })
      .from(members)
      .where(eq(members.organizationId, organization.id))
      .limit(1)
      .then((rows) => rows[0]);

    expect(ownerMembership?.id).toBeTruthy();

    if (!ownerMembership?.id) {
      throw new Error('Expected an owner membership.');
    }

    const createResponse = await createProjectRequest(organization.slug, headers, {
      description: 'Governance launch work.',
      name: 'Governance Launch',
      projectOwnerMemberId: ownerMembership.id,
      slug: 'governance-launch',
    });

    expect(createResponse.status).toBe(201);

    const [auditEvent] = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.organizationId, organization.id),
          eq(auditEvents.action, 'project.created'),
        ),
      );

    expect(auditEvent).toMatchObject({
      actorOrganizationMemberId: ownerMembership.id,
      actorType: 'organization_member',
      actorUserId: ownerMembership.userId,
      organizationId: organization.id,
      targetDisplayName: 'Governance Launch',
      targetId: createResponse.body.project.id,
      targetSecondaryLabel: 'governance-launch',
      targetType: 'project',
    });
    expect(auditEvent?.id).toBeTruthy();
    expect(auditEvent?.occurredAt).toBeInstanceOf(Date);
  });

  it('lets Organization owners list their Organization Audit Events', async () => {
    const { headers, organization } = await createSignedInOwner('project-audit-list-owner');

    const createResponse = await createProjectRequest(organization.slug, headers, {
      description: 'Audit list work.',
      name: 'Audit List Project',
      slug: 'audit-list-project',
    });

    expect(createResponse.status).toBe(201);

    const listResponse = await listAuditEventsRequest(organization.slug, headers);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toMatchObject({
      auditEvents: [
        {
          action: 'project.created',
          actorType: 'organization_member',
          targetDisplayName: 'Audit List Project',
          targetId: createResponse.body.project.id,
          targetSecondaryLabel: 'audit-list-project',
          targetType: 'project',
        },
      ],
    });
  });

  it('prevents regular Organization Members from listing Audit Events', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner(
      'project-audit-member-owner',
    );
    const member = createCredentials('project-audit-member');

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
      description: 'Private audit history.',
      name: 'Private Audit Project',
      slug: 'private-audit-project',
    });

    const listResponse = await listAuditEventsRequest(organization.slug, memberHeaders);

    expect(listResponse.status).toBe(403);
    expect(listResponse.body).toMatchObject({
      error: 'Only Organization owners and admins can view the Audit Log.',
    });
  });

  it('records an Audit Event when an Organization owner archives a Project', async () => {
    const { headers, organization } = await createSignedInOwner('project-audit-archive-owner');

    const createResponse = await createProjectRequest(organization.slug, headers, {
      description: 'Archive audit work.',
      name: 'Archive Audit Project',
      slug: 'archive-audit-project',
    });

    expect(createResponse.status).toBe(201);

    const archiveResponse = await archiveProjectRequest(
      organization.slug,
      'archive-audit-project',
      headers,
    );

    expect(archiveResponse.status).toBe(200);

    const listResponse = await listAuditEventsRequest(organization.slug, headers);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'project.archived',
          actorType: 'organization_member',
          targetDisplayName: 'Archive Audit Project',
          targetId: createResponse.body.project.id,
          targetSecondaryLabel: 'archive-audit-project',
          targetType: 'project',
        }),
      ]),
    );
  });

  it('records an Audit Event when an Organization owner restores a Project', async () => {
    const { headers, organization } = await createSignedInOwner('project-audit-restore-owner');

    const createResponse = await createProjectRequest(organization.slug, headers, {
      description: 'Restore audit work.',
      name: 'Restore Audit Project',
      slug: 'restore-audit-project',
    });

    expect(createResponse.status).toBe(201);

    await archiveProjectRequest(organization.slug, 'restore-audit-project', headers);

    const restoreResponse = await restoreProjectRequest(
      organization.slug,
      'restore-audit-project',
      headers,
    );

    expect(restoreResponse.status).toBe(200);

    const listResponse = await listAuditEventsRequest(organization.slug, headers);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'project.restored',
          actorType: 'organization_member',
          targetDisplayName: 'Restore Audit Project',
          targetId: createResponse.body.project.id,
          targetSecondaryLabel: 'restore-audit-project',
          targetType: 'project',
        }),
      ]),
    );
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
    const listResponse = await listProjectsRequest(organization.slug, memberHeaders);

    expect(forbiddenCreateResponse.status).toBe(403);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toMatchObject({
      projects: [{ slug: 'vendor-review' }],
    });
  });

  it('allows accepted Organization members to be assigned as Project Owner', async () => {
    const { headers: ownerHeaders, organization } =
      await createSignedInOwner('project-invite-owner');
    const member = createCredentials('project-invite-member');

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

    const membersResponse = await listOrganizationMembersRequest(organization.slug, ownerHeaders);
    const projectOwner = membersResponse.body.members.find(
      (organizationMember: { email: string }) => organizationMember.email === member.email,
    ) as { id: string } | undefined;

    expect(projectOwner?.id).toBeTruthy();

    const createResponse = await createProjectRequest(organization.slug, ownerHeaders, {
      description: 'Project owned by an invited Organization member.',
      name: 'Invited Owner',
      projectOwnerMemberId: projectOwner?.id,
      slug: 'invited-owner',
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.project).toMatchObject({
      projectOwner: {
        email: member.email,
        id: projectOwner?.id,
      },
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

  it('lets Organization owners archive and restore Projects from active and archived lists', async () => {
    const { headers, organization } = await createSignedInOwner('project-archive-owner');

    await createProjectRequest(organization.slug, headers, {
      description: 'Archive-ready governance work.',
      name: 'Archive Ready',
      slug: 'archive-ready',
    });

    const archiveResponse = await archiveProjectRequest(
      organization.slug,
      'archive-ready',
      headers,
    );

    expect(archiveResponse.status).toBe(200);
    expect(archiveResponse.body.project).toMatchObject({ slug: 'archive-ready' });
    expect((archiveResponse.body.project as { archivedAt?: string }).archivedAt).toBeTruthy();

    await expect(listProjectsRequest(organization.slug, headers)).resolves.toMatchObject({
      body: { projects: [] },
      status: 200,
    });
    await expect(
      listProjectsRequest(organization.slug, headers, 'archived'),
    ).resolves.toMatchObject({
      body: { projects: [{ slug: 'archive-ready' }] },
      status: 200,
    });

    const restoreResponse = await restoreProjectRequest(
      organization.slug,
      'archive-ready',
      headers,
    );

    expect(restoreResponse.status).toBe(200);
    expect(restoreResponse.body.project).toMatchObject({
      archivedAt: null,
      slug: 'archive-ready',
    });
    await expect(listProjectsRequest(organization.slug, headers)).resolves.toMatchObject({
      body: { projects: [{ slug: 'archive-ready' }] },
      status: 200,
    });
  });

  it('prevents members from archiving and restoring Projects while allowing archived list access', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner(
      'project-archive-member-owner',
    );
    const member = createCredentials('project-archive-member');

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
      description: 'Member-visible archived work.',
      name: 'Member Visible',
      slug: 'member-visible',
    });

    await expect(
      archiveProjectRequest(organization.slug, 'member-visible', memberHeaders),
    ).resolves.toMatchObject({ status: 403 });

    await archiveProjectRequest(organization.slug, 'member-visible', ownerHeaders);

    await expect(
      listProjectsRequest(organization.slug, memberHeaders, 'archived'),
    ).resolves.toMatchObject({
      body: { projects: [{ slug: 'member-visible' }] },
      status: 200,
    });
    await expect(
      restoreProjectRequest(organization.slug, 'member-visible', memberHeaders),
    ).resolves.toMatchObject({ status: 403 });
  });
});
