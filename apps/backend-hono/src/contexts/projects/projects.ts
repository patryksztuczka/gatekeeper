import { and, asc, eq, exists, isNotNull, isNull, ne } from 'drizzle-orm';
import { db } from '../../db/client';
import { auditEvents, members, projectAssignments, projects, users } from '../../db/schema';
import type { AuthorizedOrganizationMember } from '../../types/organization-types';
import { buildOrganizationMemberAuditEvent } from '../audit-log/audit-events';
import type { OrganizationAuthorizationPolicy } from '../identity-organization/organization-authorization';

export type ProjectListStatus = 'active' | 'archived';

type CreateProjectInput = {
  description: string;
  name: string;
  projectOwnerMemberId?: string | null;
  slug: string;
};

type UpdateProjectSettingsInput = {
  description: string;
  name: string;
  projectOwnerMemberId?: string | null;
};

type CreateProjectAssignmentInput = {
  organizationMemberId: string;
  role: 'project_contributor' | 'project_owner';
};

type UpdateProjectAssignmentInput = {
  assignmentId: string;
  role: 'project_contributor' | 'project_owner';
};

type RemoveProjectAssignmentInput = {
  assignmentId: string;
};

const projectManagerRoles = ['owner', 'admin'] as const;
const projectSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const projectOwnerAssignmentRole = 'project_owner';

export const projectAuthorizationActions = {
  archive: {
    allowedRoles: projectManagerRoles,
    deniedMessage: 'Only Organization owners and admins can archive Projects.',
  },
  create: {
    allowedRoles: projectManagerRoles,
    deniedMessage: 'Only Organization owners and admins can create Projects.',
  },
  createAssignment: {
    allowedRoles: projectManagerRoles,
    deniedMessage: 'Only Organization owners and admins can create Project Assignments.',
  },
  listAssignments: {
    allowedRoles: projectManagerRoles,
    deniedMessage: 'Only Organization owners and admins can view Project Assignments.',
  },
  listActive: {
    allowedRoles: 'any-member',
    deniedMessage: 'Only Organization members can view Projects.',
  },
  listArchived: {
    allowedRoles: 'any-member',
    deniedMessage: 'Only Organization members can view Archived Projects.',
  },
  restore: {
    allowedRoles: projectManagerRoles,
    deniedMessage: 'Only Organization owners and admins can restore Projects.',
  },
  removeAssignment: {
    allowedRoles: projectManagerRoles,
    deniedMessage: 'Only Organization owners and admins can remove Project Assignments.',
  },
  update: {
    allowedRoles: projectManagerRoles,
    deniedMessage: 'Only Organization owners and admins can edit Projects.',
  },
  updateAssignment: {
    allowedRoles: projectManagerRoles,
    deniedMessage: 'Only Organization owners and admins can change Project Assignments.',
  },
  view: {
    allowedRoles: 'any-member',
    deniedMessage: 'Only Organization members can view Projects.',
  },
} satisfies Record<string, OrganizationAuthorizationPolicy>;

export async function listProjectsForMember(
  membership: AuthorizedOrganizationMember,
  status: ProjectListStatus,
) {
  const canViewAllProjects = canViewAllProjectsForOrganizationRole(membership.role);

  const rows = await db
    .select({
      archivedAt: projects.archivedAt,
      createdAt: projects.createdAt,
      description: projects.description,
      id: projects.id,
      name: projects.name,
      ownerEmail: users.email,
      ownerId: members.id,
      ownerName: users.name,
      slug: projects.slug,
    })
    .from(projects)
    .leftJoin(
      projectAssignments,
      and(
        eq(projectAssignments.projectId, projects.id),
        eq(projectAssignments.role, projectOwnerAssignmentRole),
      ),
    )
    .leftJoin(members, eq(projectAssignments.organizationMemberId, members.id))
    .leftJoin(users, eq(members.userId, users.id))
    .where(
      and(
        eq(projects.organizationId, membership.organizationId),
        status === 'archived' ? isNotNull(projects.archivedAt) : isNull(projects.archivedAt),
        canViewAllProjects
          ? undefined
          : exists(
              db
                .select({ id: projectAssignments.id })
                .from(projectAssignments)
                .where(
                  and(
                    eq(projectAssignments.projectId, projects.id),
                    eq(projectAssignments.organizationMemberId, membership.id),
                  ),
                ),
            ),
      ),
    )
    .orderBy(asc(projects.createdAt), asc(projects.name));

  return rows.map(({ archivedAt, createdAt, ownerEmail, ownerId, ownerName, ...project }) => ({
    ...project,
    archivedAt: archivedAt?.toISOString() ?? null,
    createdAt: createdAt.toISOString(),
    projectOwner:
      ownerId && ownerEmail && ownerName
        ? {
            email: ownerEmail,
            id: ownerId,
            name: ownerName,
          }
        : null,
  }));
}

