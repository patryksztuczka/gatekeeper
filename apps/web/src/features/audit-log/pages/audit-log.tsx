import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter,
  History,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AuditEventListItem } from '@/features/audit-log/api/audit-log-api';
import { humanizeAuthError } from '@/features/auth/api/auth-errors';
import { trpc } from '@/lib/trpc';

const ACTION_OPTIONS = [
  { label: 'All actions', value: '' },
  { label: 'Project created', value: 'project.created' },
  { label: 'Project updated', value: 'project.updated' },
  { label: 'Project archived', value: 'project.archived' },
  { label: 'Project restored', value: 'project.restored' },
  { label: 'Control created', value: 'control.created' },
  { label: 'Control updated', value: 'control.updated' },
  { label: 'Control archived', value: 'control.archived' },
  { label: 'Control restored', value: 'control.restored' },
  { label: 'Control Proposed Update created', value: 'control_proposed_update.created' },
  { label: 'Control Proposed Update rejected', value: 'control_proposed_update.rejected' },
  { label: 'Control Publish Request created', value: 'control_publish_request.created' },
  { label: 'Control Publish Request approved', value: 'control_publish_request.approved' },
  { label: 'Control Publish Request rejected', value: 'control_publish_request.rejected' },
  { label: 'Checklist Template created', value: 'checklist_template.created' },
  { label: 'Checklist Template renamed', value: 'checklist_template.renamed' },
  { label: 'Checklist Template archived', value: 'checklist_template.archived' },
  { label: 'Checklist Template restored', value: 'checklist_template.restored' },
  { label: 'Project Checklist created', value: 'project_checklist.created' },
  { label: 'Project Checklist renamed', value: 'project_checklist.renamed' },
  { label: 'Project Checklist archived', value: 'project_checklist.archived' },
  { label: 'Project Checklist restored', value: 'project_checklist.restored' },
  { label: 'Checklist Item added', value: 'checklist_item.added' },
  { label: 'Checklist Item checked', value: 'checklist_item.checked' },
  { label: 'Checklist Item unchecked', value: 'checklist_item.unchecked' },
  { label: 'Checklist Item refreshed', value: 'checklist_item.refreshed' },
  { label: 'Checklist Item removed', value: 'checklist_item.removed' },
] as const;

const TARGET_TYPE_OPTIONS = [
  { label: 'All targets', value: '' },
  { label: 'Projects', value: 'project' },
  { label: 'Controls', value: 'control' },
  { label: 'Control Publish Requests', value: 'control_publish_request' },
  { label: 'Control Proposed Updates', value: 'control_proposed_update' },
  { label: 'Checklist Templates', value: 'checklist_template' },
  { label: 'Project Checklists', value: 'project_checklist' },
  { label: 'Checklist Items', value: 'checklist_item' },
] as const;

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatAction(value: string) {
  return (
    ACTION_OPTIONS.find((option) => option.value === value)?.label ??
    value
      .split(/[._]/)
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(' ')
  );
}

function formatTargetType(value: string) {
  return (
    TARGET_TYPE_OPTIONS.find((option) => option.value === value)?.label.replace(/s$/, '') ??
    value.replaceAll('_', ' ')
  );
}

function getActorLabel(event: AuditEventListItem) {
  if (event.actorDisplayName && event.actorEmail) {
    return `${event.actorDisplayName} (${event.actorEmail})`;
  }

  return event.actorDisplayName ?? event.actorEmail ?? 'Unknown actor';
}

function getMetadataText(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  const reason = typeof record.reason === 'string' ? record.reason : null;

  if (reason) {
    return reason;
  }

  const changes = record.changes;
  if (!changes || typeof changes !== 'object') {
    return null;
  }

  return Object.entries(changes as Record<string, unknown>)
    .map(([field, change]) => {
      if (!change || typeof change !== 'object') {
        return field;
      }

      const delta = change as Record<string, unknown>;
      return `${field}: ${formatMetadataValue(delta.from)} -> ${formatMetadataValue(delta.to)}`;
    })
    .join(', ');
}

function formatMetadataValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return 'none';
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return String(record.displayName ?? record.email ?? record.organizationMemberId ?? 'value');
  }

  return String(value);
}

function setSearchValue(searchParams: URLSearchParams, key: string, value: string) {
  const nextParams = new URLSearchParams(searchParams);

  if (value) {
    nextParams.set(key, value);
  } else {
    nextParams.delete(key);
  }

  return nextParams;
}

export function AuditLogPage() {
  const { organizationSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const action = searchParams.get('action') ?? '';
  const targetType = searchParams.get('targetType') ?? '';
  const targetId = searchParams.get('targetId') ?? '';
  const hasOrganization = Boolean(organizationSlug);

  const auditLogQuery = useQuery(
    trpc.auditLog.list.queryOptions(
      {
        action: action || undefined,
        limit: 50,
        organizationSlug: organizationSlug ?? '',
        targetId: targetId || undefined,
        targetType: targetType || undefined,
      },
      { enabled: hasOrganization },
    ),
  );

  const auditEvents = auditLogQuery.data?.auditEvents ?? [];
  const displayError = auditLogQuery.error
    ? humanizeAuthError(null, auditLogQuery.error.message, 'Unable to load Audit Log.')
    : null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
          <p className="text-sm text-muted-foreground">
            Review retained governance events for this Organization.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground">
          <ShieldCheck className="size-4" />
          Owners and admins
        </div>
      </header>

      <section className="rounded-xl border bg-card p-4">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium">
          <Filter className="size-4" />
          Filters
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]">
          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Action</span>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={action}
              onChange={(event) =>
                setSearchParams(setSearchValue(searchParams, 'action', event.target.value))
              }
            >
              {ACTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Target</span>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={targetType}
              onChange={(event) =>
                setSearchParams(setSearchValue(searchParams, 'targetType', event.target.value))
              }
            >
              {TARGET_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Target ID</span>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={targetId}
                onChange={(event) =>
                  setSearchParams(setSearchValue(searchParams, 'targetId', event.target.value))
                }
              />
            </div>
          </label>
          <div className="flex items-end">
            <Button type="button" variant="outline" onClick={() => setSearchParams({})}>
              Clear
            </Button>
          </div>
        </div>
      </section>

      {displayError ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{displayError}</AlertDescription>
        </Alert>
      ) : null}

      {auditLogQuery.isPending ? (
        <section className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Loading Audit Log...
        </section>
      ) : auditEvents.length === 0 ? (
        <section className="rounded-xl border border-dashed p-8 text-center">
          <History className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-medium">No Audit Events found</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Audit Events appear here after governance actions are recorded for this Organization.
          </p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="grid grid-cols-[minmax(11rem,0.8fr)_minmax(0,1.5fr)_minmax(0,1.4fr)] border-b bg-muted/40 px-4 py-3 text-xs font-medium text-muted-foreground max-lg:hidden">
            <span>Time</span>
            <span>Event</span>
            <span>Actor</span>
          </div>
          <div className="divide-y">
            {auditEvents.map((event) => {
              const metadataText = getMetadataText(event.metadata);

              return (
                <article
                  key={event.id}
                  className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(11rem,0.8fr)_minmax(0,1.5fr)_minmax(0,1.4fr)]"
                >
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="size-4" />
                    <time dateTime={event.occurredAt}>{formatDateTime(event.occurredAt)}</time>
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                        {formatAction(event.action)}
                      </span>
                      <span className="text-sm font-medium">
                        {event.targetDisplayName ?? event.targetId}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatTargetType(event.targetType)}
                      {event.targetSecondaryLabel ? ` · ${event.targetSecondaryLabel}` : null}
                    </p>
                    {metadataText ? (
                      <p className="text-xs text-muted-foreground">{metadataText}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="size-4 text-primary" />
                    <span>{getActorLabel(event)}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
