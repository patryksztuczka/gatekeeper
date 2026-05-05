import { z } from 'zod';

export const createProjectFormSchema = z.object({
  name: z.string().min(1, 'Project name is required.'),
  slug: z.string().min(1, 'Project slug is required.'),
  description: z.string().min(1, 'Project description is required.'),
});

export const projectSettingsFormSchema = z.object({
  name: z.string().min(1, 'Project name is required.'),
  description: z.string().min(1, 'Project description is required.'),
});

export type CreateProjectFormValues = z.infer<typeof createProjectFormSchema>;
export type ProjectSettingsFormValues = z.infer<typeof projectSettingsFormSchema>;
