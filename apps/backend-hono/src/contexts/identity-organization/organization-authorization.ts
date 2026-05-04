import type { AuthorizedOrganizationMember } from '../../types/organization-types';
import { getOrganizationMembership } from './organization-membership';

export type OrganizationAuthorizationPolicy = {
  allowedRoles: readonly string[] | 'any-member';
  deniedMessage: string;
};

export type OrganizationAuthorizationErrorReason = 'forbidden' | 'not-found';

export class OrganizationAuthorizationError extends Error {
  readonly reason: OrganizationAuthorizationErrorReason;

  constructor(message: string, reason: OrganizationAuthorizationErrorReason) {
    super(message);
    this.reason = reason;
  }
}

export async function authorizeOrganizationAction(input: {
  action: OrganizationAuthorizationPolicy;
  organizationSlug: string;
  userId: string;
}) {
  const membership = await getOrganizationMembership(input.organizationSlug, input.userId);

  if (!membership) {
    throw new OrganizationAuthorizationError('Organization not found', 'not-found');
  }

  return authorizeOrganizationMemberAction({
    action: input.action,
    member: {
      id: membership.id,
      organizationId: membership.organizationId,
      organizationSlug: membership.organizationSlug,
      role: membership.role,
    },
  });
}

export function authorizeOrganizationMemberAction(input: {
  action: OrganizationAuthorizationPolicy;
  member: AuthorizedOrganizationMember;
}) {
  if (
    input.action.allowedRoles !== 'any-member' &&
    !input.action.allowedRoles.includes(input.member.role)
  ) {
    throw new OrganizationAuthorizationError(input.action.deniedMessage, 'forbidden');
  }

  return input.member;
}
