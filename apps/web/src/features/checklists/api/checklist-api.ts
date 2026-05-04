import type { RouterOutputs } from '@/lib/trpc';

export type ChecklistTemplate = NonNullable<
  RouterOutputs['checklists']['listTemplates']['checklistTemplates'][number]
>;

export type ProjectChecklist = NonNullable<
  RouterOutputs['checklists']['listProjectChecklists']['projectChecklists'][number]
>;

export type ProjectChecklistItem = ProjectChecklist['items'][number];

export function canManageChecklists(role: string | null) {
  return role === 'owner' || role === 'admin';
}
