import type { RouterOutputs } from '@/lib/trpc';

export type ControlApprovalPolicy = RouterOutputs['controls']['approvalPolicy']['policy'];
export type ControlPublishRequestListItem =
  RouterOutputs['controls']['listPublishRequests']['publishRequests'][number];

export function canManageControlPublishGovernance(role: string | null) {
  return role === 'owner' || role === 'admin';
}

export function canCompleteDraftControl(input: {
  canPublishControls: boolean;
  controlApprovalPolicyEnabled: boolean;
}) {
  return input.canPublishControls || input.controlApprovalPolicyEnabled;
}

export function findSubmittedDraftControlPublishRequest(input: {
  draftControlId: string;
  publishRequests: ControlPublishRequestListItem[];
}) {
  return (
    input.publishRequests.find(
      (request) =>
        request.draftControlId === input.draftControlId && request.status === 'submitted',
    ) ?? null
  );
}

export function findSubmittedProposedUpdatePublishRequest(input: {
  proposedUpdateId: string;
  publishRequests: ControlPublishRequestListItem[];
}) {
  return (
    input.publishRequests.find(
      (request) =>
        request.proposedUpdateId === input.proposedUpdateId && request.status === 'submitted',
    ) ?? null
  );
}

export function canPublishControlPublishRequest(request: ControlPublishRequestListItem) {
  return request.isPublishable;
}
