import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../../trpc/core';
import {
  authorizeOrganizationAction,
  OrganizationAuthorizationError,
} from '../identity-organization/organization-authorization';
import { auditLogAuthorizationActions, listAuditEventsForViewer } from './audit-log';
import { auditLogListInput } from './audit-log-schemas';

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
  list: protectedProcedure.input(auditLogListInput).query(async ({ ctx, input }) => {
    try {
      const membership = await authorizeOrganizationAction({
        action: auditLogAuthorizationActions.list,
        organizationSlug: input.organizationSlug,
        userId: ctx.session.user.id,
      });

      return {
        auditEvents: await listAuditEventsForViewer(membership, {
          action: input.action,
          limit: input.limit,
          offset: input.offset,
          targetId: input.targetId,
          targetType: input.targetType,
        }),
      };
    } catch (caughtError) {
      toAuditLogError(caughtError);
    }
  }),
});
