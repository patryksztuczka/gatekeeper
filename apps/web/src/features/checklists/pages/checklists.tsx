import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, Archive, CheckCircle2, ListChecks, Plus, RotateCcw } from 'lucide-react';
import { useParams, useSearchParams } from 'react-router';
import { humanizeAuthError } from '@/features/auth/api/auth-errors';
import {
  canManageChecklists,
  type ChecklistTemplate,
} from '@/features/checklists/api/checklist-api';
import type { ControlListItem } from '@/features/controls/api/control-api';
import { queryClient, trpc } from '@/lib/trpc';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function isArchivedView(value: string | null) {
  return value === 'archived';
}

export function ChecklistsPage() {
  const { organizationSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const archivedView = isArchivedView(searchParams.get('status'));
  const checklistStatus = archivedView ? 'archived' : 'active';
  const hasOrganization = Boolean(organizationSlug);

  const resolutionQuery = useQuery(
    trpc.organizations.membershipResolution.queryOptions(undefined, { enabled: hasOrganization }),
  );
  const organization = resolutionQuery.data?.organizations.find(
    (org) => org.slug === organizationSlug,
  );
  const canManage = canManageChecklists(organization?.role ?? null);

  const templateQuery = useQuery(
    trpc.checklists.listTemplates.queryOptions(
      { organizationSlug: organizationSlug ?? '', status: checklistStatus },
      { enabled: hasOrganization && canManage },
    ),
  );
  const controlQuery = useQuery(
    trpc.controls.list.queryOptions(
      { organizationSlug: organizationSlug ?? '', status: 'active' },
      { enabled: hasOrganization && canManage && !archivedView },
    ),
  );

  const createTemplateMutation = useMutation(
    trpc.checklists.createTemplate.mutationOptions({
      onError: (caughtError) => {
        setError(
          humanizeAuthError(null, caughtError.message, 'Unable to create Checklist Template.'),
        );
      },
      onSuccess: () => {
        void queryClient.invalidateQueries();
        setStatus('Checklist Template created.');
      },
    }),
  );
  const renameTemplateMutation = useMutation(
    trpc.checklists.renameTemplate.mutationOptions({
      onError: (caughtError) => {
        setError(
          humanizeAuthError(null, caughtError.message, 'Unable to rename Checklist Template.'),
        );
      },
      onSuccess: () => {
        void queryClient.invalidateQueries();
        setStatus('Checklist Template renamed.');
      },
    }),
  );
  const archiveTemplateMutation = useMutation(
    trpc.checklists.archiveTemplate.mutationOptions({
      onError: (caughtError) => {
        setError(
          humanizeAuthError(null, caughtError.message, 'Unable to archive Checklist Template.'),
        );
      },
      onSuccess: () => {
        void queryClient.invalidateQueries();
        setStatus('Checklist Template archived.');
      },
    }),
  );
  const restoreTemplateMutation = useMutation(
    trpc.checklists.restoreTemplate.mutationOptions({
      onError: (caughtError) => {
        setError(
          humanizeAuthError(null, caughtError.message, 'Unable to restore Checklist Template.'),
        );
      },
      onSuccess: () => {
        void queryClient.invalidateQueries();
        setStatus('Checklist Template restored.');
      },
    }),
  );

  const templates: ChecklistTemplate[] = (templateQuery.data?.checklistTemplates ?? []).filter(
    (template): template is ChecklistTemplate => Boolean(template),
  );
  const controls: ControlListItem[] = controlQuery.data?.controls ?? [];
  const loadError = resolutionQuery.error ?? templateQuery.error ?? controlQuery.error;
  const displayError =
    error ??
    (loadError
      ? humanizeAuthError(null, loadError.message, 'Unable to load Checklist Templates.')
      : null);
  const isLoading =
    hasOrganization &&
    (resolutionQuery.isPending ||
      (canManage && templateQuery.isPending) ||
      (canManage && !archivedView && controlQuery.isPending));
  const emptyTitle = archivedView
    ? 'No archived Checklist Templates'
    : 'No Checklist Templates yet';
  const emptyDescription = archivedView
    ? 'Archived Checklist Templates will appear here after they are hidden from new Project use.'
    : 'Create reusable Checklist Templates from active Controls.';

  const clearMessages = () => {
    setError(null);
    setStatus(null);
  };

  const handleCreateTemplate = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationSlug) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get('name') ?? '').trim();
    const controlIds = formData.getAll('controlId').map((value) => String(value));

    clearMessages();
    createTemplateMutation.mutate(
      { controlIds, name, organizationSlug },
      {
        onSuccess: () => form.reset(),
      },
    );
  };

  const handleRenameTemplate = (
    event: SyntheticEvent<HTMLFormElement>,
    template: ChecklistTemplate,
  ) => {
    event.preventDefault();
    if (!organizationSlug) return;

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get('name') ?? '').trim();

    clearMessages();
    renameTemplateMutation.mutate({ checklistTemplateId: template.id, name, organizationSlug });
  };

  const handleArchiveStateChange = (template: ChecklistTemplate) => {
    if (!organizationSlug) return;

    clearMessages();

    if (archivedView) {
      restoreTemplateMutation.mutate({ checklistTemplateId: template.id, organizationSlug });
      return;
    }

    archiveTemplateMutation.mutate({ checklistTemplateId: template.id, organizationSlug });
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Checklists</h1>
          <p className="text-sm text-muted-foreground">
            {archivedView
              ? 'Review Checklist Templates hidden from new Project Checklist creation.'
              : 'Manage reusable Checklist Templates for Project governance work.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={archivedView ? 'outline' : 'default'}
            onClick={() => setSearchParams({})}
          >
            Active
          </Button>
          {canManage ? (
            <Button
              type="button"
              variant={archivedView ? 'default' : 'outline'}
              onClick={() => setSearchParams({ status: 'archived' })}
            >
              Archived
            </Button>
          ) : null}
        </div>
      </header>

      {displayError ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{displayError}</AlertDescription>
        </Alert>
      ) : null}
      {status ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Done</AlertTitle>
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      ) : null}

      {!canManage && !resolutionQuery.isPending ? (
        <Alert>
          <ListChecks />
          <AlertTitle>Checklist Templates are restricted</AlertTitle>
          <AlertDescription>
            Only Organization owners and admins can view and manage Checklist Templates.
          </AlertDescription>
        </Alert>
      ) : null}

      {canManage && !archivedView ? (
        <section className="rounded-xl border bg-card p-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Create Checklist Template</h2>
            <p className="text-sm text-muted-foreground">
              Select active Controls that should be copied into new Project Checklists.
            </p>
          </div>
          <form className="mt-5 grid gap-4" onSubmit={handleCreateTemplate}>
            <div className="space-y-2">
              <Label htmlFor="checklist-template-name">Name</Label>
              <Input id="checklist-template-name" name="name" required />
            </div>
            <div className="space-y-2">
              <Label>Controls</Label>
              {controls.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No active Controls are available for Checklist Templates.
                </p>
              ) : (
                <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-2">
                  {controls.map((control) => (
                    <label
                      key={control.id}
                      className="flex items-start gap-3 rounded-md border bg-background p-3 text-sm"
                    >
                      <input
                        className="mt-1 size-4"
                        name="controlId"
                        type="checkbox"
                        value={control.id}
                      />
                      <span className="space-y-1">
                        <span className="block font-medium">
                          {control.controlCode} · {control.title}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          v{control.currentVersion.versionNumber}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={createTemplateMutation.isPending || controls.length === 0}
              >
                <Plus />
                {createTemplateMutation.isPending ? 'Creating...' : 'Create Template'}
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      {canManage ? (
        <section className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">
              {archivedView ? 'Archived Checklist Templates' : 'Active Checklist Templates'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {archivedView
                ? 'Archived templates are retained but unavailable for new Project Checklists.'
                : 'Templates can be renamed or archived without changing existing Project Checklists.'}
            </p>
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading Checklist Templates...</p>
          ) : templates.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <h3 className="text-lg font-medium">{emptyTitle}</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                {emptyDescription}
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {templates.map((template) => (
                <article key={template.id} className="rounded-xl border bg-card p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold">{template.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {template.controls.length} Controls · Created{' '}
                        {formatDate(template.createdAt)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={
                        archiveTemplateMutation.isPending || restoreTemplateMutation.isPending
                      }
                      onClick={() => handleArchiveStateChange(template)}
                    >
                      {archivedView ? <RotateCcw /> : <Archive />}
                      {archivedView ? 'Restore' : 'Archive'}
                    </Button>
                  </div>
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {template.controls.map((control) => (
                      <div key={control.controlId} className="rounded-lg border bg-muted/30 p-3">
                        <p className="text-sm font-medium">
                          {control.controlCode} · {control.controlTitle}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Current Control Version v{control.currentVersionNumber}
                        </p>
                      </div>
                    ))}
                  </div>
                  {!archivedView ? (
                    <form
                      className="mt-4 flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-end"
                      onSubmit={(event) => handleRenameTemplate(event, template)}
                    >
                      <div className="flex-1 space-y-2">
                        <Label htmlFor={`${template.id}-name`}>Template name</Label>
                        <Input
                          id={`${template.id}-name`}
                          name="name"
                          defaultValue={template.name}
                        />
                      </div>
                      <Button
                        type="submit"
                        variant="outline"
                        disabled={renameTemplateMutation.isPending}
                      >
                        Rename
                      </Button>
                    </form>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
