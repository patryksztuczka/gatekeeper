import { TRPCError } from '@trpc/server';
import { resolveInvitationEntryState, resolveMembershipResolution } from './auth-organization';
import {
  listOrganizationMembers,
  organizationMembershipAuthorizationActions,
} from './organization-membership';
import {
  authorizeOrganizationAction,
  OrganizationAuthorizationError,
} from './organization-authorization';
import { invitationEntryStateInput, organizationSlugInput } from './organization-schemas';
import { protectedProcedure, publicProcedure, router } from '../../trpc/core';

export const organizationsRouter = router({
  membershipResolution: protectedProcedure.query(async ({ ctx }) => {
    return resolveMembershipResolution({
      currentActiveOrganizationId: ctx.session.session.activeOrganizationId ?? null,
      sessionId: ctx.session.session.id,
      userEmail: ctx.session.user.email,
      userId: ctx.session.user.id,
    });
  }),

  invitationEntryState: publicProcedure
    .input(invitationEntryStateInput)
    .query(async ({ ctx, input }) => {
      return resolveInvitationEntryState(
        input.invitationId,
        ctx.session
          ? {
              email: ctx.session.user.email,
              emailVerified: ctx.session.user.emailVerified,
            }
          : null,
      );
    }),

  members: protectedProcedure.input(organizationSlugInput).query(async ({ ctx, input }) => {
    try {
      const membership = await authorizeOrganizationAction({
        action: organizationMembershipAuthorizationActions.listMembers,
        organizationSlug: input.organizationSlug,
        userId: ctx.session.user.id,
      });

      return { members: await listOrganizationMembers(membership.organizationId) };
    } catch (caughtError) {
      if (caughtError instanceof OrganizationAuthorizationError) {
        throw new TRPCError({
          code: caughtError.reason === 'not-found' ? 'NOT_FOUND' : 'FORBIDDEN',
          message: caughtError.message,
        });
      }

      throw caughtError;
    }
  }),
});
