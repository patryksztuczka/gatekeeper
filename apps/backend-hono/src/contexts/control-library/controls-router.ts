import { TRPCError } from '@trpc/server';
import {
  canManageControlApprovalPolicy,
  ControlApprovalPolicyInputError,
  getControlApprovalPolicy,
  normalizeControlApprovalPolicyUpdateBody,
  updateControlApprovalPolicy,
} from './control-approval-policy';
import {
  approveControlPublishRequest,
  canArchiveControls,
  canPublishControls,
  cancelDraftControl,
  ControlProposedUpdateInputError,
  ControlPublishInputError,
  ControlPublishRequestInputError,
  createControlProposedUpdate,
  createDraftControl,
  DraftControlInputError,
  getControlDetail,
  listControlProposedUpdates,
  listControlPublishRequests,
  listControls,
  listDraftControls,
  normalizeControlArchiveBody,
  normalizeControlListFilters,
  normalizeControlProposedUpdateBody,
  normalizeControlPublishRequestRejectionBody,
  normalizeDraftControlCreateBody,
  normalizeDraftControlListFilters,
  normalizeDraftControlPublishBody,
  publishControlProposedUpdate,
  publishControlPublishRequest,
  publishDraftControl,
  rejectControlPublishRequest,
  setControlArchivedForMembership,
  submitControlProposedUpdatePublishRequest,
  submitDraftControlPublishRequest,
  withdrawControlPublishRequest,
} from './controls';
import { getOrganizationMembership } from '../identity-organization/organization-membership';
import {
  archiveControlInput,
  controlIdentityInput,
  controlListInput,
  createDraftControlInput,
  createProposedUpdateInput,
  draftControlIdentityInput,
  draftControlListInput,
  proposedUpdateIdentityInput,
  publishDraftControlInput,
  publishRequestIdentityInput,
  rejectPublishRequestInput,
  submitDraftPublishRequestInput,
  updateControlApprovalPolicyInput,
} from './controls-schemas';
import { organizationSlugInput } from '../identity-organization/organization-schemas';
import { protectedProcedure, router } from '../../trpc/core';

async function getMembershipOrThrow(input: { organizationSlug: string; userId: string }) {
  const membership = await getOrganizationMembership(input.organizationSlug, input.userId);

  if (!membership) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Organization not found' });
  }

  return membership;
}

function throwKnownInputError(caughtError: unknown): never {
  if (
    caughtError instanceof DraftControlInputError ||
    caughtError instanceof ControlPublishInputError ||
    caughtError instanceof ControlProposedUpdateInputError ||
    caughtError instanceof ControlPublishRequestInputError ||
    caughtError instanceof ControlApprovalPolicyInputError
  ) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: caughtError.message });
  }

  throw caughtError;
}

