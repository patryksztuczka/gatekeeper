import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../../trpc/core';
import { organizationSlugInput } from '../identity-organization/organization-schemas';
import {
  authorizeOrganizationAction,
  OrganizationAuthorizationError,
} from '../identity-organization/organization-authorization';
import { auditLogAuthorizationActions, listAuditEventsForViewer } from './audit-log';

function toAuditLogError(caughtError: unknown): never {
  if (caughtError instanceof OrganizationAuthorizationError) {
    throw new TRPCError({
      code: caughtError.reason === 'not-found' ? 'NOT_FOUND' : 'FORBIDDEN',
      message: caughtError.message,
    });
  }

  throw caughtError;
}

export const auditLogRouter = router({
  list: protectedProcedure.input(organizationSlugInput).query(async ({ ctx, input }) => {
    try {
      const membership = await authorizeOrganizationAction({
        action: auditLogAuthorizationActions.list,
        organizationSlug: input.organizationSlug,
        userId: ctx.session.user.id,
      });

      return {
        auditEvents: await listAuditEventsForViewer(membership),
      };
    } catch (caughtError) {
      toAuditLogError(caughtError);
    }
  }),
});
