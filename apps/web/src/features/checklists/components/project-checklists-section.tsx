import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, Archive, CheckCircle2, Circle, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { humanizeAuthError } from '@/features/auth/api/auth-errors';
import type { ChecklistTemplate, ProjectChecklist } from '@/features/checklists/api/checklist-api';
import type { ControlListItem } from '@/features/controls/api/control-api';
import { queryClient, trpc } from '@/lib/trpc';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type ProjectChecklistsSectionProps = {
  canManage: boolean;
  currentMemberId: string | null;
  organizationSlug: string;
  projectArchived: boolean;
  projectOwnerAssignmentMemberId: string | null;
  projectSlug: string;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function ProjectChecklistsSection({
  canManage,
  currentMemberId,
  organizationSlug,
  projectArchived,
  projectOwnerAssignmentMemberId,
  projectSlug,
}: ProjectChecklistsSectionProps) {
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived'>('active');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const hasProjectIdentity = Boolean(organizationSlug && projectSlug);
  const archivedView = statusFilter === 'archived';
  const canManageActiveProject = canManage && !projectArchived;
  const canCheckItems =
    !projectArchived &&
    Boolean(projectOwnerAssignmentMemberId && projectOwnerAssignmentMemberId === currentMemberId);

  const projectChecklistQuery = useQuery(
    trpc.checklists.listProjectChecklists.queryOptions(
      { organizationSlug, projectSlug, status: statusFilter },
      { enabled: hasProjectIdentity },
    ),
  );
  const templateQuery = useQuery(
    trpc.checklists.listTemplates.queryOptions(
      { organizationSlug, status: 'active' },
      { enabled: hasProjectIdentity && canManageActiveProject },
    ),
  );
  const activeControlsQuery = useQuery(
    trpc.controls.list.queryOptions(
      { organizationSlug, status: 'active' },
      { enabled: hasProjectIdentity && canManageActiveProject },
    ),
  );
  const archivedControlsQuery = useQuery(
    trpc.controls.list.queryOptions(
      { organizationSlug, status: 'archived' },
      { enabled: hasProjectIdentity && canManageActiveProject },
    ),
  );

  const createProjectChecklistMutation = useMutation(
    trpc.checklists.createProjectChecklist.mutationOptions({
      onError: (caughtError) => {
        setError(
          humanizeAuthError(null, caughtError.message, 'Unable to create Project Checklist.'),
        );
      },
      onSuccess: () => {
        void queryClient.invalidateQueries();
        setStatus('Project Checklist created.');
      },
    }),
  );
  const renameProjectChecklistMutation = useMutation(
    trpc.checklists.renameProjectChecklist.mutationOptions({
      onError: (caughtError) => {
        setError(
          humanizeAuthError(null, caughtError.message, 'Unable to rename Project Checklist.'),
        );
      },
      onSuccess: () => {
        void queryClient.invalidateQueries();
        setStatus('Project Checklist renamed.');
      },
    }),
  );
  const archiveProjectChecklistMutation = useMutation(
    trpc.checklists.archiveProjectChecklist.mutationOptions({
      onError: (caughtError) => {
        setError(
          humanizeAuthError(null, caughtError.message, 'Unable to archive Project Checklist.'),
        );
      },
      onSuccess: () => {
        void queryClient.invalidateQueries();
        setStatus('Project Checklist archived.');
      },
    }),
  );
  const restoreProjectChecklistMutation = useMutation(
    trpc.checklists.restoreProjectChecklist.mutationOptions({
      onError: (caughtError) => {
        setError(
          humanizeAuthError(null, caughtError.message, 'Unable to restore Project Checklist.'),
        );
      },
      onSuccess: () => {
        void queryClient.invalidateQueries();
        setStatus('Project Checklist restored.');
      },
    }),
  );
  const addChecklistItemMutation = useMutation(
    trpc.checklists.addChecklistItem.mutationOptions({
      onError: (caughtError) => {
        setError(humanizeAuthError(null, caughtError.message, 'Unable to add Checklist Item.'));
      },
      onSuccess: () => {
        void queryClient.invalidateQueries();
        setStatus('Checklist Item added.');
      },
    }),
  );
  const removeChecklistItemMutation = useMutation(
    trpc.checklists.removeChecklistItem.mutationOptions({
      onError: (caughtError) => {
        setError(humanizeAuthError(null, caughtError.message, 'Unable to remove Checklist Item.'));
      },
      onSuccess: () => {
        void queryClient.invalidateQueries();
        setStatus('Checklist Item removed.');
      },
    }),
  );
  const refreshChecklistItemMutation = useMutation(
    trpc.checklists.refreshChecklistItem.mutationOptions({
      onError: (caughtError) => {
        setError(humanizeAuthError(null, caughtError.message, 'Unable to refresh Checklist Item.'));
      },
      onSuccess: () => {
        void queryClient.invalidateQueries();
        setStatus('Checklist Item refreshed.');
      },
    }),
  );
  const enforceArchivedControlMutation = useMutation(
    trpc.checklists.enforceArchivedControl.mutationOptions({
      onError: (caughtError) => {
        setError(
          humanizeAuthError(null, caughtError.message, 'Unable to enforce Archived Control.'),
        );
      },
      onSuccess: () => {
        void queryClient.invalidateQueries();
        setStatus('Archived Control enforced.');
      },
    }),
  );
  const setChecklistItemCheckedMutation = useMutation(
    trpc.checklists.setChecklistItemChecked.mutationOptions({
      onError: (caughtError) => {
        setError(humanizeAuthError(null, caughtError.message, 'Unable to update Checklist Item.'));
      },
      onSuccess: () => {
        void queryClient.invalidateQueries();
      },
    }),
  );

  const projectChecklists: ProjectChecklist[] = (
    projectChecklistQuery.data?.projectChecklists ?? []
  ).filter((checklist): checklist is ProjectChecklist => Boolean(checklist));
  const templates: ChecklistTemplate[] = (templateQuery.data?.checklistTemplates ?? []).filter(
    (template): template is ChecklistTemplate => Boolean(template),
  );
  const activeControls: ControlListItem[] = activeControlsQuery.data?.controls ?? [];
  const archivedControls: ControlListItem[] = archivedControlsQuery.data?.controls ?? [];
  const loadError =
    projectChecklistQuery.error ??
    templateQuery.error ??
    activeControlsQuery.error ??
    archivedControlsQuery.error;
  const displayError =
    error ??
    (loadError
      ? humanizeAuthError(null, loadError.message, 'Unable to load Project Checklists.')
      : null);
  const isLoading =
    projectChecklistQuery.isPending ||
    (canManageActiveProject &&
      (templateQuery.isPending ||
        activeControlsQuery.isPending ||
        archivedControlsQuery.isPending));

  const clearMessages = () => {
    setError(null);
    setStatus(null);
  };

  const handleCreateProjectChecklist = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get('name') ?? '').trim();
    const checklistTemplateId = String(formData.get('checklistTemplateId') ?? '');
    const controlIds = formData.getAll('controlId').map((value) => String(value));

    clearMessages();
    createProjectChecklistMutation.mutate(
      checklistTemplateId
        ? { checklistTemplateId, name, organizationSlug, projectSlug }
        : { controlIds, name, organizationSlug, projectSlug },
      {
        onSuccess: () => form.reset(),
      },
    );
  };

  const handleRenameProjectChecklist = (
    event: SyntheticEvent<HTMLFormElement>,
    checklist: ProjectChecklist,
  ) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get('name') ?? '').trim();

    clearMessages();
    renameProjectChecklistMutation.mutate({
      name,
      organizationSlug,
      projectChecklistId: checklist.id,
    });
  };

  const handleArchiveStateChange = (checklist: ProjectChecklist) => {
    clearMessages();

    if (archivedView) {
      restoreProjectChecklistMutation.mutate({
        organizationSlug,
        projectChecklistId: checklist.id,
      });
      return;
    }

    archiveProjectChecklistMutation.mutate({
      organizationSlug,
      projectChecklistId: checklist.id,
    });
  };

  const handleAddChecklistItem = (
    event: SyntheticEvent<HTMLFormElement>,
    checklist: ProjectChecklist,
  ) => {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const controlId = String(formData.get('controlId') ?? '');

    clearMessages();
    addChecklistItemMutation.mutate(
      { controlId, organizationSlug, projectChecklistId: checklist.id },
      {
        onSuccess: () => form.reset(),
      },
    );
  };

  const handleSetChecklistItemChecked = (checklistItemId: string, checked: boolean) => {
    clearMessages();
    setChecklistItemCheckedMutation.mutate({ checked, checklistItemId, organizationSlug });
  };

  const handleRemoveChecklistItem = (checklistItemId: string) => {
    clearMessages();
    removeChecklistItemMutation.mutate({ checklistItemId, organizationSlug });
  };

  const handleRefreshChecklistItem = (checklistItemId: string) => {
    clearMessages();
    refreshChecklistItemMutation.mutate({ checklistItemId, organizationSlug });
  };

  const handleEnforceArchivedControl = (checklist: ProjectChecklist, controlId: string) => {
    clearMessages();
    enforceArchivedControlMutation.mutate({
      controlId,
      organizationSlug,
      projectChecklistId: checklist.id,
    });
  };

  const emptyTitle = archivedView ? 'No archived Project Checklists' : 'No Project Checklists yet';
  const emptyDescription = archivedView
    ? 'Archived Project Checklists will appear here after they are hidden from active work.'
    : 'Create a Project Checklist to start checking Controls for this Project.';

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">Project Checklists</h2>
          <p className="text-sm text-muted-foreground">
            Project Owners check Controls; Organization owners and admins manage checklist
            structure.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={archivedView ? 'outline' : 'default'}
            onClick={() => setStatusFilter('active')}
          >
            Active
          </Button>
          {canManage ? (
            <Button
              type="button"
              variant={archivedView ? 'default' : 'outline'}
              onClick={() => setStatusFilter('archived')}
            >
              Archived
            </Button>
          ) : null}
        </div>
      </div>

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

      {canManageActiveProject && !archivedView ? (
        <form className="rounded-xl border bg-card p-5" onSubmit={handleCreateProjectChecklist}>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold">Create Project Checklist</h3>
            <p className="text-sm text-muted-foreground">
              Start from a Checklist Template or select active Controls directly.
            </p>
          </div>
          <div className="mt-5 grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="project-checklist-name">Name</Label>
                <Input id="project-checklist-name" name="name" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-checklist-template">Checklist Template</Label>
                <select
                  id="project-checklist-template"
                  name="checklistTemplateId"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                >
                  <option value="">Selected Controls</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Controls</Label>
              {activeControls.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No active Controls are available for Project Checklists.
                </p>
              ) : (
                <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-2">
                  {activeControls.map((control) => (
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
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              type="submit"
              disabled={
                createProjectChecklistMutation.isPending ||
                (activeControls.length === 0 && templates.length === 0)
              }
            >
              <Plus />
              {createProjectChecklistMutation.isPending ? 'Creating...' : 'Create Checklist'}
            </Button>
          </div>
        </form>
      ) : null}

      {projectArchived ? (
        <Alert>
          <Archive />
          <AlertTitle>Archived Project</AlertTitle>
          <AlertDescription>
            Project Checklists are read-only while this Project is archived.
          </AlertDescription>
        </Alert>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading Project Checklists...</p>
      ) : projectChecklists.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <h3 className="text-lg font-medium">{emptyTitle}</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{emptyDescription}</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {projectChecklists.map((checklist) => {
            const activeItems = checklist.items.filter((item) => item.itemStatus === 'active');
            const completedCount = activeItems.filter((item) => item.checked).length;

            return (
              <article key={checklist.id} className="rounded-xl border bg-card p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold">{checklist.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {completedCount}/{activeItems.length} active Controls checked · Created{' '}
                      {formatDate(checklist.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex h-9 items-center rounded-md border px-3 text-sm">
                      {checklist.isComplete ? (
                        <>
                          <CheckCircle2 className="mr-2 size-4 text-green-600" />
                          Complete
                        </>
                      ) : (
                        <>
                          <Circle className="mr-2 size-4 text-muted-foreground" />
                          Open
                        </>
                      )}
                    </span>
                    {canManageActiveProject ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={
                          archiveProjectChecklistMutation.isPending ||
                          restoreProjectChecklistMutation.isPending
                        }
                        onClick={() => handleArchiveStateChange(checklist)}
                      >
                        {archivedView ? <RotateCcw /> : <Archive />}
                        {archivedView ? 'Restore' : 'Archive'}
                      </Button>
                    ) : null}
                  </div>
                </div>

                {canManageActiveProject && !archivedView ? (
                  <form
                    className="mt-4 flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-end"
                    onSubmit={(event) => handleRenameProjectChecklist(event, checklist)}
                  >
                    <div className="flex-1 space-y-2">
                      <Label htmlFor={`${checklist.id}-name`}>Checklist name</Label>
                      <Input
                        id={`${checklist.id}-name`}
                        name="name"
                        defaultValue={checklist.name}
                      />
                    </div>
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={renameProjectChecklistMutation.isPending}
                    >
                      Rename
                    </Button>
                  </form>
                ) : null}

                <div className="mt-4 divide-y rounded-lg border">
                  {checklist.items.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">No Checklist Items.</p>
                  ) : (
                    checklist.items.map((item) => {
                      const currentControl = activeControls.find(
                        (control) => control.id === item.controlId,
                      );
                      const archivedControl = archivedControls.find(
                        (control) => control.id === item.controlId,
                      );
                      const usesOldVersion =
                        item.itemStatus === 'active' &&
                        currentControl &&
                        currentControl.currentVersion.id !== item.controlVersionId;
                      const canAddOrRemoveItem =
                        canManageActiveProject && item.itemStatus === 'active';

                      return (
                        <div
                          key={item.id}
                          className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <label className="flex min-w-0 items-start gap-3">
                            <input
                              className="mt-1 size-4"
                              type="checkbox"
                              checked={item.checked}
                              disabled={
                                !canCheckItems ||
                                item.itemStatus !== 'active' ||
                                setChecklistItemCheckedMutation.isPending
                              }
                              onChange={(event) =>
                                handleSetChecklistItemChecked(item.id, event.target.checked)
                              }
                            />
                            <span className="min-w-0 space-y-1">
                              <span className="block text-sm font-medium">
                                {item.controlCode} · {item.controlTitle}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                Checklist Item {item.itemStatus} · Control Version v
                                {item.controlVersionNumber}
                                {usesOldVersion
                                  ? ` · latest v${currentControl.currentVersion.versionNumber}`
                                  : ''}
                                {archivedControl ? ' · Archived Control' : ''}
                              </span>
                            </span>
                          </label>
                          {canAddOrRemoveItem ? (
                            <div className="flex flex-wrap gap-2 sm:justify-end">
                              {usesOldVersion ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={refreshChecklistItemMutation.isPending}
                                  onClick={() => handleRefreshChecklistItem(item.id)}
                                >
                                  <RotateCcw />
                                  Refresh
                                </Button>
                              ) : null}
                              {archivedControl ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={enforceArchivedControlMutation.isPending}
                                  onClick={() =>
                                    handleEnforceArchivedControl(checklist, item.controlId)
                                  }
                                >
                                  <Archive />
                                  Enforce Archived
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={removeChecklistItemMutation.isPending}
                                onClick={() => handleRemoveChecklistItem(item.id)}
                              >
                                <Trash2 />
                                Remove
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>

                {canManageActiveProject && !archivedView ? (
                  <form
                    className="mt-4 flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-end"
                    onSubmit={(event) => handleAddChecklistItem(event, checklist)}
                  >
                    <div className="flex-1 space-y-2">
                      <Label htmlFor={`${checklist.id}-control`}>Add Control</Label>
                      <select
                        id={`${checklist.id}-control`}
                        name="controlId"
                        required
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                      >
                        <option value="">Select Control</option>
                        {activeControls
                          .filter(
                            (control) => !activeItems.some((item) => item.controlId === control.id),
                          )
                          .map((control) => (
                            <option key={control.id} value={control.id}>
                              {control.controlCode} · {control.title}
                            </option>
                          ))}
                      </select>
                    </div>
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={addChecklistItemMutation.isPending}
                    >
                      <Plus />
                      Add
                    </Button>
                  </form>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
