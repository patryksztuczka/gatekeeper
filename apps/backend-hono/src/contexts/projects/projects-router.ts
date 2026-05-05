import { TRPCError } from '@trpc/server';
import {
  authorizeOrganizationAction,
  OrganizationAuthorizationError,
} from '../identity-organization/organization-authorization';
import {
  archiveProjectForMember,
  createProjectAssignmentForMember,
  createProjectForMember,
  listProjectsForMember,
  projectAuthorizationActions,
  ProjectInputError,
  restoreProjectForMember,
  updateProjectSettingsForMember,
  viewProjectForMember,
} from './projects';
import {
  projectCreateInput,
  projectAssignmentCreateInput,
  projectIdentityInput,
  projectListInput,
  projectUpdateInput,
} from './projects-schemas';
import { protectedProcedure, router } from '../../trpc/core';

function toProjectInputError(caughtError: unknown): never {
  if (caughtError instanceof OrganizationAuthorizationError) {
    throw new TRPCError({
      code: caughtError.reason === 'not-found' ? 'NOT_FOUND' : 'FORBIDDEN',
      message: caughtError.message,
    });
  }

  if (caughtError instanceof ProjectInputError) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: caughtError.message });
  }

  throw caughtError;
}

export const projectsRouter = router({
  list: protectedProcedure.input(projectListInput).query(async ({ ctx, input }) => {
    try {
      const membership = await authorizeOrganizationAction({
        action:
          input.status === 'archived'
            ? projectAuthorizationActions.listArchived
            : projectAuthorizationActions.listActive,
        organizationSlug: input.organizationSlug,
        userId: ctx.session.user.id,
      });

      return {
        projects: await listProjectsForMember(membership, input.status),
      };
    } catch (caughtError) {
      toProjectInputError(caughtError);
    }
  }),

  detail: protectedProcedure.input(projectIdentityInput).query(async ({ ctx, input }) => {
    let membership;

    try {
      membership = await authorizeOrganizationAction({
        action: projectAuthorizationActions.view,
        organizationSlug: input.organizationSlug,
        userId: ctx.session.user.id,
      });
    } catch (caughtError) {
      if (caughtError instanceof OrganizationAuthorizationError) {
        return { status: 'unavailable' as const };
      }

      throw caughtError;
    }

    const project = await viewProjectForMember(membership, input.projectSlug);

    return project ? { status: 'available' as const, project } : { status: 'unavailable' as const };
  }),

  create: protectedProcedure.input(projectCreateInput).mutation(async ({ ctx, input }) => {
    try {
      const membership = await authorizeOrganizationAction({
        action: projectAuthorizationActions.create,
        organizationSlug: input.organizationSlug,
        userId: ctx.session.user.id,
      });

      return {
        project: await createProjectForMember(membership, input),
      };
    } catch (caughtError) {
      toProjectInputError(caughtError);
    }
  }),

  createAssignment: protectedProcedure
    .input(projectAssignmentCreateInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const membership = await authorizeOrganizationAction({
          action: projectAuthorizationActions.createAssignment,
          organizationSlug: input.organizationSlug,
          userId: ctx.session.user.id,
        });
        const assignment = await createProjectAssignmentForMember({
          assignment: input,
          membership,
          projectSlug: input.projectSlug,
        });

        if (!assignment) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Project unavailable' });
        }

        return { assignment };
      } catch (caughtError) {
        toProjectInputError(caughtError);
      }
    }),

  update: protectedProcedure.input(projectUpdateInput).mutation(async ({ ctx, input }) => {
    try {
      const membership = await authorizeOrganizationAction({
        action: projectAuthorizationActions.update,
        organizationSlug: input.organizationSlug,
        userId: ctx.session.user.id,
      });
      const project = await updateProjectSettingsForMember({
        membership,
        projectSlug: input.projectSlug,
        settings: input,
      });

      if (!project) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Project unavailable' });
      }

      return { project };
    } catch (caughtError) {
      toProjectInputError(caughtError);
    }
  }),

  archive: protectedProcedure.input(projectIdentityInput).mutation(async ({ ctx, input }) => {
    try {
      const membership = await authorizeOrganizationAction({
        action: projectAuthorizationActions.archive,
        organizationSlug: input.organizationSlug,
        userId: ctx.session.user.id,
      });
      const project = await archiveProjectForMember({
        membership,
        projectSlug: input.projectSlug,
      });

      if (!project) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Project unavailable' });
      }

      return { project };
    } catch (caughtError) {
      toProjectInputError(caughtError);
    }
  }),

  restore: protectedProcedure.input(projectIdentityInput).mutation(async ({ ctx, input }) => {
    try {
      const membership = await authorizeOrganizationAction({
        action: projectAuthorizationActions.restore,
        organizationSlug: input.organizationSlug,
        userId: ctx.session.user.id,
      });
      const project = await restoreProjectForMember({
        membership,
        projectSlug: input.projectSlug,
      });

      if (!project) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Project unavailable' });
      }

      return { project };
    } catch (caughtError) {
      toProjectInputError(caughtError);
    }
  }),
});
