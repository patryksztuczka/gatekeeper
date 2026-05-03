import { z } from 'zod';

export const controlApprovalPolicyFormSchema = z.object({
  enabled: z.boolean(),
  requiredApprovals: z.coerce.number().int().min(1, 'Required approval count must be at least 1.'),
});

export type ControlApprovalPolicyFormValues = z.infer<typeof controlApprovalPolicyFormSchema>;
