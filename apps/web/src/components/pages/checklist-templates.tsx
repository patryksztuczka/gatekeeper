import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertCircle, Archive, CheckCircle2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useParams, useSearchParams } from 'react-router';
import {
  addChecklistTemplateItem,
  archiveChecklistTemplate,
  createChecklistTemplate,
  getMembershipResolution,
  listControls,
  listChecklistTemplates,
  publishChecklistTemplate,
  removeChecklistTemplateItem,
  restoreChecklistTemplate,
  type ChecklistTemplateListItem,
  type ControlListItem,
} from '../../features/auth/auth-api';
import { humanizeAuthError } from '../../features/auth/auth-errors';
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

function canManageChecklistTemplates(role: string | null): boolean {
  return role === 'owner' || role === 'admin';
}

function toStatusFilter(value: string | null) {
  return value === 'active' || value === 'archived' || value === 'draft' ? value : 'all';
}

export function ChecklistTemplatesPage() {
  const { organizationSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [templates, setTemplates] = useState<ChecklistTemplateListItem[]>([]);
  const [controls, setControls] = useState<ControlListItem[]>([]);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [publishingTemplateId, setPublishingTemplateId] = useState<string | null>(null);
  const [archivingTemplateId, setArchivingTemplateId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [name, setName] = useState('');
  const search = searchParams.get('q') ?? '';
  const statusFilter = toStatusFilter(searchParams.get('status'));
  const canManage = canManageChecklistTemplates(currentRole);

  useEffect(() => {
    const refresh = async () => {
      if (!organizationSlug) return;

      setIsLoading(true);
      setError(null);
      try {
        const [templateResponse, resolution, controlResponse] = await Promise.all([
          listChecklistTemplates(organizationSlug, { search, status: statusFilter }),
          getMembershipResolution(),
          listControls(organizationSlug, { status: 'active' }),
        ]);
        const organization = resolution.organizations.find((org) => org.slug === organizationSlug);

        setTemplates(templateResponse.checklistTemplates);
        setControls(controlResponse.controls);
        setCurrentRole(organization?.role ?? null);
      } catch (caughtError) {
        const rawMessage =
          caughtError instanceof Error
            ? caughtError.message
            : 'Unable to load Checklist Templates.';
        setError(humanizeAuthError(null, rawMessage, 'Unable to load Checklist Templates.'));
      } finally {
        setIsLoading(false);
      }
    };

    void refresh();
  }, [organizationSlug, search, statusFilter]);

  const handleFilterTemplates = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const nextParams = new URLSearchParams();
    const nextSearch = String(formData.get('q') ?? '').trim();
    const nextStatus = String(formData.get('status') ?? 'all');

    if (nextSearch) nextParams.set('q', nextSearch);
    if (nextStatus !== 'all') nextParams.set('status', nextStatus);

    setSearchParams(nextParams);
  };

  const handleCreateChecklistTemplate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationSlug) return;

    setIsCreating(true);
    setError(null);
    setStatus(null);
    try {
      const response = await createChecklistTemplate(organizationSlug, { name });

      if (statusFilter === 'all' || statusFilter === 'draft') {
        setTemplates((currentTemplates) => [...currentTemplates, response.checklistTemplate]);
      }
      setName('');
      setStatus('Draft Checklist Template saved.');
    } catch (caughtError) {
      const rawMessage =
        caughtError instanceof Error ? caughtError.message : 'Unable to save Checklist Template.';
      setError(humanizeAuthError(null, rawMessage, 'Unable to save Checklist Template.'));
    } finally {
      setIsCreating(false);
    }
  };

  const handlePublishChecklistTemplate = async (template: ChecklistTemplateListItem) => {
    if (!organizationSlug) return;

    setPublishingTemplateId(template.id);
    setError(null);
    setStatus(null);
    try {
      const response = await publishChecklistTemplate(organizationSlug, template.id);

      setTemplates((currentTemplates) =>
        currentTemplates.flatMap((currentTemplate) => {
          if (currentTemplate.id !== template.id) return [currentTemplate];
          return statusFilter === 'draft' ? [] : [response.checklistTemplate];
        }),
      );
      setStatus('Checklist Template published.');
    } catch (caughtError) {
      const rawMessage =
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to publish Checklist Template.';
      setError(humanizeAuthError(null, rawMessage, 'Unable to publish Checklist Template.'));
    } finally {
      setPublishingTemplateId(null);
    }
  };

  const handleArchiveChecklistTemplate = async (template: ChecklistTemplateListItem) => {
    if (!organizationSlug) return;

    setArchivingTemplateId(template.id);
    setError(null);
    setStatus(null);
    try {
      const response = await archiveChecklistTemplate(organizationSlug, template.id);

      setTemplates((currentTemplates) =>
        currentTemplates.flatMap((currentTemplate) => {
          if (currentTemplate.id !== template.id) return [currentTemplate];
          return statusFilter === 'active' ? [] : [response.checklistTemplate];
        }),
      );
      setStatus('Checklist Template archived.');
    } catch (caughtError) {
      const rawMessage =
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to archive Checklist Template.';
      setError(humanizeAuthError(null, rawMessage, 'Unable to archive Checklist Template.'));
    } finally {
      setArchivingTemplateId(null);
    }
  };

  const handleAddChecklistTemplateItem = async (
    event: FormEvent<HTMLFormElement>,
    template: ChecklistTemplateListItem,
  ) => {
    event.preventDefault();
    if (!organizationSlug) return;

    const formData = new FormData(event.currentTarget);
    const controlId = String(formData.get('controlId') ?? '');

    if (!controlId) return;

    setEditingTemplateId(template.id);
    setError(null);
    setStatus(null);
    try {
      const response = await addChecklistTemplateItem(organizationSlug, template.id, { controlId });

      setTemplates((currentTemplates) =>
        currentTemplates.map((currentTemplate) =>
          currentTemplate.id === template.id ? response.checklistTemplate : currentTemplate,
        ),
      );
      event.currentTarget.reset();
      setStatus('Control added to Checklist Template.');
    } catch (caughtError) {
      const rawMessage =
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to add Control to Checklist Template.';
      setError(humanizeAuthError(null, rawMessage, 'Unable to add Control to Checklist Template.'));
    } finally {
      setEditingTemplateId(null);
    }
  };

  const handleRemoveChecklistTemplateItem = async (
    template: ChecklistTemplateListItem,
    itemId: string,
  ) => {
    if (!organizationSlug) return;

    setEditingTemplateId(template.id);
    setError(null);
    setStatus(null);
    try {
      const response = await removeChecklistTemplateItem(organizationSlug, template.id, itemId);

      setTemplates((currentTemplates) =>
        currentTemplates.map((currentTemplate) =>
          currentTemplate.id === template.id ? response.checklistTemplate : currentTemplate,
        ),
      );
      setStatus('Control removed from Checklist Template.');
    } catch (caughtError) {
      const rawMessage =
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to remove Control from Checklist Template.';
      setError(
        humanizeAuthError(null, rawMessage, 'Unable to remove Control from Checklist Template.'),
      );
    } finally {
      setEditingTemplateId(null);
    }
  };

  const handleRestoreChecklistTemplate = async (template: ChecklistTemplateListItem) => {
    if (!organizationSlug) return;

    setArchivingTemplateId(template.id);
    setError(null);
    setStatus(null);
    try {
      const response = await restoreChecklistTemplate(organizationSlug, template.id);

      setTemplates((currentTemplates) =>
        currentTemplates.flatMap((currentTemplate) => {
          if (currentTemplate.id !== template.id) return [currentTemplate];
          return statusFilter === 'archived' ? [] : [response.checklistTemplate];
        }),
      );
      setStatus('Checklist Template restored.');
    } catch (caughtError) {
      const rawMessage =
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to restore Checklist Template.';
      setError(humanizeAuthError(null, rawMessage, 'Unable to restore Checklist Template.'));
    } finally {
      setArchivingTemplateId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Checklist Templates</h1>
          <p className="text-sm text-muted-foreground">
            Create reusable governance workflows before adding Controls from the Control Library.
          </p>
        </div>
      </header>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {status ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Done</AlertTitle>
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      ) : null}

      <section className="rounded-xl border bg-card p-5">
        <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto]" onSubmit={handleFilterTemplates}>
          <div className="space-y-2">
            <Label htmlFor="template-search">Search</Label>
            <Input
              id="template-search"
              name="q"
              defaultValue={search}
              placeholder="Template name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="template-status">Status</Label>
            <select
              id="template-status"
              name="status"
              defaultValue={statusFilter}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
            >
              <option value="all">All visible</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="draft">Draft</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button type="submit" variant="outline">
              Filter
            </Button>
          </div>
        </form>
      </section>

      {canManage ? (
        <section className="rounded-xl border bg-card p-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Create Draft Checklist Template</h2>
            <p className="text-sm text-muted-foreground">
              Start with a unique name. Template items will be added in a later workflow.
            </p>
          </div>
          <form
            className="mt-4 flex flex-col gap-3 sm:flex-row"
            onSubmit={handleCreateChecklistTemplate}
          >
            <div className="flex-1 space-y-2">
              <Label htmlFor="template-name">Name</Label>
              <Input
                id="template-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={isCreating}>
                <Plus />
                {isCreating ? 'Saving...' : 'Save Draft'}
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading Checklist Templates...</p>
      ) : templates.length === 0 ? (
        <section className="rounded-xl border border-dashed p-8 text-center">
          <h2 className="text-lg font-medium">No Checklist Templates found</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Active Checklist Templates and drafts visible to you will appear here.
          </p>
        </section>
      ) : (
        <section className="grid gap-3">
          {templates.map((template) => (
            <article key={template.id} className="rounded-xl border bg-card p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold">{template.name}</h2>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground capitalize">
                      {template.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Created by {template.author.name} ({template.author.email})
                  </p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">
                  {template.publishedAt
                    ? `Published ${formatDate(template.publishedAt)}`
                    : `Created ${formatDate(template.createdAt)}`}
                </p>
              </div>
              {canManage ? (
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  {template.status === 'active' ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void handleArchiveChecklistTemplate(template)}
                      disabled={archivingTemplateId === template.id}
                    >
                      <Archive />
                      {archivingTemplateId === template.id ? 'Archiving...' : 'Archive'}
                    </Button>
                  ) : null}
                  {template.status === 'archived' ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void handleRestoreChecklistTemplate(template)}
                      disabled={archivingTemplateId === template.id}
                    >
                      <RotateCcw />
                      {archivingTemplateId === template.id ? 'Restoring...' : 'Restore'}
                    </Button>
                  ) : null}
                  {template.status === 'draft' ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handlePublishChecklistTemplate(template)}
                      disabled={publishingTemplateId === template.id}
                    >
                      {publishingTemplateId === template.id ? 'Publishing...' : 'Publish'}
                    </Button>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 space-y-3 rounded-lg border bg-muted/30 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-sm font-medium">Template Controls</h3>
                  <p className="text-xs text-muted-foreground">
                    Items reference Controls from the Control Library.
                  </p>
                </div>
                {template.items.some((item) => item.requiresAdminAttention) ? (
                  <Alert>
                    <AlertCircle />
                    <AlertTitle>Admin attention needed</AlertTitle>
                    <AlertDescription>
                      This Checklist Template still references archived Controls. Review the
                      retained references before using it for new governance work.
                    </AlertDescription>
                  </Alert>
                ) : null}
                {template.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No Controls added yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {template.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-col gap-2 rounded-md border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">
                              {item.control.controlCode}: {item.control.title}
                            </p>
                            {item.control.archivedAt ? (
                              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                                Archived Control
                              </span>
                            ) : null}
                          </div>
                          {item.requiresAdminAttention ? (
                            <p className="mt-1 text-xs text-amber-700">
                              Admin attention needed. This retained reference is no longer eligible
                              for new Checklist Template items.
                            </p>
                          ) : null}
                        </div>
                        {canManage ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              void handleRemoveChecklistTemplateItem(template, item.id)
                            }
                            disabled={editingTemplateId === template.id}
                          >
                            <Trash2 />
                            Remove
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                {canManage ? (
                  <form
                    className="flex flex-col gap-2 sm:flex-row"
                    onSubmit={(event) => void handleAddChecklistTemplateItem(event, template)}
                  >
                    <select
                      name="controlId"
                      defaultValue=""
                      className="flex h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
                      disabled={editingTemplateId === template.id}
                    >
                      <option value="">Select an active Control</option>
                      {controls
                        .filter(
                          (control) =>
                            !template.items.some((item) => item.control.id === control.id),
                        )
                        .map((control) => (
                          <option key={control.id} value={control.id}>
                            {control.controlCode}: {control.title}
                          </option>
                        ))}
                    </select>
                    <Button type="submit" size="sm" disabled={editingTemplateId === template.id}>
                      <Plus />
                      Add Control
                    </Button>
                  </form>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
