import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { auditEvents } from '../../db/schema';
import type { OrganizationAuthorizationPolicy } from '../identity-organization/organization-authorization';
import type { AuthorizedOrganizationMember } from '../../types/organization-types';

const auditLogViewerRoles = ['owner', 'admin'] as const;

export const auditLogAuthorizationActions = {
  list: {
    allowedRoles: auditLogViewerRoles,
    deniedMessage: 'Only Organization owners and admins can view the Audit Log.',
  },
} satisfies Record<string, OrganizationAuthorizationPolicy>;

export async function listAuditEventsForViewer(
  membership: AuthorizedOrganizationMember,
  filters: {
    action?: string;
    limit: number;
    offset: number;
    targetId?: string;
    targetType?: string;
  },
) {
  const rows = await db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organizationId, membership.organizationId),
        filters.action ? eq(auditEvents.action, filters.action) : undefined,
        filters.targetId ? eq(auditEvents.targetId, filters.targetId) : undefined,
        filters.targetType ? eq(auditEvents.targetType, filters.targetType) : undefined,
      ),
    )
    .orderBy(desc(auditEvents.occurredAt))
    .limit(filters.limit)
    .offset(filters.offset);

  return rows.map(({ metadata, occurredAt, ...auditEvent }) => ({
    ...auditEvent,
    metadata: parseAuditEventMetadata(metadata),
    occurredAt: occurredAt.toISOString(),
  }));
}

function parseAuditEventMetadata(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
