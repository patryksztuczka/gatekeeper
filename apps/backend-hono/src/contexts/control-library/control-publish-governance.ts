import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import { controlPublishRequests, members, organizations } from '../../db/schema';
import type { AuthorizedOrganizationMember } from '../../types/organization-types';
import type { OrganizationAuthorizationPolicy } from '../identity-organization/organization-authorization';

const controlPublishGovernanceManagerRoles = ['owner', 'admin'] as const;

export const controlPublishGovernanceAuthorizationActions = {
  updatePolicy: {
    allowedRoles: controlPublishGovernanceManagerRoles,
    deniedMessage: 'Only Organization owners and admins can edit Control Approval Policy.',
  },
  viewPolicy: {
    allowedRoles: 'any-member',
    deniedMessage: 'Only Organization members can view Control Approval Policy.',
  },
} satisfies Record<string, OrganizationAuthorizationPolicy>;

type ControlApprovalPolicyUpdateInput = {
  enabled: boolean;
  requiredApprovals: number;
};

export class ControlPublishGovernanceInputError extends Error {}

export function normalizeControlApprovalPolicyUpdateBody(
  body: unknown,
): ControlApprovalPolicyUpdateInput {
  if (!body || typeof body !== 'object') {
    throw new ControlPublishGovernanceInputError('Control Approval Policy settings are required.');
  }

  const record = body as Record<string, unknown>;

  if (typeof record.enabled !== 'boolean') {
    throw new ControlPublishGovernanceInputError(
      'Control Approval Policy enabled state is required.',
    );
  }

  const requiredApprovals = record.enabled ? (record.requiredApprovals ?? 1) : 1;

  if (!Number.isInteger(requiredApprovals) || typeof requiredApprovals !== 'number') {
    throw new ControlPublishGovernanceInputError('Required approval count must be a whole number.');
  }

  if (requiredApprovals < 1) {
    throw new ControlPublishGovernanceInputError('Required approval count must be at least 1.');
  }

  return {
    enabled: record.enabled,
    requiredApprovals,
  };
}

export async function getControlApprovalPolicy(organizationId: string) {
  const policy = await getPolicySettings(organizationId);

  return {
    enabled: policy.enabled,
    maxRequiredApprovals: await getMaxRequiredApprovals(organizationId),
    requiredApprovals: policy.requiredApprovals,
  };
}

export async function updateControlApprovalPolicy(
  membership: AuthorizedOrganizationMember,
  input: ControlApprovalPolicyUpdateInput,
) {
  const maxRequiredApprovals = await getMaxRequiredApprovals(membership.organizationId);

  if (input.enabled && maxRequiredApprovals < 1) {
    throw new ControlPublishGovernanceInputError(
      'Control Approval Policy needs at least two Organization owners/admins before it can be enabled.',
    );
  }

  if (input.enabled && input.requiredApprovals > maxRequiredApprovals) {
    throw new ControlPublishGovernanceInputError(
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

export async function getControlPublishRequestRequiredApprovals(organizationId: string) {
  const policy = await getPolicySettings(organizationId);

  if (!policy.enabled) {
    throw new ControlPublishGovernanceInputError('Control Approval Policy is not enabled.');
  }

  return policy.requiredApprovals;
}

export async function ensureControlPublishAllowed(input: {
  draftControlId: string | null;
  organizationId: string;
  proposedUpdateId: string | null;
}) {
  const policy = await getPolicySettings(input.organizationId);

  if (!policy.enabled) {
    return;
  }

  const request = await db
    .select({
      approvalCount: controlPublishRequests.approvalCount,
      requiredApprovalCount: controlPublishRequests.requiredApprovalCount,
    })
    .from(controlPublishRequests)
    .where(
      and(
        eq(controlPublishRequests.organizationId, input.organizationId),
        eq(controlPublishRequests.status, 'submitted'),
        input.draftControlId
          ? eq(controlPublishRequests.draftControlId, input.draftControlId)
          : eq(controlPublishRequests.proposedUpdateId, input.proposedUpdateId ?? ''),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!request || request.approvalCount < request.requiredApprovalCount) {
    throw new ControlPublishGovernanceInputError(
      'Control Approval Policy requires an approved Control Publish Request before publishing.',
    );
  }
}

export function canPublishControlPublishRequest(input: {
  approvalCount: number;
  requiredApprovalCount: number;
  status: string;
}) {
  return input.status === 'submitted' && input.approvalCount >= input.requiredApprovalCount;
}

export function ensureControlPublishRequestPublishAllowed(input: {
  approvalCount: number;
  requiredApprovalCount: number;
  status: string;
}) {
  if (input.status !== 'submitted') {
    throw new ControlPublishGovernanceInputError(
      'Only submitted Control Publish Requests can be published.',
    );
  }

  if (!canPublishControlPublishRequest(input)) {
    throw new ControlPublishGovernanceInputError(
      'Control Approval Policy requires an approved Control Publish Request before publishing.',
    );
  }
}

export function ensureControlPublishRequestApprovalAllowed(input: {
  approverMemberId: string;
  authorMemberId: string;
  status: string;
}) {
  if (input.authorMemberId === input.approverMemberId) {
    throw new ControlPublishGovernanceInputError(
      'Authors cannot approve their own Control Publish Requests.',
    );
  }

  if (input.status !== 'submitted') {
    throw new ControlPublishGovernanceInputError(
      'Only submitted Control Publish Requests can be approved.',
    );
  }
}

export function ensureControlPublishRequestRejectionAllowed(status: string) {
  if (status !== 'submitted') {
    throw new ControlPublishGovernanceInputError(
      'Only submitted Control Publish Requests can be rejected.',
    );
  }
}

export function ensureControlPublishRequestWithdrawalAllowed(input: {
  authorMemberId: string;
  memberId: string;
  status: string;
}) {
  if (input.authorMemberId !== input.memberId) {
    throw new ControlPublishGovernanceInputError(
      'Only the author can withdraw a Control Publish Request.',
    );
  }

  if (input.status !== 'submitted') {
    throw new ControlPublishGovernanceInputError(
      'Only submitted Control Publish Requests can be withdrawn.',
    );
  }
}

async function getPolicySettings(organizationId: string) {
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
    throw new ControlPublishGovernanceInputError('Organization not found.');
  }

  return organization;
}

async function getMaxRequiredApprovals(organizationId: string) {
  const eligibleApprovers = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(eq(members.organizationId, organizationId), inArray(members.role, ['owner', 'admin'])),
    );

  return Math.max(eligibleApprovers.length - 1, 0);
}
