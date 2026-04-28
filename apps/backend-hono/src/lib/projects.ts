import { and, asc, eq, isNotNull, isNull, ne } from 'drizzle-orm';
import { db } from '../db/client';
import { members, organizations, projectComponents, projects, users } from '../db/schema';

export type ProjectListItem = {
  archivedAt: string | null;
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

export type ProjectListStatus = 'active' | 'archived';

export type ProjectDetailResponse = {
  id: string;
  name: string;
  description: string;
  slug: string;
  archivedAt: string | null;
  createdAt: string;
  projectOwner: {
    email: string;
    id: string;
    name: string;
    role: string;
  } | null;
};

export type ProjectComponentResponse = {
  archivedAt: string | null;
  createdAt: string;
  description: string | null;
  id: string;
  name: string;
  projectId: string;
  updatedAt: string;
};

export type ProjectComponentListStatus = 'active' | 'archived';

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

type UpdateProjectInput = {
  description: string;
  name: string;
  projectOwnerMemberId: string | null;
};

type ProjectComponentInput = {
  description: string | null;
  name: string;
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

export async function canManageProjectComponents(input: {
  membership: OrganizationMembership;
  projectSlug: string;
}): Promise<boolean> {
  if (canManageProjects(input.membership.role)) {
    return true;
  }

  const project = await getProjectRecordForMembership(input.membership, input.projectSlug);

  return project?.projectOwnerMemberId === input.membership.id;
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

export async function listProjects(
  organizationId: string,
  status: ProjectListStatus,
): Promise<ProjectListItem[]> {
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
        eq(projects.organizationId, organizationId),
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

export async function getProjectDetailForMember(input: {
  organizationSlug: string;
  projectSlug: string;
  userId: string;
}): Promise<ProjectDetailResponse | null> {
  const membership = await getOrganizationMembership(input.organizationSlug, input.userId);

  if (!membership) {
    return null;
  }

  return getProjectDetailForMembership(membership, input.projectSlug);
}

export async function getProjectDetailForMembership(
  membership: OrganizationMembership,
  projectSlug: string,
): Promise<ProjectDetailResponse | null> {
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

  return (await listProjects(organizationId, 'active')).find(({ id }) => id === project.id)!;
}

export async function setProjectArchivedForMembership(input: {
  archived: boolean;
  membership: OrganizationMembership;
  projectSlug: string;
}): Promise<ProjectDetailResponse | null> {
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

  await db
    .update(projects)
    .set({
      archivedAt: input.archived ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, existingProject.id));

  return getProjectDetailForMembership(input.membership, input.projectSlug);
}

export async function updateProjectForMembership(input: {
  membership: OrganizationMembership;
  projectSlug: string;
  updates: UpdateProjectInput;
}): Promise<ProjectDetailResponse | null> {
  validateProjectUpdateInput(input.updates);

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

  if (input.updates.projectOwnerMemberId) {
    const ownerMembership = await db
      .select({ id: members.id })
      .from(members)
      .where(
        and(
          eq(members.id, input.updates.projectOwnerMemberId),
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
      description: input.updates.description.trim(),
      name: input.updates.name.trim(),
      projectOwnerMemberId: input.updates.projectOwnerMemberId,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, existingProject.id));

  return getProjectDetailForMembership(input.membership, input.projectSlug);
}

export async function listProjectComponentsForMembership(input: {
  membership: OrganizationMembership;
  projectSlug: string;
  status: ProjectComponentListStatus;
}): Promise<ProjectComponentResponse[] | null> {
  const project = await getProjectRecordForMembership(input.membership, input.projectSlug);

  if (!project) {
    return null;
  }

  const rows = await db
    .select()
    .from(projectComponents)
    .where(
      and(
        eq(projectComponents.projectId, project.id),
        input.status === 'archived'
          ? isNotNull(projectComponents.archivedAt)
          : isNull(projectComponents.archivedAt),
      ),
    )
    .orderBy(asc(projectComponents.createdAt), asc(projectComponents.name));

  return rows.map(formatProjectComponent);
}

export async function createProjectComponentForMembership(input: {
  membership: OrganizationMembership;
  projectSlug: string;
  values: ProjectComponentInput;
}): Promise<ProjectComponentResponse | null> {
  const project = await getProjectRecordForMembership(input.membership, input.projectSlug);

  if (!project) {
    return null;
  }

  const values = validateProjectComponentInput(input.values);
  await assertProjectComponentNameAvailable(project.id, values.name);

  const now = new Date();
  const component = {
    archivedAt: null,
    createdAt: now,
    description: values.description,
    id: crypto.randomUUID(),
    name: values.name,
    projectId: project.id,
    updatedAt: now,
  };

  await db.insert(projectComponents).values(component);

  return formatProjectComponent(component);
}

export async function updateProjectComponentForMembership(input: {
  componentId: string;
  membership: OrganizationMembership;
  projectSlug: string;
  values: ProjectComponentInput;
}): Promise<ProjectComponentResponse | null> {
  const project = await getProjectRecordForMembership(input.membership, input.projectSlug);

  if (!project) {
    return null;
  }

  const component = await getProjectComponent(project.id, input.componentId);

  if (!component) {
    return null;
  }

  const values = validateProjectComponentInput(input.values);
  await assertProjectComponentNameAvailable(project.id, values.name, component.id);

  await db
    .update(projectComponents)
    .set({
      description: values.description,
      name: values.name,
      updatedAt: new Date(),
    })
    .where(eq(projectComponents.id, component.id));

  return getProjectComponent(project.id, component.id).then((row) =>
    row ? formatProjectComponent(row) : null,
  );
}

export async function setProjectComponentArchivedForMembership(input: {
  archived: boolean;
  componentId: string;
  membership: OrganizationMembership;
  projectSlug: string;
}): Promise<ProjectComponentResponse | null> {
  const project = await getProjectRecordForMembership(input.membership, input.projectSlug);

  if (!project) {
    return null;
  }

  const component = await getProjectComponent(project.id, input.componentId);

  if (!component) {
    return null;
  }

  await db
    .update(projectComponents)
    .set({
      archivedAt: input.archived ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(projectComponents.id, component.id));

  return getProjectComponent(project.id, component.id).then((row) =>
    row ? formatProjectComponent(row) : null,
  );
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

export class ProjectComponentInputError extends Error {}

async function getProjectRecordForMembership(
  membership: OrganizationMembership,
  projectSlug: string,
) {
  return db
    .select({
      id: projects.id,
      projectOwnerMemberId: projects.projectOwnerMemberId,
    })
    .from(projects)
    .where(
      and(eq(projects.organizationId, membership.organizationId), eq(projects.slug, projectSlug)),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

async function getProjectComponent(projectId: string, componentId: string) {
  return db
    .select()
    .from(projectComponents)
    .where(and(eq(projectComponents.projectId, projectId), eq(projectComponents.id, componentId)))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

async function assertProjectComponentNameAvailable(
  projectId: string,
  name: string,
  exceptComponentId?: string,
) {
  const duplicate = await db
    .select({ id: projectComponents.id })
    .from(projectComponents)
    .where(
      and(
        eq(projectComponents.projectId, projectId),
        eq(projectComponents.name, name),
        exceptComponentId ? ne(projectComponents.id, exceptComponentId) : undefined,
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (duplicate) {
    throw new ProjectComponentInputError('Project Component name is already used in this Project.');
  }
}

function validateProjectComponentInput(input: ProjectComponentInput): ProjectComponentInput {
  const name = input.name.trim();
  const description = input.description?.trim() || null;

  if (!name) {
    throw new ProjectComponentInputError('Project Component name is required.');
  }

  return { description, name };
}

function formatProjectComponent(
  component: typeof projectComponents.$inferSelect,
): ProjectComponentResponse {
  return {
    archivedAt: component.archivedAt?.toISOString() ?? null,
    createdAt: component.createdAt.toISOString(),
    description: component.description,
    id: component.id,
    name: component.name,
    projectId: component.projectId,
    updatedAt: component.updatedAt.toISOString(),
  };
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

function validateProjectUpdateInput(input: UpdateProjectInput) {
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

export function normalizeProjectUpdateBody(body: unknown): UpdateProjectInput {
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

export function normalizeProjectComponentBody(body: unknown): ProjectComponentInput {
  const value = typeof body === 'object' && body !== null ? body : {};
  const record = value as Record<string, unknown>;

  return {
    description: typeof record.description === 'string' ? record.description : null,
    name: typeof record.name === 'string' ? record.name : '',
  };
}
