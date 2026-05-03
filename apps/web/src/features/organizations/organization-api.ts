import type { RouterOutputs } from '@/lib/trpc';

export type InvitationEntryResponse = RouterOutputs['organizations']['invitationEntryState'];
export type MembershipResolutionResponse = RouterOutputs['organizations']['membershipResolution'];
export type OrganizationMemberListItem =
  RouterOutputs['organizations']['members']['members'][number];
