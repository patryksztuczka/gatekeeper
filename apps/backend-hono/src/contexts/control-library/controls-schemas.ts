import { z } from 'zod';
import { organizationSlugInput } from '../identity-organization/organization-schemas';

export const controlIdentityInput = organizationSlugInput.extend({
  controlId: z.string().min(1),
});

export const draftControlIdentityInput = organizationSlugInput.extend({
  draftControlId: z.string().min(1),
});

export const proposedUpdateIdentityInput = controlIdentityInput.extend({
  proposedUpdateId: z.string().min(1),
});

export const publishRequestIdentityInput = organizationSlugInput.extend({
  publishRequestId: z.string().min(1),
});

export const publishControlInput = z.object({
  businessMeaning: z.string(),
});

export const updateControlApprovalPolicyInput = organizationSlugInput.extend({
  enabled: z.boolean(),
  requiredApprovals: z.number().optional(),
});

export const controlListInput = organizationSlugInput.extend({
  search: z.string().optional(),
  status: z.enum(['active', 'archived']).default('active'),
});

export const draftControlListInput = organizationSlugInput.extend({
  search: z.string().default(''),
});

export const createDraftControlInput = organizationSlugInput.extend({
  title: z.string(),
});

export const publishDraftControlInput = draftControlIdentityInput.merge(publishControlInput);

export const submitDraftPublishRequestInput = draftControlIdentityInput.merge(publishControlInput);

export const createProposedUpdateInput = controlIdentityInput.merge(
  publishControlInput.extend({
    title: z.string(),
  }),
);

export const archiveControlInput = controlIdentityInput.extend({
  reason: z.string().optional(),
});

export const rejectPublishRequestInput = publishRequestIdentityInput.extend({
  comment: z.string(),
});
