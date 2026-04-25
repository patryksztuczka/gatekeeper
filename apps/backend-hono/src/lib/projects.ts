import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { members, organizations, projects, users } from '../db/schema';

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

export async function getProjectDetailForMember(input: {
  organizationSlug: string;
  projectSlug: string;
  userId: string;
}): Promise<ProjectDetailResponse | null> {
  const membership = await db
    .select({ organizationId: organizations.id })
    .from(organizations)
    .innerJoin(members, eq(members.organizationId, organizations.id))
    .where(and(eq(organizations.slug, input.organizationSlug), eq(members.userId, input.userId)))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!membership) {
    return null;
  }

  const project = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, membership.organizationId),
        eq(projects.slug, input.projectSlug),
      ),
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
