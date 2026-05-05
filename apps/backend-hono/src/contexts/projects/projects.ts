import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '../../db/client';
import { auditEvents, members, projects, users } from '../../db/schema';
import type { AuthorizedOrganizationMember } from '../../types/organization-types';
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

const projectManagerRoles = ['owner', 'admin'] as const;
const projectSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const projectAuthorizationActions = {
  archive: {
    allowedRoles: projectManagerRoles,
    deniedMessage: 'Only Organization owners and admins can archive Projects.',
  },
  create: {
    allowedRoles: projectManagerRoles,
    deniedMessage: 'Only Organization owners and admins can create Projects.',
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
  update: {
    allowedRoles: projectManagerRoles,
    deniedMessage: 'Only Organization owners and admins can edit Projects.',
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
    .leftJoin(members, eq(projects.projectOwnerMemberId, members.id))
    .leftJoin(users, eq(members.userId, users.id))
    .where(
      and(
        eq(projects.organizationId, membership.organizationId),
        status === 'archived' ? isNotNull(projects.archivedAt) : isNull(projects.archivedAt),
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

  const projectOwner = project.projectOwnerMemberId
    ? await db
        .select({
          email: users.email,
          id: members.id,
          name: users.name,
          role: members.role,
        })
        .from(members)
        .innerJoin(users, eq(users.id, members.userId))
        .where(
          and(
            eq(members.id, project.projectOwnerMemberId),
            eq(members.organizationId, membership.organizationId),
          ),
        )
        .limit(1)
        .then((rows) => rows[0] ?? null)
    : null;

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
  action: 'project.created' | 'project.archived' | 'project.restored';
  membership: AuthorizedOrganizationMember;
  project: {
    id: string;
    name: string;
    slug: string;
  };
}) {
  const actorMembership = await db
    .select({ userId: members.userId })
    .from(members)
    .where(eq(members.id, input.membership.id))
    .limit(1)
    .then((rows) => rows[0]);

  return {
    action: input.action,
    actorOrganizationMemberId: input.membership.id,
    actorType: 'organization_member',
    actorUserId: actorMembership?.userId,
    id: crypto.randomUUID(),
    organizationId: input.membership.organizationId,
    targetDisplayName: input.project.name,
    targetId: input.project.id,
    targetSecondaryLabel: input.project.slug,
    targetType: 'project',
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

  await db
    .update(projects)
    .set({
      description: settings.description.trim(),
      name: settings.name.trim(),
      projectOwnerMemberId: settings.projectOwnerMemberId,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, existingProject.id));

  return viewProjectForMember(input.membership, input.projectSlug);
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
