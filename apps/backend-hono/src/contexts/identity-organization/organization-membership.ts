import { and, asc, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { members, organizations, users } from '../../db/schema';
import type { OrganizationAuthorizationPolicy } from './organization-authorization';

export const organizationMembershipAuthorizationActions = {
  listMembers: {
    allowedRoles: 'any-member',
    deniedMessage: 'Only Organization members can view Organization Members.',
  },
  removeMember: {
    allowedRoles: ['owner', 'admin'],
    deniedMessage: 'Only Organization owners and admins can remove Organization Members.',
  },
} satisfies Record<string, OrganizationAuthorizationPolicy>;

export async function getOrganizationMembership(organizationSlug: string, userId: string) {
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

export async function listOrganizationMembers(organizationId: string) {
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

export async function removeOrganizationMember(input: {
  actorMemberId: string;
  organizationId: string;
  organizationMemberId: string;
}) {
  if (input.actorMemberId === input.organizationMemberId) {
    throw new OrganizationMembershipInputError('Organization Members cannot remove themselves.');
  }

  const member = await db
    .select({
      email: users.email,
      id: members.id,
      name: users.name,
      role: members.role,
    })
    .from(members)
    .innerJoin(users, eq(members.userId, users.id))
    .where(
      and(
        eq(members.id, input.organizationMemberId),
        eq(members.organizationId, input.organizationId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!member) {
    return null;
  }

  await db.delete(members).where(eq(members.id, member.id));

  return member;
}

export class OrganizationMembershipInputError extends Error {}
