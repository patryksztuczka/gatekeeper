import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '../src/db/client';
import { auditEvents, members, projectAssignments, projects, users } from '../src/db/schema';
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

async function createProjectAssignmentRequest(
  organizationSlug: string,
  projectSlug: string,
  headers: Headers,
  body: {
    organizationMemberId: string;
    role: 'project_contributor' | 'project_owner';
  },
) {
  return callTRPC(
    headers,
    (caller) => caller.projects.createAssignment({ ...body, organizationSlug, projectSlug }),
    201,
  );
}

async function updateProjectAssignmentRequest(
  organizationSlug: string,
  projectSlug: string,
  headers: Headers,
  body: {
    assignmentId: string;
    role: 'project_contributor' | 'project_owner';
  },
) {
  return callTRPC(headers, (caller) =>
    caller.projects.updateAssignment({ ...body, organizationSlug, projectSlug }),
  );
}

async function removeProjectAssignmentRequest(
  organizationSlug: string,
  projectSlug: string,
  headers: Headers,
  assignmentId: string,
) {
  return callTRPC(headers, (caller) =>
    caller.projects.removeAssignment({ assignmentId, organizationSlug, projectSlug }),
  );
}

async function listProjectAssignmentsRequest(
  organizationSlug: string,
  projectSlug: string,
  headers: Headers,
) {
  return callTRPC(headers, (caller) =>
    caller.projects.assignments({ organizationSlug, projectSlug }),
  );
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

async function listAuditEventsRequest(
  organizationSlug: string,
  headers: Headers,
  filters?: {
    action?: string;
    limit?: number;
    offset?: number;
    targetId?: string;
    targetType?: string;
  },
) {
  return callTRPC(headers, (caller) =>
    caller.auditLog.list({
      organizationSlug,
      ...filters,
    }),
  );
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

  it('filters and bounds Organization Audit Events for read clients', async () => {
    const { headers, organization } = await createSignedInOwner('project-audit-filter-owner');

    const firstProjectResponse = await createProjectRequest(organization.slug, headers, {
      description: 'First audit filter work.',
      name: 'First Audit Filter Project',
      slug: 'first-audit-filter-project',
    });
    const secondProjectResponse = await createProjectRequest(organization.slug, headers, {
      description: 'Second audit filter work.',
      name: 'Second Audit Filter Project',
      slug: 'second-audit-filter-project',
    });

    expect(firstProjectResponse.status).toBe(201);
    expect(secondProjectResponse.status).toBe(201);

    const targetFilteredResponse = await listAuditEventsRequest(organization.slug, headers, {
      targetId: firstProjectResponse.body.project.id,
      targetType: 'project',
    });
    const limitedResponse = await listAuditEventsRequest(organization.slug, headers, {
      action: 'project.created',
      limit: 1,
    });
    const offsetResponse = await listAuditEventsRequest(organization.slug, headers, {
      action: 'project.created',
      limit: 1,
      offset: 1,
    });

    expect(targetFilteredResponse.status).toBe(200);
    expect(targetFilteredResponse.body.auditEvents).toEqual([
      expect.objectContaining({
        action: 'project.created',
        targetId: firstProjectResponse.body.project.id,
        targetType: 'project',
      }),
    ]);
    expect(limitedResponse.body.auditEvents).toHaveLength(1);
    expect(limitedResponse.body.auditEvents[0]).toMatchObject({
      action: 'project.created',
      targetId: secondProjectResponse.body.project.id,
    });
    expect(offsetResponse.body.auditEvents).toHaveLength(1);
    expect(offsetResponse.body.auditEvents[0]).toMatchObject({
      action: 'project.created',
      targetId: firstProjectResponse.body.project.id,
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

  it('records Audit Deltas when an Organization owner updates Project settings', async () => {
    const { headers, organization } = await createSignedInOwner('project-audit-update-owner');
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
      description: 'Initial governance work.',
      name: 'Initial Project Name',
      slug: 'initial-project-name',
    });

    expect(createResponse.status).toBe(201);

    const updateResponse = await callTRPC(headers, (caller) =>
      caller.projects.update({
        description: 'Updated governance work.',
        name: 'Updated Project Name',
        organizationSlug: organization.slug,
        projectOwnerMemberId: ownerMembership.id,
        projectSlug: 'initial-project-name',
      }),
    );

    expect(updateResponse.status).toBe(200);

    const listResponse = await listAuditEventsRequest(organization.slug, headers);
    const updateAuditEvent = listResponse.body.auditEvents.find(
      (auditEvent: { action: string }) => auditEvent.action === 'project.updated',
    ) as { actorDisplayName: string; actorEmail: string; metadata: unknown } | undefined;

    expect(updateAuditEvent).toMatchObject({
      actorDisplayName: 'project-audit-update-owner user',
      actorEmail: expect.stringContaining('project-audit-update-owner-'),
    });
    expect(updateAuditEvent?.metadata).toMatchObject({
      changes: {
        description: {
          from: 'Initial governance work.',
          to: 'Updated governance work.',
        },
        name: {
          from: 'Initial Project Name',
          to: 'Updated Project Name',
        },
        projectOwner: {
          from: null,
          to: {
            displayName: 'project-audit-update-owner user',
            email: expect.stringContaining('project-audit-update-owner-'),
            organizationMemberId: ownerMembership.id,
          },
        },
      },
    });
  });

  it('prevents members from creating Projects but allows them to list visible active Projects', async () => {
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
      projects: [],
    });
  });

  it('lists only assigned active Projects for regular Organization members', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner(
      'project-assigned-list-owner',
    );
    const member = createCredentials('project-assigned-list-member');

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
    const assignedMember = membersResponse.body.members.find(
      (organizationMember: { email: string }) => organizationMember.email === member.email,
    ) as { id: string } | undefined;

    expect(assignedMember?.id).toBeTruthy();

    await createProjectRequest(organization.slug, ownerHeaders, {
      description: 'Assigned governance work.',
      name: 'Assigned Project',
      projectOwnerMemberId: assignedMember?.id,
      slug: 'assigned-project',
    });
    await createProjectRequest(organization.slug, ownerHeaders, {
      description: 'Unassigned governance work.',
      name: 'Unassigned Project',
      slug: 'unassigned-project',
    });

    await expect(listProjectsRequest(organization.slug, ownerHeaders)).resolves.toMatchObject({
      body: {
        projects: [{ slug: 'assigned-project' }, { slug: 'unassigned-project' }],
      },
      status: 200,
    });
    await expect(listProjectsRequest(organization.slug, memberHeaders)).resolves.toMatchObject({
      body: { projects: [{ slug: 'assigned-project' }] },
      status: 200,
    });
  });

  it('derives Project Owner summaries from Project Assignments in Project lists', async () => {
    const { headers, organization } = await createSignedInOwner('project-assignment-owner');
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

    const now = new Date();
    const projectId = crypto.randomUUID();

    await db.insert(projects).values({
      createdAt: now,
      description: 'Assignment-derived accountability.',
      id: projectId,
      name: 'Assignment Owner',
      organizationId: organization.id,
      projectOwnerMemberId: null,
      slug: 'assignment-owner',
      updatedAt: now,
    });
    await db.insert(projectAssignments).values({
      createdAt: now,
      id: crypto.randomUUID(),
      organizationMemberId: ownerMembership.id,
      projectId,
      role: 'project_owner',
      updatedAt: now,
    });

    await expect(listProjectsRequest(organization.slug, headers)).resolves.toMatchObject({
      body: {
        projects: [
          {
            projectOwner: {
              id: ownerMembership.id,
            },
            slug: 'assignment-owner',
          },
        ],
      },
      status: 200,
    });
  });

  it('lets Organization owners assign Contributors to make Projects visible', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner(
      'project-assignment-create-owner',
    );
    const member = createCredentials('project-assignment-create-member');

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
    const assignedMember = membersResponse.body.members.find(
      (organizationMember: { email: string }) => organizationMember.email === member.email,
    ) as { id: string } | undefined;

    expect(assignedMember?.id).toBeTruthy();

    await createProjectRequest(organization.slug, ownerHeaders, {
      description: 'Assignment-managed governance work.',
      name: 'Assignment Managed',
      slug: 'assignment-managed',
    });

    await expect(listProjectsRequest(organization.slug, memberHeaders)).resolves.toMatchObject({
      body: { projects: [] },
      status: 200,
    });

    const assignmentResponse = await createProjectAssignmentRequest(
      organization.slug,
      'assignment-managed',
      ownerHeaders,
      {
        organizationMemberId: assignedMember?.id ?? '',
        role: 'project_contributor',
      },
    );

    expect(assignmentResponse.status).toBe(201);
    expect(assignmentResponse.body.assignment).toMatchObject({
      organizationMemberId: assignedMember?.id,
      role: 'project_contributor',
    });
    await expect(listProjectsRequest(organization.slug, memberHeaders)).resolves.toMatchObject({
      body: { projects: [{ slug: 'assignment-managed' }] },
      status: 200,
    });
  });

  it('rejects duplicate Project Assignments for the same Organization Member', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner(
      'project-assignment-duplicate-owner',
    );
    const ownerMembership = await db
      .select({ id: members.id })
      .from(members)
      .where(eq(members.organizationId, organization.id))
      .limit(1)
      .then((rows) => rows[0]);

    expect(ownerMembership?.id).toBeTruthy();

    if (!ownerMembership?.id) {
      throw new Error('Expected owner membership.');
    }

    await createProjectRequest(organization.slug, ownerHeaders, {
      description: 'Duplicate assignment governance work.',
      name: 'Duplicate Assignment',
      slug: 'duplicate-assignment',
    });

    const firstAssignment = await createProjectAssignmentRequest(
      organization.slug,
      'duplicate-assignment',
      ownerHeaders,
      {
        organizationMemberId: ownerMembership.id,
        role: 'project_contributor',
      },
    );
    const duplicateAssignment = await createProjectAssignmentRequest(
      organization.slug,
      'duplicate-assignment',
      ownerHeaders,
      {
        organizationMemberId: ownerMembership.id,
        role: 'project_owner',
      },
    );

    expect(firstAssignment.status).toBe(201);
    expect(duplicateAssignment.status).toBe(400);
    expect(duplicateAssignment.body).toMatchObject({
      error: 'Organization Member already has a Project Assignment for this Project.',
    });
  });

  it('rejects Project Assignment changes while the Project is archived', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner(
      'project-assignment-archived-owner',
    );
    const ownerMembership = await db
      .select({ id: members.id })
      .from(members)
      .where(eq(members.organizationId, organization.id))
      .limit(1)
      .then((rows) => rows[0]);

    expect(ownerMembership?.id).toBeTruthy();

    if (!ownerMembership?.id) {
      throw new Error('Expected owner membership.');
    }

    await createProjectRequest(organization.slug, ownerHeaders, {
      description: 'Archived assignment governance work.',
      name: 'Archived Assignment',
      slug: 'archived-assignment',
    });
    const assignmentResponse = await createProjectAssignmentRequest(
      organization.slug,
      'archived-assignment',
      ownerHeaders,
      {
        organizationMemberId: ownerMembership.id,
        role: 'project_contributor',
      },
    );

    expect(assignmentResponse.status).toBe(201);

    await archiveProjectRequest(organization.slug, 'archived-assignment', ownerHeaders);

    await expect(
      createProjectAssignmentRequest(organization.slug, 'archived-assignment', ownerHeaders, {
        organizationMemberId: ownerMembership.id,
        role: 'project_owner',
      }),
    ).resolves.toMatchObject({
      body: { error: 'Project Assignments cannot be changed while a Project is archived.' },
      status: 400,
    });
    await expect(
      updateProjectAssignmentRequest(organization.slug, 'archived-assignment', ownerHeaders, {
        assignmentId: assignmentResponse.body.assignment.id,
        role: 'project_owner',
      }),
    ).resolves.toMatchObject({
      body: { error: 'Project Assignments cannot be changed while a Project is archived.' },
      status: 400,
    });
    await expect(
      removeProjectAssignmentRequest(
        organization.slug,
        'archived-assignment',
        ownerHeaders,
        assignmentResponse.body.assignment.id,
      ),
    ).resolves.toMatchObject({
      body: { error: 'Project Assignments cannot be changed while a Project is archived.' },
      status: 400,
    });
  });

  it('prevents regular Organization members from managing Project Assignments', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner(
      'project-assignment-permission-owner',
    );
    const member = createCredentials('project-assignment-permission-member');

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
    const assignedMember = membersResponse.body.members.find(
      (organizationMember: { email: string }) => organizationMember.email === member.email,
    ) as { id: string } | undefined;

    expect(assignedMember?.id).toBeTruthy();

    await createProjectRequest(organization.slug, ownerHeaders, {
      description: 'Assignment permission governance work.',
      name: 'Assignment Permission',
      slug: 'assignment-permission',
    });
    const assignmentResponse = await createProjectAssignmentRequest(
      organization.slug,
      'assignment-permission',
      ownerHeaders,
      {
        organizationMemberId: assignedMember?.id ?? '',
        role: 'project_contributor',
      },
    );

    expect(assignmentResponse.status).toBe(201);

    await expect(
      createProjectAssignmentRequest(organization.slug, 'assignment-permission', memberHeaders, {
        organizationMemberId: assignedMember?.id ?? '',
        role: 'project_owner',
      }),
    ).resolves.toMatchObject({
      body: { error: 'Only Organization owners and admins can create Project Assignments.' },
      status: 403,
    });
    await expect(
      updateProjectAssignmentRequest(organization.slug, 'assignment-permission', memberHeaders, {
        assignmentId: assignmentResponse.body.assignment.id,
        role: 'project_owner',
      }),
    ).resolves.toMatchObject({
      body: { error: 'Only Organization owners and admins can change Project Assignments.' },
      status: 403,
    });
    await expect(
      removeProjectAssignmentRequest(
        organization.slug,
        'assignment-permission',
        memberHeaders,
        assignmentResponse.body.assignment.id,
      ),
    ).resolves.toMatchObject({
      body: { error: 'Only Organization owners and admins can remove Project Assignments.' },
      status: 403,
    });
  });

  it('lists the Project Assignment roster for owners but not Contributors', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner(
      'project-assignment-roster-owner',
    );
    const member = createCredentials('project-assignment-roster-member');

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
    const assignedMember = membersResponse.body.members.find(
      (organizationMember: { email: string }) => organizationMember.email === member.email,
    ) as { id: string } | undefined;

    expect(assignedMember?.id).toBeTruthy();

    await createProjectRequest(organization.slug, ownerHeaders, {
      description: 'Assignment roster governance work.',
      name: 'Assignment Roster',
      slug: 'assignment-roster',
    });
    const assignmentResponse = await createProjectAssignmentRequest(
      organization.slug,
      'assignment-roster',
      ownerHeaders,
      {
        organizationMemberId: assignedMember?.id ?? '',
        role: 'project_contributor',
      },
    );

    expect(assignmentResponse.status).toBe(201);

    await expect(
      listProjectAssignmentsRequest(organization.slug, 'assignment-roster', ownerHeaders),
    ).resolves.toMatchObject({
      body: {
        assignments: [
          {
            email: member.email,
            id: assignmentResponse.body.assignment.id,
            organizationMemberId: assignedMember?.id,
            role: 'project_contributor',
          },
        ],
      },
      status: 200,
    });
    await expect(
      listProjectAssignmentsRequest(organization.slug, 'assignment-roster', memberHeaders),
    ).resolves.toMatchObject({
      body: { error: 'Only Organization owners and admins can view Project Assignments.' },
      status: 403,
    });
  });

  it('lets Organization owners change a Contributor assignment to Project Owner', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner(
      'project-assignment-role-owner',
    );
    const member = createCredentials('project-assignment-role-member');

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
    const assignedMember = membersResponse.body.members.find(
      (organizationMember: { email: string }) => organizationMember.email === member.email,
    ) as { id: string } | undefined;

    expect(assignedMember?.id).toBeTruthy();

    await createProjectRequest(organization.slug, ownerHeaders, {
      description: 'Assignment role governance work.',
      name: 'Assignment Role',
      slug: 'assignment-role',
    });
    const assignmentResponse = await createProjectAssignmentRequest(
      organization.slug,
      'assignment-role',
      ownerHeaders,
      {
        organizationMemberId: assignedMember?.id ?? '',
        role: 'project_contributor',
      },
    );

    expect(assignmentResponse.status).toBe(201);

    const updateResponse = await updateProjectAssignmentRequest(
      organization.slug,
      'assignment-role',
      ownerHeaders,
      {
        assignmentId: assignmentResponse.body.assignment.id,
        role: 'project_owner',
      },
    );

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.assignment).toMatchObject({
      id: assignmentResponse.body.assignment.id,
      role: 'project_owner',
    });
    await expect(listProjectsRequest(organization.slug, memberHeaders)).resolves.toMatchObject({
      body: {
        projects: [
          {
            projectOwner: {
              email: member.email,
              id: assignedMember?.id,
            },
            slug: 'assignment-role',
          },
        ],
      },
      status: 200,
    });
  });

  it('demotes the previous Project Owner when a new Project Owner is assigned', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner(
      'project-owner-replacement-owner',
    );
    const firstProjectOwner = await db
      .select({ id: members.id })
      .from(members)
      .where(eq(members.organizationId, organization.id))
      .limit(1)
      .then((rows) => rows[0]);
    const nextOwner = createCredentials('project-owner-replacement-next');

    expect(firstProjectOwner?.id).toBeTruthy();

    if (!firstProjectOwner?.id) {
      throw new Error('Expected first Project Owner membership.');
    }

    await signUpUser(nextOwner);

    const invitation = await auth.api.createInvitation({
      body: {
        email: nextOwner.email,
        organizationId: organization.id,
        role: 'member',
      },
      headers: ownerHeaders,
    });
    const nextOwnerHeaders = await signInUser(nextOwner);

    await auth.api.acceptInvitation({
      body: { invitationId: invitation.id },
      headers: nextOwnerHeaders,
    });

    const membersResponse = await listOrganizationMembersRequest(organization.slug, ownerHeaders);
    const nextOwnerMember = membersResponse.body.members.find(
      (organizationMember: { email: string }) => organizationMember.email === nextOwner.email,
    ) as { id: string } | undefined;

    expect(nextOwnerMember?.id).toBeTruthy();

    await createProjectRequest(organization.slug, ownerHeaders, {
      description: 'Owner replacement governance work.',
      name: 'Owner Replacement',
      projectOwnerMemberId: firstProjectOwner.id,
      slug: 'owner-replacement',
    });

    const nextOwnerAssignment = await createProjectAssignmentRequest(
      organization.slug,
      'owner-replacement',
      ownerHeaders,
      {
        organizationMemberId: nextOwnerMember?.id ?? '',
        role: 'project_owner',
      },
    );

    expect(nextOwnerAssignment.status).toBe(201);

    const assignments = await db
      .select({
        organizationMemberId: projectAssignments.organizationMemberId,
        role: projectAssignments.role,
      })
      .from(projectAssignments)
      .innerJoin(projects, eq(projectAssignments.projectId, projects.id))
      .where(and(eq(projects.organizationId, organization.id), eq(projects.slug, 'owner-replacement')));

    expect(assignments).toEqual(
      expect.arrayContaining([
        { organizationMemberId: firstProjectOwner.id, role: 'project_contributor' },
        { organizationMemberId: nextOwnerMember?.id, role: 'project_owner' },
      ]),
    );
    await expect(listProjectsRequest(organization.slug, ownerHeaders)).resolves.toMatchObject({
      body: {
        projects: [
          {
            projectOwner: {
              email: nextOwner.email,
              id: nextOwnerMember?.id,
            },
            slug: 'owner-replacement',
          },
        ],
      },
      status: 200,
    });
  });

  it('lets Organization owners remove Project Assignments to revoke visibility', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner(
      'project-assignment-remove-owner',
    );
    const member = createCredentials('project-assignment-remove-member');

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
    const assignedMember = membersResponse.body.members.find(
      (organizationMember: { email: string }) => organizationMember.email === member.email,
    ) as { id: string } | undefined;

    expect(assignedMember?.id).toBeTruthy();

    await createProjectRequest(organization.slug, ownerHeaders, {
      description: 'Assignment removal governance work.',
      name: 'Assignment Removal',
      slug: 'assignment-removal',
    });
    const assignmentResponse = await createProjectAssignmentRequest(
      organization.slug,
      'assignment-removal',
      ownerHeaders,
      {
        organizationMemberId: assignedMember?.id ?? '',
        role: 'project_contributor',
      },
    );

    expect(assignmentResponse.status).toBe(201);
    await expect(listProjectsRequest(organization.slug, memberHeaders)).resolves.toMatchObject({
      body: { projects: [{ slug: 'assignment-removal' }] },
      status: 200,
    });

    const removeResponse = await removeProjectAssignmentRequest(
      organization.slug,
      'assignment-removal',
      ownerHeaders,
      assignmentResponse.body.assignment.id,
    );

    expect(removeResponse.status).toBe(200);
    expect(removeResponse.body.assignment).toMatchObject({
      id: assignmentResponse.body.assignment.id,
      role: 'project_contributor',
    });
    await expect(listProjectsRequest(organization.slug, memberHeaders)).resolves.toMatchObject({
      body: { projects: [] },
      status: 200,
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

    const membersResponse = await listOrganizationMembersRequest(organization.slug, ownerHeaders);
    const assignedMember = membersResponse.body.members.find(
      (organizationMember: { email: string }) => organizationMember.email === member.email,
    ) as { id: string } | undefined;

    expect(assignedMember?.id).toBeTruthy();

    await createProjectRequest(organization.slug, ownerHeaders, {
      description: 'Member-visible archived work.',
      name: 'Member Visible',
      projectOwnerMemberId: assignedMember?.id,
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
