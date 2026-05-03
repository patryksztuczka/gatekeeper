import { TRPCError } from '@trpc/server';
import { resolveInvitationEntryState, resolveMembershipResolution } from '../lib/auth-organization';
import { getOrganizationMembership, listOrganizationMembers } from '../lib/projects';
import { invitationEntryStateInput, organizationSlugInput } from '../schemas/organization-schemas';
import { protectedProcedure, publicProcedure, router } from './core';

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
    const membership = await getOrganizationMembership(input.organizationSlug, ctx.session.user.id);

    if (!membership) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Organization not found' });
    }

    return { members: await listOrganizationMembers(membership.organizationId) };
  }),
});
