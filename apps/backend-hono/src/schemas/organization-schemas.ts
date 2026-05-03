import { z } from 'zod';

export const organizationSlugInput = z.object({
  organizationSlug: z.string().min(1),
});

export const invitationEntryStateInput = z.object({
  invitationId: z.string().min(1),
});
