import { desc, eq } from 'drizzle-orm';
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

export async function listAuditEventsForViewer(membership: AuthorizedOrganizationMember) {
  const rows = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.organizationId, membership.organizationId))
    .orderBy(desc(auditEvents.occurredAt));

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
