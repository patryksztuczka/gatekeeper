import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { members, organizations, projects, users } from '../db/schema';

export type ProjectListItem = {
  createdAt: string;
  description: string;
  id: string;
  name: string;
  projectOwner: {
    email: string;
    id: string;
    name: string;
  } | null;
  slug: string;
};

export type OrganizationMemberListItem = {
  email: string;
  id: string;
  name: string;
  role: string;
};

export type OrganizationMembership = {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: string;
};

type CreateProjectInput = {
  description: string;
  name: string;
  projectOwnerMemberId: string | null;
  slug: string;
};

const editableOrganizationRoles = new Set(['owner', 'admin']);
const projectSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function getOrganizationMembership(
  organizationSlug: string,
  userId: string,
): Promise<OrganizationMembership | null> {
  return db
    .select({
      id: members.id,
      organizationId: organizations.id,
      organizationName: organizations.name,
      organizationSlug: organizations.slug,
      role: members.role,
    })
    .from(members)
    .innerJoin(organizations, eq(members.organizationId, organizations.id))
    .where(and(eq(organizations.slug, organizationSlug), eq(members.userId, userId)))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

export function canManageProjects(role: string): boolean {
  return editableOrganizationRoles.has(role);
}

export async function listOrganizationMembers(
  organizationId: string,
): Promise<OrganizationMemberListItem[]> {
  return db
    .select({
      email: users.email,
      id: members.id,
      name: users.name,
      role: members.role,
    })
    .from(members)
    .innerJoin(users, eq(members.userId, users.id))
    .where(eq(members.organizationId, organizationId))
    .orderBy(asc(users.name), asc(users.email));
}

export async function listActiveProjects(organizationId: string): Promise<ProjectListItem[]> {
  const rows = await db
    .select({
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
    .where(and(eq(projects.organizationId, organizationId), isNull(projects.archivedAt)))
    .orderBy(asc(projects.createdAt), asc(projects.name));

  return rows.map(({ createdAt, ownerEmail, ownerId, ownerName, ...project }) => ({
    ...project,
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

export async function createProject(
  organizationId: string,
  input: CreateProjectInput,
): Promise<ProjectListItem> {
  validateProjectInput(input);

  const existingProject = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), eq(projects.slug, input.slug)))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (existingProject) {
    throw new ProjectInputError('Project slug is already used in this Organization.');
  }

  if (input.projectOwnerMemberId) {
    const ownerMembership = await db
      .select({ id: members.id })
      .from(members)
      .where(
        and(eq(members.id, input.projectOwnerMemberId), eq(members.organizationId, organizationId)),
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
    description: input.description.trim(),
    id: crypto.randomUUID(),
    name: input.name.trim(),
    organizationId,
    projectOwnerMemberId: input.projectOwnerMemberId,
    slug: input.slug,
    updatedAt: now,
  };

  await db.insert(projects).values(project);

  return (await listActiveProjects(organizationId)).find(({ id }) => id === project.id)!;
}

export function slugifyProjectName(value: string): string {
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

  if (!name) {
    throw new ProjectInputError('Project name is required.');
  }

  if (!description) {
    throw new ProjectInputError('Project description is required.');
  }

  if (!input.slug || !projectSlugPattern.test(input.slug)) {
    throw new ProjectInputError(
      'Project slug must contain lowercase letters, numbers, and hyphens.',
    );
  }

  if (input.slug !== slugifyProjectName(input.slug)) {
    throw new ProjectInputError('Project slug must be normalized.');
  }
}

export function normalizeProjectCreateBody(body: unknown): CreateProjectInput {
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
