import type { RouterOutputs } from '@/lib/trpc';

export type ProjectDetailResult = RouterOutputs['projects']['detail'];
export type ProjectDetail = Extract<ProjectDetailResult, { status: 'available' }>['project'];
export type ProjectListItem = RouterOutputs['projects']['list']['projects'][number];
