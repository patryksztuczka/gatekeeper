import { z } from 'zod';
import { organizationSlugInput } from './organization-schemas';

export const projectIdentityInput = organizationSlugInput.extend({
  projectSlug: z.string().min(1),
});

export const projectListInput = organizationSlugInput.extend({
  status: z.enum(['active', 'archived']).default('active'),
});

export const projectCreateInput = organizationSlugInput.extend({
  description: z.string(),
  name: z.string(),
  projectOwnerMemberId: z.string().nullable().optional(),
  slug: z.string(),
});

export const projectUpdateInput = projectIdentityInput.extend({
  description: z.string(),
  name: z.string(),
  projectOwnerMemberId: z.string().nullable().optional(),
});
