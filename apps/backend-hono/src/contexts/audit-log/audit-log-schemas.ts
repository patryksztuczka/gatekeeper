import { z } from 'zod';
import { organizationSlugInput } from '../identity-organization/organization-schemas';

export const auditLogListInput = organizationSlugInput.extend({
  action: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  targetId: z.string().min(1).optional(),
  targetType: z.string().min(1).optional(),
});
