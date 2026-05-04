import { z } from 'zod';
import { organizationSlugInput } from '../identity-organization/organization-schemas';

export const createProjectChecklistInput = organizationSlugInput.extend({
  checklistTemplateId: z.string().min(1).optional(),
  controlIds: z.array(z.string().min(1)).optional(),
  name: z.string(),
  projectSlug: z.string().min(1),
});

export const projectChecklistListInput = organizationSlugInput.extend({
  projectSlug: z.string().min(1),
  status: z.enum(['active', 'archived']).default('active'),
});

export const projectChecklistIdentityInput = organizationSlugInput.extend({
  projectChecklistId: z.string().min(1),
});

export const checklistControlInput = projectChecklistIdentityInput.extend({
  controlId: z.string().min(1),
});

export const renameProjectChecklistInput = projectChecklistIdentityInput.extend({
  name: z.string(),
});

export const createChecklistTemplateInput = organizationSlugInput.extend({
  controlIds: z.array(z.string().min(1)).min(1),
  name: z.string(),
});

export const checklistTemplateListInput = organizationSlugInput.extend({
  status: z.enum(['active', 'archived']).default('active'),
});

export const checklistTemplateIdentityInput = organizationSlugInput.extend({
  checklistTemplateId: z.string().min(1),
});

export const renameChecklistTemplateInput = checklistTemplateIdentityInput.extend({
  name: z.string(),
});

export const setChecklistItemCheckedInput = organizationSlugInput.extend({
  checked: z.boolean(),
  checklistItemId: z.string().min(1),
});

export const checklistItemIdentityInput = organizationSlugInput.extend({
  checklistItemId: z.string().min(1),
});
