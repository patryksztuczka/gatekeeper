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
  acceptedEvidenceTypes: z.array(z.string()),
  applicabilityConditions: z.string(),
  businessMeaning: z.string(),
  externalStandardsMappings: z
    .array(
      z.object({
        description: z.string().optional(),
        framework: z.string(),
        reference: z.string(),
      }),
    )
    .optional(),
  releaseImpact: z.string(),
  verificationMethod: z.string(),
});

export const updateControlApprovalPolicyInput = organizationSlugInput.extend({
  enabled: z.boolean(),
  requiredApprovals: z.number().optional(),
});

export const controlListInput = organizationSlugInput.extend({
  acceptedEvidenceType: z.string().optional(),
  releaseImpact: z.string().optional(),
  search: z.string().optional(),
  standardsFramework: z.string().optional(),
  status: z.enum(['active', 'archived']).default('active'),
});

export const draftControlListInput = organizationSlugInput.extend({
  search: z.string().default(''),
});

export const createDraftControlInput = organizationSlugInput.extend({
  controlCode: z.string(),
  title: z.string(),
});

export const publishDraftControlInput = draftControlIdentityInput.merge(publishControlInput);

export const submitDraftPublishRequestInput = draftControlIdentityInput.merge(publishControlInput);

export const createProposedUpdateInput = controlIdentityInput.merge(
  publishControlInput.extend({
    controlCode: z.string(),
    title: z.string(),
  }),
);

export const archiveControlInput = controlIdentityInput.extend({
  reason: z.string().optional(),
});

export const rejectPublishRequestInput = publishRequestIdentityInput.extend({
  comment: z.string(),
});
