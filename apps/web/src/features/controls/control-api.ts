import type { RouterOutputs } from '@/lib/trpc';

export type ControlApprovalPolicy = RouterOutputs['controls']['approvalPolicy']['policy'];
export type ControlListItem = RouterOutputs['controls']['list']['controls'][number];
export type DraftControlListItem = RouterOutputs['controls']['listDrafts']['draftControls'][number];
export type ControlProposedUpdateListItem =
  RouterOutputs['controls']['listProposedUpdates']['proposedUpdates'][number];
export type ControlPublishRequestListItem =
  RouterOutputs['controls']['listPublishRequests']['publishRequests'][number];