export async function viewProjectForMember(
  membership: AuthorizedOrganizationMember,
  projectSlug: string,
) {
  const canViewAllProjects = canViewAllProjectsForOrganizationRole(membership.role);
  const project = await db
    .select()
    .from(projects)
    .where(
      and(eq(projects.organizationId, membership.organizationId), eq(projects.slug, projectSlug)),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!project) {
    return null;
  }

  if (!canViewAllProjects) {
    const assignment = await db
      .select({ id: projectAssignments.id })
      .from(projectAssignments)
      .where(
        and(
          eq(projectAssignments.projectId, project.id),
          eq(projectAssignments.organizationMemberId, membership.id),
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (!assignment) {
      return null;
    }
  }

  const projectOwner = await db
    .select({
      email: users.email,
      id: members.id,
      name: users.name,
      role: members.role,
    })
    .from(projectAssignments)
    .innerJoin(members, eq(projectAssignments.organizationMemberId, members.id))
    .innerJoin(users, eq(users.id, members.userId))
    .where(
      and(
        eq(projectAssignments.projectId, project.id),
        eq(projectAssignments.role, projectOwnerAssignmentRole),
        eq(members.organizationId, membership.organizationId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    slug: project.slug,
    archivedAt: project.archivedAt?.toISOString() ?? null,
    createdAt: project.createdAt.toISOString(),
    projectOwner,
  };
}

export type ProjectDetailResponse = NonNullable<Awaited<ReturnType<typeof viewProjectForMember>>>;

export async function listProjectAssignmentsForMember(input: {
  membership: AuthorizedOrganizationMember;
  projectSlug: string;
}) {
  const project = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, input.membership.organizationId),
        eq(projects.slug, input.projectSlug),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!project) {
    return null;
  }

  const assignments = await db
    .select({
      email: users.email,
      id: projectAssignments.id,
      name: users.name,
      organizationMemberId: members.id,
      organizationRole: members.role,
      role: projectAssignments.role,
    })
    .from(projectAssignments)
    .innerJoin(members, eq(projectAssignments.organizationMemberId, members.id))
    .innerJoin(users, eq(users.id, members.userId))
    .where(
      and(
        eq(projectAssignments.projectId, project.id),
        eq(members.organizationId, input.membership.organizationId),
      ),
    )
    .orderBy(asc(users.name), asc(users.email));

  return assignments;
}

export async function createProjectForMember(
  membership: AuthorizedOrganizationMember,
  input: CreateProjectInput,
) {
  const projectInput = normalizeProjectCreateBody(input);

  validateProjectInput(projectInput);

  const existingProject = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, membership.organizationId),
        eq(projects.slug, projectInput.slug),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (existingProject) {
    throw new ProjectInputError('Project slug is already used in this Organization.');
  }

  if (projectInput.projectOwnerMemberId) {
    const ownerMembership = await db
      .select({ id: members.id })
      .from(members)
      .where(
        and(
          eq(members.id, projectInput.projectOwnerMemberId),
          eq(members.organizationId, membership.organizationId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (!ownerMembership) {
      throw new ProjectInputError('Project Owner must be a member of this Organization.');
    }
  }

  const now = new Date();
  const project = {
    createdAt: now,
    description: projectInput.description.trim(),
    id: crypto.randomUUID(),
    name: projectInput.name.trim(),
    organizationId: membership.organizationId,
    projectOwnerMemberId: projectInput.projectOwnerMemberId,
    slug: projectInput.slug,
    updatedAt: now,
  };

  await db.batch([
    db.insert(projects).values(project),
    ...(projectInput.projectOwnerMemberId
      ? [
          db.insert(projectAssignments).values({
            createdAt: now,
            id: crypto.randomUUID(),
            organizationMemberId: projectInput.projectOwnerMemberId,
            projectId: project.id,
            role: projectOwnerAssignmentRole,
            updatedAt: now,
          }),
        ]
      : []),
    db.insert(auditEvents).values(
      await buildProjectAuditEventValues({
        action: 'project.created',
        membership,
        project: {
          id: project.id,
          name: project.name,
          slug: project.slug,
        },
      }),
    ),
  ]);

  return (await listProjectsForMember(membership, 'active')).find(({ id }) => id === project.id)!;
}

async function buildProjectAuditEventValues(input: {
  action:
    | 'project.created'
    | 'project.archived'
    | 'project.restored'
    | 'project.updated'
    | 'project_assignment.created'
    | 'project_assignment.role_changed'
    | 'project_assignment.removed';
  membership: AuthorizedOrganizationMember;
  metadata?: unknown;
  project: {
    id: string;
    name: string;
    slug: string;
  };
}) {
  return buildOrganizationMemberAuditEvent({
    action: input.action,
    membership: input.membership,
    metadata: input.metadata,
    target: {
      displayName: input.project.name,
      id: input.project.id,
      secondaryLabel: input.project.slug,
      type: 'project',
    },
  });
}

export async function createProjectAssignmentForMember(input: {
  assignment: CreateProjectAssignmentInput;
  membership: AuthorizedOrganizationMember;
  projectSlug: string;
}) {
  const project = await db
    .select({
      archivedAt: projects.archivedAt,
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
    })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, input.membership.organizationId),
        eq(projects.slug, input.projectSlug),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!project) {
    return null;
  }

  if (project.archivedAt) {
    throw new ProjectInputError('Project Assignments cannot be changed while a Project is archived.');
  }

  const organizationMember = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.id, input.assignment.organizationMemberId),
        eq(members.organizationId, input.membership.organizationId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!organizationMember) {
    throw new ProjectInputError('Project Assignment member must be a member of this Organization.');
  }

  const existingAssignment = await db
    .select({ id: projectAssignments.id })
    .from(projectAssignments)
    .where(
      and(
        eq(projectAssignments.projectId, project.id),
        eq(projectAssignments.organizationMemberId, input.assignment.organizationMemberId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (existingAssignment) {
    throw new ProjectInputError(
      'Organization Member already has a Project Assignment for this Project.',
    );
  }

  const now = new Date();
  const assignment = {
    createdAt: now,
    id: crypto.randomUUID(),
    organizationMemberId: input.assignment.organizationMemberId,
    projectId: project.id,
    role: input.assignment.role,
    updatedAt: now,
  };

  const auditEvent = db.insert(auditEvents).values(
    await buildProjectAuditEventValues({
      action: 'project_assignment.created',
      membership: input.membership,
      metadata: {
        organizationMemberId: assignment.organizationMemberId,
        role: assignment.role,
      },
      project,
    }),
  );

  if (assignment.role === projectOwnerAssignmentRole) {
    await db.batch([
      demoteExistingProjectOwner(project.id),
      db.insert(projectAssignments).values(assignment),
      auditEvent,
    ]);
  } else {
    await db.batch([db.insert(projectAssignments).values(assignment), auditEvent]);
  }

  return {
    id: assignment.id,
    organizationMemberId: assignment.organizationMemberId,
    projectId: assignment.projectId,
    role: assignment.role,
  };
}

export async function removeProjectAssignmentForMember(input: {
  assignment: RemoveProjectAssignmentInput;
  membership: AuthorizedOrganizationMember;
  projectSlug: string;
}) {
  const assignment = await db
    .select({
      archivedAt: projects.archivedAt,
      id: projectAssignments.id,
      name: projects.name,
      organizationMemberId: projectAssignments.organizationMemberId,
      projectId: projects.id,
      projectSlug: projects.slug,
      role: projectAssignments.role,
    })
    .from(projectAssignments)
    .innerJoin(projects, eq(projectAssignments.projectId, projects.id))
    .where(
      and(
        eq(projectAssignments.id, input.assignment.assignmentId),
        eq(projects.organizationId, input.membership.organizationId),
        eq(projects.slug, input.projectSlug),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!assignment) {
    return null;
  }

  if (assignment.archivedAt) {
    throw new ProjectInputError('Project Assignments cannot be changed while a Project is archived.');
  }

  await db.batch([
    db.delete(projectAssignments).where(eq(projectAssignments.id, assignment.id)),
    db.insert(auditEvents).values(
      await buildProjectAuditEventValues({
        action: 'project_assignment.removed',
        membership: input.membership,
        metadata: {
          organizationMemberId: assignment.organizationMemberId,
          role: assignment.role,
        },
        project: {
          id: assignment.projectId,
          name: assignment.name,
          slug: assignment.projectSlug,
        },
      }),
    ),
  ]);

  return {
    id: assignment.id,
    organizationMemberId: assignment.organizationMemberId,
    projectId: assignment.projectId,
    role: assignment.role,
  };
}

export async function updateProjectAssignmentForMember(input: {
  assignment: UpdateProjectAssignmentInput;
  membership: AuthorizedOrganizationMember;
  projectSlug: string;
}) {
  const assignment = await db
    .select({
      archivedAt: projects.archivedAt,
      id: projectAssignments.id,
      name: projects.name,
      organizationMemberId: projectAssignments.organizationMemberId,
      projectId: projects.id,
      projectSlug: projects.slug,
      role: projectAssignments.role,
    })
    .from(projectAssignments)
    .innerJoin(projects, eq(projectAssignments.projectId, projects.id))
    .where(
      and(
        eq(projectAssignments.id, input.assignment.assignmentId),
        eq(projects.organizationId, input.membership.organizationId),
        eq(projects.slug, input.projectSlug),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!assignment) {
    return null;
  }

  if (assignment.archivedAt) {
    throw new ProjectInputError('Project Assignments cannot be changed while a Project is archived.');
  }

  const updateAssignment = db
    .update(projectAssignments)
    .set({ role: input.assignment.role, updatedAt: new Date() })
    .where(eq(projectAssignments.id, assignment.id));
  const auditEvent = db.insert(auditEvents).values(
    await buildProjectAuditEventValues({
      action: 'project_assignment.role_changed',
      membership: input.membership,
      metadata: {
        organizationMemberId: assignment.organizationMemberId,
        role: {
          from: assignment.role,
          to: input.assignment.role,
        },
      },
      project: {
        id: assignment.projectId,
        name: assignment.name,
        slug: assignment.projectSlug,
      },
    }),
  );

  if (input.assignment.role === projectOwnerAssignmentRole) {
    await db.batch([
      demoteExistingProjectOwner(assignment.projectId, assignment.id),
      updateAssignment,
      auditEvent,
    ]);
  } else {
    await db.batch([updateAssignment, auditEvent]);
  }

  return {
    id: assignment.id,
    organizationMemberId: assignment.organizationMemberId,
    projectId: assignment.projectId,
    role: input.assignment.role,
  };
}

export async function archiveProjectForMember(input: {
  membership: AuthorizedOrganizationMember;
  projectSlug: string;
}) {
  return setProjectArchivedForMember({ ...input, archived: true });
}

export async function restoreProjectForMember(input: {
  membership: AuthorizedOrganizationMember;
  projectSlug: string;
}) {
  return setProjectArchivedForMember({ ...input, archived: false });
}

async function setProjectArchivedForMember(input: {
  archived: boolean;
  membership: AuthorizedOrganizationMember;
  projectSlug: string;
}) {
  const existingProject = await db
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
    })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, input.membership.organizationId),
        eq(projects.slug, input.projectSlug),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!existingProject) {
    return null;
  }

  await db.batch([
    db
      .update(projects)
      .set({
        archivedAt: input.archived ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, existingProject.id)),
    db.insert(auditEvents).values(
      await buildProjectAuditEventValues({
        action: input.archived ? 'project.archived' : 'project.restored',
        membership: input.membership,
        project: existingProject,
      }),
    ),
  ]);

  return viewProjectForMember(input.membership, input.projectSlug);
}

export async function updateProjectSettingsForMember(input: {
  membership: AuthorizedOrganizationMember;
  projectSlug: string;
  settings: UpdateProjectSettingsInput;
}) {
  const settings = normalizeProjectUpdateBody(input.settings);

  validateProjectUpdateInput(settings);

  const existingProject = await db
    .select({
      description: projects.description,
      id: projects.id,
      name: projects.name,
      projectOwnerMemberId: projects.projectOwnerMemberId,
      slug: projects.slug,
    })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, input.membership.organizationId),
        eq(projects.slug, input.projectSlug),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!existingProject) {
    return null;
  }

  if (settings.projectOwnerMemberId) {
    const ownerMembership = await db
      .select({ id: members.id })
      .from(members)
      .where(
        and(
          eq(members.id, settings.projectOwnerMemberId),
          eq(members.organizationId, input.membership.organizationId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (!ownerMembership) {
      throw new ProjectInputError('Project Owner must be a member of this Organization.');
    }
  }

  const updatedProject = {
    description: settings.description.trim(),
    name: settings.name.trim(),
    projectOwnerMemberId: settings.projectOwnerMemberId,
    updatedAt: new Date(),
  };

  await db.batch([
    db.update(projects).set(updatedProject).where(eq(projects.id, existingProject.id)),
    db
      .delete(projectAssignments)
      .where(
        and(
          eq(projectAssignments.projectId, existingProject.id),
          eq(projectAssignments.role, projectOwnerAssignmentRole),
        ),
      ),
    ...(settings.projectOwnerMemberId
      ? [
          db.insert(projectAssignments).values({
            createdAt: new Date(),
            id: crypto.randomUUID(),
            organizationMemberId: settings.projectOwnerMemberId,
            projectId: existingProject.id,
            role: projectOwnerAssignmentRole,
            updatedAt: new Date(),
          }),
        ]
      : []),
    db.insert(auditEvents).values(
      await buildProjectAuditEventValues({
        action: 'project.updated',
        membership: input.membership,
        metadata: {
          changes: await buildProjectUpdateAuditDeltas({
            after: updatedProject,
            before: existingProject,
          }),
        },
        project: {
          id: existingProject.id,
          name: updatedProject.name,
          slug: existingProject.slug,
        },
      }),
    ),
  ]);

  return viewProjectForMember(input.membership, input.projectSlug);
}

async function buildProjectUpdateAuditDeltas(input: {
  after: {
    description: string;
    name: string;
    projectOwnerMemberId: string | null;
  };
  before: {
    description: string;
    name: string;
    projectOwnerMemberId: string | null;
  };
}) {
  return {
    ...(input.before.name === input.after.name
      ? {}
      : {
          name: {
            from: input.before.name,
            to: input.after.name,
          },
        }),
    ...(input.before.description === input.after.description
      ? {}
      : {
          description: {
            from: input.before.description,
            to: input.after.description,
          },
        }),
    ...(input.before.projectOwnerMemberId === input.after.projectOwnerMemberId
      ? {}
      : {
          projectOwner: {
            from: await getProjectOwnerAuditLabel(input.before.projectOwnerMemberId),
            to: await getProjectOwnerAuditLabel(input.after.projectOwnerMemberId),
          },
        }),
  };
}

async function getProjectOwnerAuditLabel(organizationMemberId: string | null) {
  if (!organizationMemberId) {
    return null;
  }

  const member = await db
    .select({
      displayName: users.name,
      email: users.email,
      organizationMemberId: members.id,
    })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(eq(members.id, organizationMemberId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  return member ?? { organizationMemberId };
}

export function slugifyProjectName(value: string) {
  const normalizedValue = Array.from(value.normalize('NFKD'))
    .filter((character) => character.charCodeAt(0) <= 0x7f)
    .join('');

  return normalizedValue
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export class ProjectInputError extends Error {}

function canViewAllProjectsForOrganizationRole(role: string) {
  return projectManagerRoles.includes(role as (typeof projectManagerRoles)[number]);
}

function demoteExistingProjectOwner(projectId: string, exceptAssignmentId?: string) {
  return db
    .update(projectAssignments)
    .set({ role: 'project_contributor', updatedAt: new Date() })
    .where(
      and(
        eq(projectAssignments.projectId, projectId),
        eq(projectAssignments.role, projectOwnerAssignmentRole),
        exceptAssignmentId ? ne(projectAssignments.id, exceptAssignmentId) : undefined,
      ),
    );
}

function validateProjectInput(input: CreateProjectInput) {
  const name = input.name.trim();
  const description = input.description.trim();

  validateProjectNameAndDescription(name, description);

  if (!input.slug || !projectSlugPattern.test(input.slug)) {
    throw new ProjectInputError(
      'Project slug must contain lowercase letters, numbers, and hyphens.',
    );
  }

  if (input.slug !== slugifyProjectName(input.slug)) {
    throw new ProjectInputError('Project slug must be normalized.');
  }
}

function validateProjectUpdateInput(input: Required<UpdateProjectSettingsInput>) {
  validateProjectNameAndDescription(input.name.trim(), input.description.trim());
}

function validateProjectNameAndDescription(name: string, description: string) {
  if (!name) {
    throw new ProjectInputError('Project name is required.');
  }

  if (!description) {
    throw new ProjectInputError('Project description is required.');
  }
}

function normalizeProjectCreateBody(body: unknown) {
  const value = typeof body === 'object' && body !== null ? body : {};
  const record = value as Record<string, unknown>;

  return {
    description: typeof record.description === 'string' ? record.description : '',
    name: typeof record.name === 'string' ? record.name : '',
    projectOwnerMemberId:
      typeof record.projectOwnerMemberId === 'string' && record.projectOwnerMemberId
        ? record.projectOwnerMemberId
        : null,
    slug: typeof record.slug === 'string' ? slugifyProjectName(record.slug) : '',
  };
}

function normalizeProjectUpdateBody(body: unknown) {
  const value = typeof body === 'object' && body !== null ? body : {};
  const record = value as Record<string, unknown>;

  return {
    description: typeof record.description === 'string' ? record.description : '',
    name: typeof record.name === 'string' ? record.name : '',
    projectOwnerMemberId:
      typeof record.projectOwnerMemberId === 'string' && record.projectOwnerMemberId
        ? record.projectOwnerMemberId
        : null,
  };
}
