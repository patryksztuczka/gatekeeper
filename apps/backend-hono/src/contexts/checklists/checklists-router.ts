import { TRPCError } from '@trpc/server';
import {
  authorizeOrganizationAction,
  OrganizationAuthorizationError,
} from '../identity-organization/organization-authorization';
import {
  checklistAuthorizationActions,
  ChecklistInputError,
  ChecklistPermissionError,
  addChecklistItemForMember,
  archiveChecklistTemplateForMember,
  archiveProjectChecklistForMember,
  createChecklistTemplateForMember,
  createProjectChecklistForMember,
  enforceArchivedControlForMember,
  listChecklistTemplatesForMember,
  listProjectChecklistsForMember,
  refreshChecklistItemForMember,
  removeChecklistItemForMember,
  renameChecklistTemplateForMember,
  renameProjectChecklistForMember,
  restoreChecklistTemplateForMember,
  restoreProjectChecklistForMember,
  setChecklistItemCheckedForMember,
} from './checklists';
import {
  checklistControlInput,
  checklistItemIdentityInput,
  checklistTemplateIdentityInput,
  checklistTemplateListInput,
  createChecklistTemplateInput,
  createProjectChecklistInput,
  projectChecklistIdentityInput,
  projectChecklistListInput,
  renameChecklistTemplateInput,
  renameProjectChecklistInput,
  setChecklistItemCheckedInput,
} from './checklists-schemas';
import { protectedProcedure, router } from '../../trpc/core';

function throwKnownChecklistError(caughtError: unknown): never {
  if (caughtError instanceof OrganizationAuthorizationError) {
    throw new TRPCError({
      code: caughtError.reason === 'not-found' ? 'NOT_FOUND' : 'FORBIDDEN',
      message: caughtError.message,
    });
  }

  if (caughtError instanceof ChecklistInputError) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: caughtError.message });
  }

  if (caughtError instanceof ChecklistPermissionError) {
    throw new TRPCError({ code: 'FORBIDDEN', message: caughtError.message });
  }

  throw caughtError;
}

