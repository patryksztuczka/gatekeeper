import { TRPCError } from '@trpc/server';
import {
  controlPublishGovernanceAuthorizationActions,
  ControlPublishGovernanceInputError,
  getControlApprovalPolicy,
  normalizeControlApprovalPolicyUpdateBody,
  updateControlApprovalPolicy,
} from './control-publish-governance';
import {
  approveControlPublishRequest,
  cancelDraftControl,
  controlLibraryAuthorizationActions,
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
  rejectControlProposedUpdate,
  rejectControlPublishRequest,
  setControlArchivedForMembership,
  submitControlProposedUpdatePublishRequest,
  submitDraftControlPublishRequest,
  withdrawControlPublishRequest,
} from './controls';
import {
  authorizeOrganizationAction,
  authorizeOrganizationMemberAction,
  OrganizationAuthorizationError,
  type OrganizationAuthorizationPolicy,
} from '../identity-organization/organization-authorization';
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

function throwKnownInputError(caughtError: unknown): never {
  if (caughtError instanceof OrganizationAuthorizationError) {
    throw new TRPCError({
      code: caughtError.reason === 'not-found' ? 'NOT_FOUND' : 'FORBIDDEN',
      message: caughtError.message,
    });
  }

  if (
    caughtError instanceof DraftControlInputError ||
    caughtError instanceof ControlPublishInputError ||
    caughtError instanceof ControlProposedUpdateInputError ||
    caughtError instanceof ControlPublishRequestInputError ||
    caughtError instanceof ControlPublishGovernanceInputError
  ) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: caughtError.message });
  }

  throw caughtError;
}

async function authorizeControlAction(input: {
  action: OrganizationAuthorizationPolicy;
  organizationSlug: string;
  userId: string;
}) {
  try {
    return await authorizeOrganizationAction(input);
  } catch (caughtError) {
    throwKnownInputError(caughtError);
  }
}

