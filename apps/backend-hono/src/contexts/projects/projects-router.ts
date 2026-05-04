import { TRPCError } from '@trpc/server';
import { getOrganizationMembership } from '../identity-organization/organization-membership';
import {
  canManageProjects,
  createProject,
  getProjectDetailForMember,
  listProjects,
  normalizeProjectCreateBody,
  normalizeProjectUpdateBody,
  ProjectInputError,
  setProjectArchivedForMembership,
  updateProjectForMembership,
} from './projects';
import {
  projectCreateInput,
  projectIdentityInput,
  projectListInput,
  projectUpdateInput,
} from './projects-schemas';
import { protectedProcedure, router } from '../../trpc/core';

async function getMembershipOrThrow(input: { organizationSlug: string; userId: string }) {
  const membership = await getOrganizationMembership(input.organizationSlug, input.userId);

  if (!membership) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Organization not found' });
  }

  return membership;
}

function toProjectInputError(caughtError: unknown): never {
  if (caughtError instanceof ProjectInputError) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: caughtError.message });
  }

  throw caughtError;
}

export const projectsRouter = router({
  list: protectedProcedure.input(projectListInput).query(async ({ ctx, input }) => {
    const membership = await getMembershipOrThrow({
      organizationSlug: input.organizationSlug,
      userId: ctx.session.user.id,
    });

    return {
      projects: await listProjects(membership.organizationId, input.status),
    };
  }),

  detail: protectedProcedure.input(projectIdentityInput).query(async ({ ctx, input }) => {
    const project = await getProjectDetailForMember({
      organizationSlug: input.organizationSlug,
      projectSlug: input.projectSlug,
      userId: ctx.session.user.id,
    });

    return project ? { status: 'available' as const, project } : { status: 'unavailable' as const };
  }),

  create: protectedProcedure.input(projectCreateInput).mutation(async ({ ctx, input }) => {
    const membership = await getMembershipOrThrow({
      organizationSlug: input.organizationSlug,
      userId: ctx.session.user.id,
    });

    if (!canManageProjects(membership.role)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Only Organization owners and admins can create Projects.',
      });
    }

    try {
      return {
        project: await createProject(membership.organizationId, normalizeProjectCreateBody(input)),
      };
    } catch (caughtError) {
      toProjectInputError(caughtError);
    }
  }),

  update: protectedProcedure.input(projectUpdateInput).mutation(async ({ ctx, input }) => {
    const membership = await getMembershipOrThrow({
      organizationSlug: input.organizationSlug,
      userId: ctx.session.user.id,
    });

    if (!canManageProjects(membership.role)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Only Organization owners and admins can edit Projects.',
      });
    }

    try {
      const project = await updateProjectForMembership({
        membership,
        projectSlug: input.projectSlug,
        updates: normalizeProjectUpdateBody(input),
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
    const membership = await getMembershipOrThrow({
      organizationSlug: input.organizationSlug,
      userId: ctx.session.user.id,
    });

    if (!canManageProjects(membership.role)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Only Organization owners and admins can archive Projects.',
      });
    }

    const project = await setProjectArchivedForMembership({
      archived: true,
      membership,
      projectSlug: input.projectSlug,
    });

    if (!project) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Project unavailable' });
    }

    return { project };
  }),

  restore: protectedProcedure.input(projectIdentityInput).mutation(async ({ ctx, input }) => {
    const membership = await getMembershipOrThrow({
      organizationSlug: input.organizationSlug,
      userId: ctx.session.user.id,
    });

    if (!canManageProjects(membership.role)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Only Organization owners and admins can restore Projects.',
      });
    }

    const project = await setProjectArchivedForMembership({
      archived: false,
      membership,
      projectSlug: input.projectSlug,
    });

    if (!project) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Project unavailable' });
    }

    return { project };
  }),
});