export const checklistsRouter = router({
  createTemplate: protectedProcedure
    .input(createChecklistTemplateInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const membership = await authorizeOrganizationAction({
          action: checklistAuthorizationActions.createTemplate,
          organizationSlug: input.organizationSlug,
          userId: ctx.session.user.id,
        });

        return {
          checklistTemplate: await createChecklistTemplateForMember(membership, input),
        };
      } catch (caughtError) {
        throwKnownChecklistError(caughtError);
      }
    }),

  listTemplates: protectedProcedure
    .input(checklistTemplateListInput)
    .query(async ({ ctx, input }) => {
      try {
        const membership = await authorizeOrganizationAction({
          action: checklistAuthorizationActions.listTemplates,
          organizationSlug: input.organizationSlug,
          userId: ctx.session.user.id,
        });

        return {
          checklistTemplates: await listChecklistTemplatesForMember(membership, input.status),
        };
      } catch (caughtError) {
        throwKnownChecklistError(caughtError);
      }
    }),

  renameTemplate: protectedProcedure
    .input(renameChecklistTemplateInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const membership = await authorizeOrganizationAction({
          action: checklistAuthorizationActions.renameTemplate,
          organizationSlug: input.organizationSlug,
          userId: ctx.session.user.id,
        });
        const checklistTemplate = await renameChecklistTemplateForMember(membership, input);

        if (!checklistTemplate) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Checklist Template unavailable' });
        }

        return { checklistTemplate };
      } catch (caughtError) {
        throwKnownChecklistError(caughtError);
      }
    }),

  archiveTemplate: protectedProcedure
    .input(checklistTemplateIdentityInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const membership = await authorizeOrganizationAction({
          action: checklistAuthorizationActions.archiveTemplate,
          organizationSlug: input.organizationSlug,
          userId: ctx.session.user.id,
        });
        const checklistTemplate = await archiveChecklistTemplateForMember(
          membership,
          input.checklistTemplateId,
        );

        if (!checklistTemplate) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Checklist Template unavailable' });
        }

        return { checklistTemplate };
      } catch (caughtError) {
        throwKnownChecklistError(caughtError);
      }
    }),

  restoreTemplate: protectedProcedure
    .input(checklistTemplateIdentityInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const membership = await authorizeOrganizationAction({
          action: checklistAuthorizationActions.restoreTemplate,
          organizationSlug: input.organizationSlug,
          userId: ctx.session.user.id,
        });
        const checklistTemplate = await restoreChecklistTemplateForMember(
          membership,
          input.checklistTemplateId,
        );

        if (!checklistTemplate) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Checklist Template unavailable' });
        }

        return { checklistTemplate };
      } catch (caughtError) {
        throwKnownChecklistError(caughtError);
      }
    }),

  createProjectChecklist: protectedProcedure
    .input(createProjectChecklistInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const membership = await authorizeOrganizationAction({
          action: checklistAuthorizationActions.createProjectChecklist,
          organizationSlug: input.organizationSlug,
          userId: ctx.session.user.id,
        });
        const projectChecklist = await createProjectChecklistForMember(membership, input);

        if (!projectChecklist) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Project unavailable' });
        }

        return { projectChecklist };
      } catch (caughtError) {
        throwKnownChecklistError(caughtError);
      }
    }),

  listProjectChecklists: protectedProcedure
    .input(projectChecklistListInput)
    .query(async ({ ctx, input }) => {
      try {
        const membership = await authorizeOrganizationAction({
          action: checklistAuthorizationActions.listProjectChecklists,
          organizationSlug: input.organizationSlug,
          userId: ctx.session.user.id,
        });
        const projectChecklists = await listProjectChecklistsForMember(membership, input);

        if (!projectChecklists) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Project unavailable' });
        }

        return { projectChecklists };
      } catch (caughtError) {
        throwKnownChecklistError(caughtError);
      }
    }),

  renameProjectChecklist: protectedProcedure
    .input(renameProjectChecklistInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const membership = await authorizeOrganizationAction({
          action: checklistAuthorizationActions.renameProjectChecklist,
          organizationSlug: input.organizationSlug,
          userId: ctx.session.user.id,
        });
        const projectChecklist = await renameProjectChecklistForMember(membership, input);

        if (!projectChecklist) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Project Checklist unavailable' });
        }

        return { projectChecklist };
      } catch (caughtError) {
        throwKnownChecklistError(caughtError);
      }
    }),

  archiveProjectChecklist: protectedProcedure
    .input(projectChecklistIdentityInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const membership = await authorizeOrganizationAction({
          action: checklistAuthorizationActions.archiveProjectChecklist,
          organizationSlug: input.organizationSlug,
          userId: ctx.session.user.id,
        });
        const projectChecklist = await archiveProjectChecklistForMember(
          membership,
          input.projectChecklistId,
        );

        if (!projectChecklist) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Project Checklist unavailable' });
        }

        return { projectChecklist };
      } catch (caughtError) {
        throwKnownChecklistError(caughtError);
      }
    }),

  restoreProjectChecklist: protectedProcedure
    .input(projectChecklistIdentityInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const membership = await authorizeOrganizationAction({
          action: checklistAuthorizationActions.restoreProjectChecklist,
          organizationSlug: input.organizationSlug,
          userId: ctx.session.user.id,
        });
        const projectChecklist = await restoreProjectChecklistForMember(
          membership,
          input.projectChecklistId,
        );

        if (!projectChecklist) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Project Checklist unavailable' });
        }

        return { projectChecklist };
      } catch (caughtError) {
        throwKnownChecklistError(caughtError);
      }
    }),

  addChecklistItem: protectedProcedure
    .input(checklistControlInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const membership = await authorizeOrganizationAction({
          action: checklistAuthorizationActions.addChecklistItem,
          organizationSlug: input.organizationSlug,
          userId: ctx.session.user.id,
        });
        const projectChecklist = await addChecklistItemForMember(membership, input);

        if (!projectChecklist) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Project Checklist unavailable' });
        }

        return { projectChecklist };
      } catch (caughtError) {
        throwKnownChecklistError(caughtError);
      }
    }),

  enforceArchivedControl: protectedProcedure
    .input(checklistControlInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const membership = await authorizeOrganizationAction({
          action: checklistAuthorizationActions.enforceArchivedControl,
          organizationSlug: input.organizationSlug,
          userId: ctx.session.user.id,
        });
        const projectChecklist = await enforceArchivedControlForMember(membership, input);

        if (!projectChecklist) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Project Checklist unavailable' });
        }

        return { projectChecklist };
      } catch (caughtError) {
        throwKnownChecklistError(caughtError);
      }
    }),

  setChecklistItemChecked: protectedProcedure
    .input(setChecklistItemCheckedInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const membership = await authorizeOrganizationAction({
          action: checklistAuthorizationActions.setChecklistItemChecked,
          organizationSlug: input.organizationSlug,
          userId: ctx.session.user.id,
        });
        const projectChecklist = await setChecklistItemCheckedForMember(membership, input);

        if (!projectChecklist) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Checklist Item unavailable' });
        }

        return { projectChecklist };
      } catch (caughtError) {
        throwKnownChecklistError(caughtError);
      }
    }),

  refreshChecklistItem: protectedProcedure
    .input(checklistItemIdentityInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const membership = await authorizeOrganizationAction({
          action: checklistAuthorizationActions.refreshChecklistItem,
          organizationSlug: input.organizationSlug,
          userId: ctx.session.user.id,
        });
        const projectChecklist = await refreshChecklistItemForMember(membership, input);

        if (!projectChecklist) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Checklist Item unavailable' });
        }

        return { projectChecklist };
      } catch (caughtError) {
        throwKnownChecklistError(caughtError);
      }
    }),

  removeChecklistItem: protectedProcedure
    .input(checklistItemIdentityInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const membership = await authorizeOrganizationAction({
          action: checklistAuthorizationActions.removeChecklistItem,
          organizationSlug: input.organizationSlug,
          userId: ctx.session.user.id,
        });
        const projectChecklist = await removeChecklistItemForMember(membership, input);

        if (!projectChecklist) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Checklist Item unavailable' });
        }

        return { projectChecklist };
      } catch (caughtError) {
        throwKnownChecklistError(caughtError);
      }
    }),
});
