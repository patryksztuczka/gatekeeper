import { z } from 'zod';

export const createOrganizationFormSchema = z.object({
  name: z.string().min(1, 'Organization name is required.'),
  slug: z.string().min(1, 'Organization slug is required.'),
});

export const inviteMemberFormSchema = z.object({
  email: z.email('Enter a valid email.'),
  role: z.enum(['member', 'admin']),
});

export type CreateOrganizationFormValues = z.infer<typeof createOrganizationFormSchema>;
export type InviteMemberFormValues = z.infer<typeof inviteMemberFormSchema>;
