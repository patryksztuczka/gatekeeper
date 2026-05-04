import { z } from 'zod';

export const createControlFormSchema = z.object({
  title: z.string().min(1, 'Control title is required.'),
  businessMeaning: z.string(),
});

export const controlApprovalPolicyFormSchema = z.object({
  enabled: z.boolean(),
  requiredApprovals: z.number().int().min(1, 'Required approval count must be at least 1.'),
});

export type CreateControlFormValues = z.infer<typeof createControlFormSchema>;
export type ControlApprovalPolicyFormValues = z.infer<typeof controlApprovalPolicyFormSchema>;
