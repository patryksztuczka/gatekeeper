import type { RouterOutputs } from '@/lib/trpc';

export type AuditEventListItem = RouterOutputs['auditLog']['list']['auditEvents'][number];