export const controlsRouter = router({
  approvalPolicy: protectedProcedure.input(organizationSlugInput).query(async ({ ctx, input }) => {
    const membership = await getMembershipOrThrow({
      organizationSlug: input.organizationSlug,
      userId: ctx.session.user.id,
    });

    return { policy: await getControlApprovalPolicy(membership.organizationId) };
  }),

  updateApprovalPolicy: protectedProcedure
    .input(updateControlApprovalPolicyInput)
    .mutation(async ({ ctx, input }) => {
      const membership = await getMembershipOrThrow({
        organizationSlug: input.organizationSlug,
        userId: ctx.session.user.id,
      });

      if (!canManageControlApprovalPolicy(membership.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only Organization owners and admins can edit Control Approval Policy.',
        });
      }

      try {
        return {
          policy: await updateControlApprovalPolicy(
            membership,
            normalizeControlApprovalPolicyUpdateBody(input),
          ),
        };
      } catch (caughtError) {
        throwKnownInputError(caughtError);
      }
    }),

  list: protectedProcedure.input(controlListInput).query(async ({ ctx, input }) => {
    const membership = await getMembershipOrThrow({
      organizationSlug: input.organizationSlug,
      userId: ctx.session.user.id,
    });
    const filters = normalizeControlListFilters({
      acceptedEvidenceType: input.acceptedEvidenceType,
      q: input.search,
      releaseImpact: input.releaseImpact,
      standardsFramework: input.standardsFramework,
      status: input.status,
    });

    if (filters.status === 'archived' && !canArchiveControls(membership.role)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Only Organization owners and admins can view archived Controls.',
      });
    }

    return { controls: await listControls(membership.organizationId, filters) };
  }),

  detail: protectedProcedure.input(controlIdentityInput).query(async ({ ctx, input }) => {
    const membership = await getMembershipOrThrow({
      organizationSlug: input.organizationSlug,
      userId: ctx.session.user.id,
    });
    const control = await getControlDetail(membership, input.controlId);

    if (!control) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Control unavailable' });
    }

    return { control };
  }),

  listDrafts: protectedProcedure.input(draftControlListInput).query(async ({ ctx, input }) => {
    const membership = await getMembershipOrThrow({
      organizationSlug: input.organizationSlug,
      userId: ctx.session.user.id,
    });

    return {
      draftControls: await listDraftControls(
        membership,
        normalizeDraftControlListFilters({ q: input.search }),
      ),
    };
  }),

  listProposedUpdates: protectedProcedure
    .input(organizationSlugInput)
    .query(async ({ ctx, input }) => {
      const membership = await getMembershipOrThrow({
        organizationSlug: input.organizationSlug,
        userId: ctx.session.user.id,
      });

      return { proposedUpdates: await listControlProposedUpdates(membership) };
    }),

  listPublishRequests: protectedProcedure
    .input(organizationSlugInput)
    .query(async ({ ctx, input }) => {
      const membership = await getMembershipOrThrow({
        organizationSlug: input.organizationSlug,
        userId: ctx.session.user.id,
      });

      return { publishRequests: await listControlPublishRequests(membership) };
    }),

  createDraft: protectedProcedure
    .input(createDraftControlInput)
    .mutation(async ({ ctx, input }) => {
      const membership = await getMembershipOrThrow({
        organizationSlug: input.organizationSlug,
        userId: ctx.session.user.id,
      });

      try {
        return {
          draftControl: await createDraftControl(
            membership,
            normalizeDraftControlCreateBody(input),
          ),
        };
      } catch (caughtError) {
        throwKnownInputError(caughtError);
      }
    }),

  cancelDraft: protectedProcedure
    .input(draftControlIdentityInput)
    .mutation(async ({ ctx, input }) => {
      const membership = await getMembershipOrThrow({
        organizationSlug: input.organizationSlug,
        userId: ctx.session.user.id,
      });
      const canceled = await cancelDraftControl(membership, input.draftControlId);

      if (!canceled) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Draft Control unavailable' });
      }

      return { canceled: true };
    }),

  publishDraft: protectedProcedure
    .input(publishDraftControlInput)
    .mutation(async ({ ctx, input }) => {
      const membership = await getMembershipOrThrow({
        organizationSlug: input.organizationSlug,
        userId: ctx.session.user.id,
      });

      if (!canPublishControls(membership.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only Organization owners and admins can publish Controls.',
        });
      }

      try {
        const control = await publishDraftControl(
          membership,
          input.draftControlId,
          normalizeDraftControlPublishBody(input),
        );

        if (!control) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Draft Control unavailable' });
        }

        return { control };
      } catch (caughtError) {
        throwKnownInputError(caughtError);
      }
    }),

  submitDraftPublishRequest: protectedProcedure
    .input(submitDraftPublishRequestInput)
    .mutation(async ({ ctx, input }) => {
      const membership = await getMembershipOrThrow({
        organizationSlug: input.organizationSlug,
        userId: ctx.session.user.id,
      });

      try {
        const publishRequest = await submitDraftControlPublishRequest(
          membership,
          input.draftControlId,
          normalizeDraftControlPublishBody(input),
        );

        if (!publishRequest) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Draft Control unavailable' });
        }

        return { publishRequest };
      } catch (caughtError) {
        throwKnownInputError(caughtError);
      }
    }),

  createProposedUpdate: protectedProcedure
    .input(createProposedUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const membership = await getMembershipOrThrow({
        organizationSlug: input.organizationSlug,
        userId: ctx.session.user.id,
      });

      try {
        const proposedUpdate = await createControlProposedUpdate(
          membership,
          input.controlId,
          normalizeControlProposedUpdateBody(input),
        );

        if (!proposedUpdate) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Control unavailable' });
        }

        return { proposedUpdate };
      } catch (caughtError) {
        throwKnownInputError(caughtError);
      }
    }),

  publishProposedUpdate: protectedProcedure
    .input(proposedUpdateIdentityInput)
    .mutation(async ({ ctx, input }) => {
      const membership = await getMembershipOrThrow({
        organizationSlug: input.organizationSlug,
        userId: ctx.session.user.id,
      });

      if (!canPublishControls(membership.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only Organization owners and admins can publish Controls.',
        });
      }

      try {
        const control = await publishControlProposedUpdate(
          membership,
          input.controlId,
          input.proposedUpdateId,
        );

        if (!control) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Proposed update unavailable' });
        }

        return { control };
      } catch (caughtError) {
        throwKnownInputError(caughtError);
      }
    }),

  submitProposedUpdatePublishRequest: protectedProcedure
    .input(proposedUpdateIdentityInput)
    .mutation(async ({ ctx, input }) => {
      const membership = await getMembershipOrThrow({
        organizationSlug: input.organizationSlug,
        userId: ctx.session.user.id,
      });

      try {
        const publishRequest = await submitControlProposedUpdatePublishRequest(
          membership,
          input.controlId,
          input.proposedUpdateId,
        );

        if (!publishRequest) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Proposed update unavailable' });
        }

        return { publishRequest };
      } catch (caughtError) {
        throwKnownInputError(caughtError);
      }
    }),

  archive: protectedProcedure.input(archiveControlInput).mutation(async ({ ctx, input }) => {
    const membership = await getMembershipOrThrow({
      organizationSlug: input.organizationSlug,
      userId: ctx.session.user.id,
    });

    if (!canArchiveControls(membership.role)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Only Organization owners and admins can archive Controls.',
      });
    }

    const control = await setControlArchivedForMembership({
      archived: true,
      controlId: input.controlId,
      membership,
      reason: normalizeControlArchiveBody(input).reason,
    });

    if (!control) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Control unavailable' });
    }

    return { control };
  }),

  restore: protectedProcedure.input(controlIdentityInput).mutation(async ({ ctx, input }) => {
    const membership = await getMembershipOrThrow({
      organizationSlug: input.organizationSlug,
      userId: ctx.session.user.id,
    });

    if (!canArchiveControls(membership.role)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Only Organization owners and admins can restore Controls.',
      });
    }

    const control = await setControlArchivedForMembership({
      archived: false,
      controlId: input.controlId,
      membership,
    });

    if (!control) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Control unavailable' });
    }

    return { control };
  }),

  approvePublishRequest: protectedProcedure
    .input(publishRequestIdentityInput)
    .mutation(async ({ ctx, input }) => {
      const membership = await getMembershipOrThrow({
        organizationSlug: input.organizationSlug,
        userId: ctx.session.user.id,
      });

      try {
        const publishRequest = await approveControlPublishRequest(
          membership,
          input.publishRequestId,
        );

        if (!publishRequest) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Control Publish Request unavailable',
          });
        }

        return { publishRequest };
      } catch (caughtError) {
        throwKnownInputError(caughtError);
      }
    }),

  rejectPublishRequest: protectedProcedure
    .input(rejectPublishRequestInput)
    .mutation(async ({ ctx, input }) => {
      const membership = await getMembershipOrThrow({
        organizationSlug: input.organizationSlug,
        userId: ctx.session.user.id,
      });

      try {
        const publishRequest = await rejectControlPublishRequest(
          membership,
          input.publishRequestId,
          normalizeControlPublishRequestRejectionBody(input),
        );

        if (!publishRequest) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Control Publish Request unavailable',
          });
        }

        return { publishRequest };
      } catch (caughtError) {
        throwKnownInputError(caughtError);
      }
    }),

  withdrawPublishRequest: protectedProcedure
    .input(publishRequestIdentityInput)
    .mutation(async ({ ctx, input }) => {
      const membership = await getMembershipOrThrow({
        organizationSlug: input.organizationSlug,
        userId: ctx.session.user.id,
      });

      try {
        const publishRequest = await withdrawControlPublishRequest(
          membership,
          input.publishRequestId,
        );

        if (!publishRequest) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Control Publish Request unavailable',
          });
        }

        return { publishRequest };
      } catch (caughtError) {
        throwKnownInputError(caughtError);
      }
    }),

  publishPublishRequest: protectedProcedure
    .input(publishRequestIdentityInput)
    .mutation(async ({ ctx, input }) => {
      const membership = await getMembershipOrThrow({
        organizationSlug: input.organizationSlug,
        userId: ctx.session.user.id,
      });

      try {
        const control = await publishControlPublishRequest(membership, input.publishRequestId);

        if (!control) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Control Publish Request unavailable',
          });
        }

        return { control };
      } catch (caughtError) {
        throwKnownInputError(caughtError);
      }
    }),
});
