import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { auditEvents, members, users } from '../../db/schema';
import type { AuthorizedOrganizationMember } from '../../types/organization-types';

export type AuditEventValues = typeof auditEvents.$inferInsert;

type AuditTargetInput = {
  displayName?: string | null;
  id: string;
  secondaryLabel?: string | null;
  type: string;
};

export async function buildOrganizationMemberAuditEvent(input: {
  action: string;
  membership: AuthorizedOrganizationMember;
  metadata?: unknown;
  target: AuditTargetInput;
}) {
  const actor = await db
    .select({
      email: users.email,
      name: users.name,
      userId: members.userId,
    })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(eq(members.id, input.membership.id))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  return {
    action: input.action,
    actorDisplayName: actor?.name,
    actorEmail: actor?.email,
    actorOrganizationMemberId: input.membership.id,
    actorType: 'organization_member',
    actorUserId: actor?.userId,
    id: crypto.randomUUID(),
    metadata: input.metadata === undefined ? null : JSON.stringify(input.metadata),
    organizationId: input.membership.organizationId,
    targetDisplayName: input.target.displayName,
    targetId: input.target.id,
    targetSecondaryLabel: input.target.secondaryLabel,
    targetType: input.target.type,
  } satisfies AuditEventValues;
}
