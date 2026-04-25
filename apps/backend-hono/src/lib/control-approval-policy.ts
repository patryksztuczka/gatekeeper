import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { members, organizations } from '../db/schema';
import type { OrganizationMembership } from './projects';

const editableOrganizationRoles = new Set(['owner', 'admin']);

export type ControlApprovalPolicyResponse = {
  enabled: boolean;
  maxRequiredApprovals: number;
  requiredApprovals: number;
};

type ControlApprovalPolicyUpdateInput = {
  enabled: boolean;
  requiredApprovals: number;
};

export class ControlApprovalPolicyInputError extends Error {}

export function canManageControlApprovalPolicy(role: string): boolean {
  return editableOrganizationRoles.has(role);
}

export function normalizeControlApprovalPolicyUpdateBody(
  body: unknown,
): ControlApprovalPolicyUpdateInput {
  if (!body || typeof body !== 'object') {
    throw new ControlApprovalPolicyInputError('Control Approval Policy settings are required.');
  }

  const record = body as Record<string, unknown>;

  if (typeof record.enabled !== 'boolean') {
    throw new ControlApprovalPolicyInputError('Control Approval Policy enabled state is required.');
  }

  const requiredApprovals = record.enabled ? (record.requiredApprovals ?? 1) : 1;

  if (!Number.isInteger(requiredApprovals) || typeof requiredApprovals !== 'number') {
    throw new ControlApprovalPolicyInputError('Required approval count must be a whole number.');
  }

  if (requiredApprovals < 1) {
    throw new ControlApprovalPolicyInputError('Required approval count must be at least 1.');
  }

  return {
    enabled: record.enabled,
    requiredApprovals,
  };
}

export async function getControlApprovalPolicy(
  organizationId: string,
): Promise<ControlApprovalPolicyResponse> {
  const organization = await db
    .select({
      enabled: organizations.controlApprovalPolicyEnabled,
      requiredApprovals: organizations.controlApprovalRequiredCount,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!organization) {
    throw new ControlApprovalPolicyInputError('Organization not found.');
  }

  return {
    enabled: organization.enabled,
    maxRequiredApprovals: await getMaxRequiredApprovals(organizationId),
    requiredApprovals: organization.requiredApprovals,
  };
}

export async function updateControlApprovalPolicy(
  membership: OrganizationMembership,
  input: ControlApprovalPolicyUpdateInput,
): Promise<ControlApprovalPolicyResponse> {
  const maxRequiredApprovals = await getMaxRequiredApprovals(membership.organizationId);

  if (input.enabled && maxRequiredApprovals < 1) {
    throw new ControlApprovalPolicyInputError(
      'Control Approval Policy needs at least two Organization owners/admins before it can be enabled.',
    );
  }

  if (input.enabled && input.requiredApprovals > maxRequiredApprovals) {
    throw new ControlApprovalPolicyInputError(
      'Required approval count cannot exceed eligible approvers other than the author.',
    );
  }

  await db
    .update(organizations)
    .set({
      controlApprovalPolicyEnabled: input.enabled,
      controlApprovalRequiredCount: input.requiredApprovals,
    })
    .where(eq(organizations.id, membership.organizationId));

  return {
    enabled: input.enabled,
    maxRequiredApprovals,
    requiredApprovals: input.requiredApprovals,
  };
}

async function getMaxRequiredApprovals(organizationId: string): Promise<number> {
  const eligibleApprovers = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(eq(members.organizationId, organizationId), inArray(members.role, ['owner', 'admin'])),
    );

  return Math.max(eligibleApprovers.length - 1, 0);
}