export const controlsRouter = router({
  approvalPolicy: protectedProcedure.input(organizationSlugInput).query(async ({ ctx, input }) => {
    const membership = await authorizeControlAction({
      action: controlPublishGovernanceAuthorizationActions.viewPolicy,
      organizationSlug: input.organizationSlug,
      userId: ctx.session.user.id,
    });

    return { policy: await getControlApprovalPolicy(membership.organizationId) };
  }),

  updateApprovalPolicy: protectedProcedure
    .input(updateControlApprovalPolicyInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const membership = await authorizeOrganizationAction({
          action: controlPublishGovernanceAuthorizationActions.updatePolicy,
          organizationSlug: input.organizationSlug,
          userId: ctx.session.user.id,
        });

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
    const filters = normalizeControlListFilters({
      q: input.search,
      status: input.status,
    });

    const membership = await authorizeControlAction({
      action:
        filters.status === 'archived'
          ? controlLibraryAuthorizationActions.listArchived
          : controlLibraryAuthorizationActions.listActive,
      organizationSlug: input.organizationSlug,
      userId: ctx.session.user.id,
    });

    return { controls: await listControls(membership.organizationId, filters) };
  }),

  detail: protectedProcedure.input(controlIdentityInput).query(async ({ ctx, input }) => {
    const membership = await authorizeControlAction({
      action: controlLibraryAuthorizationActions.viewActive,
      organizationSlug: input.organizationSlug,
      userId: ctx.session.user.id,
    });
    const control = await getControlDetail(membership, input.controlId);

    if (!control) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Control unavailable' });
    }

    if (control.archivedAt) {
      try {
        authorizeOrganizationMemberAction({
          action: controlLibraryAuthorizationActions.viewArchived,
          member: membership,
        });
      } catch (caughtError) {
        throwKnownInputError(caughtError);
      }
    }

    return { control };
  }),

  listDrafts: protectedProcedure.input(draftControlListInput).query(async ({ ctx, input }) => {
    const membership = await authorizeControlAction({
      action: controlLibraryAuthorizationActions.listDrafts,
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
      const membership = await authorizeControlAction({
        action: controlLibraryAuthorizationActions.listProposedUpdates,
        organizationSlug: input.organizationSlug,
        userId: ctx.session.user.id,
      });

      return { proposedUpdates: await listControlProposedUpdates(membership) };
    }),

  listPublishRequests: protectedProcedure
    .input(organizationSlugInput)
    .query(async ({ ctx, input }) => {
      const membership = await authorizeControlAction({
        action: controlLibraryAuthorizationActions.listPublishRequests,
        organizationSlug: input.organizationSlug,
        userId: ctx.session.user.id,
      });

      return { publishRequests: await listControlPublishRequests(membership) };
    }),

  createDraft: protectedProcedure
    .input(createDraftControlInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const membership = await authorizeOrganizationAction({
          action: controlLibraryAuthorizationActions.createDraft,
          organizationSlug: input.organizationSlug,
          userId: ctx.session.user.id,
        });

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
      try {
        const membership = await authorizeOrganizationAction({
          action: controlLibraryAuthorizationActions.cancelDraft,
          organizationSlug: input.organizationSlug,
          userId: ctx.session.user.id,
        });
        const canceled = await cancelDraftControl(membership, input.draftControlId);

        if (!canceled) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Draft Control unavailable' });
        }

        return { canceled: true };
      } catch (caughtError) {
        throwKnownInputError(caughtError);
      }
    }),

  publishDraft: protectedProcedure
    .input(publishDraftControlInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const membership = await authorizeOrganizationAction({
          action: controlLibraryAuthorizationActions.publishDraft,
          organizationSlug: input.organizationSlug,
          userId: ctx.session.user.id,
        });
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
      try {
        const membership = await authorizeOrganizationAction({
          action: controlLibraryAuthorizationActions.submitDraftPublishRequest,
          organizationSlug: input.organizationSlug,
          userId: ctx.session.user.id,
        });
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
      try {
        const membership = await authorizeOrganizationAction({
          action: controlLibraryAuthorizationActions.createProposedUpdate,
          organizationSlug: input.organizationSlug,
          userId: ctx.session.user.id,
        });
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
      try {
        const membership = await authorizeOrganizationAction({
          action: controlLibraryAuthorizationActions.publishProposedUpdate,
          organizationSlug: input.organizationSlug,
          userId: ctx.session.user.id,
        });
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
      try {
        const membership = await authorizeOrganizationAction({
          action: controlLibraryAuthorizationActions.submitProposedUpdatePublishRequest,
          organizationSlug: input.organizationSlug,
          userId: ctx.session.user.id,
        });
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

  rejectProposedUpdate: protectedProcedure
    .input(proposedUpdateIdentityInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const membership = await authorizeOrganizationAction({
          action: controlLibraryAuthorizationActions.rejectProposedUpdate,
          organizationSlug: input.organizationSlug,
          userId: ctx.session.user.id,
        });
        const rejected = await rejectControlProposedUpdate(
          membership,
          input.controlId,
          input.proposedUpdateId,
        );

        if (!rejected) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Proposed update unavailable' });
        }

        return { rejected: true };
      } catch (caughtError) {
        throwKnownInputError(caughtError);
      }
    }),

  archive: protectedProcedure.input(archiveControlInput).mutation(async ({ ctx, input }) => {
    try {
      const membership = await authorizeOrganizationAction({
        action: controlLibraryAuthorizationActions.archive,
        organizationSlug: input.organizationSlug,
        userId: ctx.session.user.id,
      });
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
    } catch (caughtError) {
      throwKnownInputError(caughtError);
    }
  }),

  restore: protectedProcedure.input(controlIdentityInput).mutation(async ({ ctx, input }) => {
    try {
      const membership = await authorizeOrganizationAction({
        action: controlLibraryAuthorizationActions.restore,
        organizationSlug: input.organizationSlug,
        userId: ctx.session.user.id,
      });
      const control = await setControlArchivedForMembership({
        archived: false,
        controlId: input.controlId,
        membership,
      });

      if (!control) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Control unavailable' });
      }

      return { control };
    } catch (caughtError) {
      throwKnownInputError(caughtError);
    }
  }),

  approvePublishRequest: protectedProcedure
    .input(publishRequestIdentityInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const membership = await authorizeOrganizationAction({
          action: controlLibraryAuthorizationActions.approvePublishRequest,
          organizationSlug: input.organizationSlug,
          userId: ctx.session.user.id,
        });
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
      try {
        const membership = await authorizeOrganizationAction({
          action: controlLibraryAuthorizationActions.rejectPublishRequest,
          organizationSlug: input.organizationSlug,
          userId: ctx.session.user.id,
        });
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
      try {
        const membership = await authorizeOrganizationAction({
          action: controlLibraryAuthorizationActions.withdrawPublishRequest,
          organizationSlug: input.organizationSlug,
          userId: ctx.session.user.id,
        });
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
      try {
        const membership = await authorizeOrganizationAction({
          action: controlLibraryAuthorizationActions.publishPublishRequest,
          organizationSlug: input.organizationSlug,
          userId: ctx.session.user.id,
        });
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
