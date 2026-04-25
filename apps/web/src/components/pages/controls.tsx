import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertCircle, Archive, CheckCircle2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useParams, useSearchParams } from 'react-router';
import {
  archiveControl,
  cancelDraftControl,
  createDraftControl,
  getMembershipResolution,
  listControls,
  listDraftControls,
  publishDraftControl,
  restoreControl,
  type ControlListItem,
  type DraftControlListItem,
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

function canPublishControls(role: string | null): boolean {
  return role === 'owner' || role === 'admin';
}

function isArchivedView(value: string | null): boolean {
  return value === 'archived';
}

export function ControlsPage() {
  const { organizationSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [controls, setControls] = useState<ControlListItem[]>([]);
  const [draftControls, setDraftControls] = useState<DraftControlListItem[]>([]);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [publishingDraftId, setPublishingDraftId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [controlCode, setControlCode] = useState('');
  const [title, setTitle] = useState('');
  const [archiveControlId, setArchiveControlId] = useState<string | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const archivedView = isArchivedView(searchParams.get('status'));

  useEffect(() => {
    const refresh = async () => {
      if (!organizationSlug) return;

      setIsLoading(true);
      setError(null);
      try {
        const [controlResponse, draftResponse, resolution] = await Promise.all([
          listControls(organizationSlug, archivedView ? 'archived' : 'active'),
          listDraftControls(organizationSlug),
          getMembershipResolution(),
        ]);
        const organization = resolution.organizations.find((org) => org.slug === organizationSlug);

        setControls(controlResponse.controls);
        setDraftControls(draftResponse.draftControls);
        setCurrentRole(organization?.role ?? null);
      } catch (caughtError) {
        const rawMessage =
          caughtError instanceof Error ? caughtError.message : 'Unable to load Draft Controls.';
        setError(humanizeAuthError(null, rawMessage, 'Unable to load Draft Controls.'));
      } finally {
        setIsLoading(false);
      }
    };

    void refresh();
  }, [archivedView, organizationSlug]);

  const handleCreateDraftControl = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationSlug) return;

    setIsCreating(true);
    setError(null);
    setStatus(null);
    try {
      const response = await createDraftControl(organizationSlug, { controlCode, title });
      setDraftControls((currentDrafts) => [...currentDrafts, response.draftControl]);
      setControlCode('');
      setTitle('');
      setStatus('Draft Control saved.');
    } catch (caughtError) {
      const rawMessage =
        caughtError instanceof Error ? caughtError.message : 'Unable to save Draft Control.';
      setError(humanizeAuthError(null, rawMessage, 'Unable to save Draft Control.'));
    } finally {
      setIsCreating(false);
    }
  };

  const handlePublishDraftControl = async (
    event: FormEvent<HTMLFormElement>,
    draftControl: DraftControlListItem,
  ) => {
    event.preventDefault();
    if (!organizationSlug) return;

    const formData = new FormData(event.currentTarget);
    const acceptedEvidenceTypes = String(formData.get('acceptedEvidenceTypes') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    setPublishingDraftId(draftControl.id);
    setError(null);
    setStatus(null);
    try {
      const response = await publishDraftControl(organizationSlug, draftControl.id, {
        acceptedEvidenceTypes,
        applicabilityConditions: String(formData.get('applicabilityConditions') ?? ''),
        businessMeaning: String(formData.get('businessMeaning') ?? ''),
        releaseImpact: String(formData.get('releaseImpact') ?? ''),
        verificationMethod: String(formData.get('verificationMethod') ?? ''),
      });

      setControls((currentControls) => [...currentControls, response.control]);
      setDraftControls((currentDrafts) =>
        currentDrafts.filter((currentDraft) => currentDraft.id !== draftControl.id),
      );
      setStatus('Control published.');
    } catch (caughtError) {
      const rawMessage =
        caughtError instanceof Error ? caughtError.message : 'Unable to publish Control.';
      setError(humanizeAuthError(null, rawMessage, 'Unable to publish Control.'));
    } finally {
      setPublishingDraftId(null);
    }
  };

  const handleArchiveStateChange = async (control: ControlListItem, reason = '') => {
    if (!organizationSlug) return;

    setError(null);
    setStatus(null);
    try {
      if (archivedView) {
        await restoreControl(organizationSlug, control.id);
        setStatus('Control restored.');
      } else {
        await archiveControl(organizationSlug, control.id, { reason });
        setArchiveControlId(null);
        setArchiveReason('');
        setStatus('Control archived.');
      }
      setControls((currentControls) =>
        currentControls.filter((currentControl) => currentControl.id !== control.id),
      );
    } catch (caughtError) {
      const action = archivedView ? 'restore' : 'archive';
      const rawMessage =
        caughtError instanceof Error ? caughtError.message : `Unable to ${action} Control.`;
      setError(humanizeAuthError(null, rawMessage, `Unable to ${action} Control.`));
    }
  };

  const handleCancelDraftControl = async (draftControl: DraftControlListItem) => {
    if (!organizationSlug) return;

    setError(null);
    setStatus(null);
    try {
      await cancelDraftControl(organizationSlug, draftControl.id);
      setDraftControls((currentDrafts) =>
        currentDrafts.filter((currentDraft) => currentDraft.id !== draftControl.id),
      );
      setStatus('Draft Control canceled.');
    } catch (caughtError) {
      const rawMessage =
        caughtError instanceof Error ? caughtError.message : 'Unable to cancel Draft Control.';
      setError(humanizeAuthError(null, rawMessage, 'Unable to cancel Draft Control.'));
    }
  };

  const canPublish = canPublishControls(currentRole);
  const emptyTitle = archivedView ? 'No archived Controls' : 'No active Controls yet';
  const emptyDescription = archivedView
    ? 'Archived Controls will appear here after they are hidden from active use.'
    : 'Published Controls will appear here after a Draft Control is completed.';

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Controls</h1>
          <p className="text-sm text-muted-foreground">
            {archivedView
              ? 'Review Archived Controls hidden from active Control Library use.'
              : 'Publish complete Controls into the active Control Library.'}
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
          {canPublish ? (
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

      {!archivedView ? (
        <section className="rounded-xl border bg-card p-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Create Draft Control</h2>
            <p className="text-sm text-muted-foreground">
              Only Control Code and title are required while a Control is still a draft.
            </p>
          </div>
          <form
            className="mt-5 grid gap-4 sm:grid-cols-[12rem_1fr_auto]"
            onSubmit={handleCreateDraftControl}
          >
            <div className="space-y-2">
              <Label htmlFor="control-code">Control Code</Label>
              <Input
                id="control-code"
                value={controlCode}
                onChange={(event) => setControlCode(event.target.value)}
                placeholder="AUTH-001"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="control-title">Title</Label>
              <Input
                id="control-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Require multi-factor authentication"
                required
              />
            </div>
            <Button className="self-end" type="submit" disabled={isCreating}>
              <Plus />
              {isCreating ? 'Saving...' : 'Save Draft'}
            </Button>
          </form>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">
            {archivedView ? 'Archived Controls' : 'Active Control Library'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {archivedView
              ? 'Archived Controls keep their Control Codes reserved and are unavailable for new use.'
              : 'Published Controls are visible to every Organization member.'}
          </p>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading Controls...</p>
        ) : controls.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <h3 className="text-lg font-medium">{emptyTitle}</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              {emptyDescription}
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {controls.map((control) => (
              <article key={control.id} className="rounded-xl border bg-card p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {control.controlCode} · v{control.currentVersion.versionNumber}
                    </p>
                    <h3 className="text-base font-semibold">{control.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      Release Impact: {control.currentVersion.releaseImpact}
                    </p>
                    <p className="text-sm">{control.currentVersion.businessMeaning}</p>
                  </div>
                  <p className="shrink-0 text-xs text-muted-foreground">
                    {archivedView && control.archivedAt
                      ? `Archived ${formatDate(control.archivedAt)}`
                      : `Published ${formatDate(control.createdAt)}`}
                  </p>
                </div>
                {archivedView && control.archiveReason ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Archive reason: {control.archiveReason}
                  </p>
                ) : null}
                {canPublish ? (
                  <div className="mt-4 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (archivedView) {
                          void handleArchiveStateChange(control);
                          return;
                        }

                        setArchiveControlId(control.id);
                        setArchiveReason('');
                      }}
                    >
                      {archivedView ? <RotateCcw /> : <Archive />}
                      {archivedView ? 'Restore' : 'Archive'}
                    </Button>
                  </div>
                ) : null}
                {!archivedView && archiveControlId === control.id ? (
                  <form
                    className="mt-4 space-y-3 rounded-lg border bg-muted/30 p-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleArchiveStateChange(control, archiveReason);
                    }}
                  >
                    <div className="space-y-2">
                      <Label htmlFor={`${control.id}-archive-reason`}>Archive reason</Label>
                      <textarea
                        id={`${control.id}-archive-reason`}
                        value={archiveReason}
                        onChange={(event) => setArchiveReason(event.target.value)}
                        className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
                        placeholder="Optional context for why this Control is no longer used."
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setArchiveControlId(null);
                          setArchiveReason('');
                        }}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" size="sm">
                        Archive Control
                      </Button>
                    </div>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      {!archivedView && isLoading ? (
        <p className="text-sm text-muted-foreground">Loading Draft Controls...</p>
      ) : !archivedView && draftControls.length === 0 ? (
        <section className="rounded-xl border border-dashed p-8 text-center">
          <h2 className="text-lg font-medium">No Draft Controls yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Draft Controls you can access will appear here after they are saved.
          </p>
        </section>
      ) : !archivedView ? (
        <section className="grid gap-3">
          {draftControls.map((draftControl) => (
            <article key={draftControl.id} className="rounded-xl border bg-card p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {draftControl.controlCode}
                  </p>
                  <h2 className="text-base font-semibold">{draftControl.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    Author: {draftControl.author.name} ({draftControl.author.email})
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <p className="text-xs text-muted-foreground">
                    Saved {formatDate(draftControl.createdAt)}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleCancelDraftControl(draftControl)}
                  >
                    <Trash2 />
                    Cancel
                  </Button>
                </div>
              </div>
              {canPublish ? (
                <form
                  className="mt-5 grid gap-4"
                  onSubmit={(event) => handlePublishDraftControl(event, draftControl)}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`${draftControl.id}-business-meaning`}>
                        Business meaning
                      </Label>
                      <textarea
                        id={`${draftControl.id}-business-meaning`}
                        name="businessMeaning"
                        className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`${draftControl.id}-verification-method`}>
                        Verification method
                      </Label>
                      <textarea
                        id={`${draftControl.id}-verification-method`}
                        name="verificationMethod"
                        className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`${draftControl.id}-accepted-evidence-types`}>
                        Accepted Evidence Types
                      </Label>
                      <Input
                        id={`${draftControl.id}-accepted-evidence-types`}
                        name="acceptedEvidenceTypes"
                        placeholder="document, approval record"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`${draftControl.id}-release-impact`}>Release Impact</Label>
                      <select
                        id={`${draftControl.id}-release-impact`}
                        name="releaseImpact"
                        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                        required
                        defaultValue="blocking"
                      >
                        <option value="blocking">blocking</option>
                        <option value="needs review">needs review</option>
                        <option value="advisory">advisory</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${draftControl.id}-applicability-conditions`}>
                      Applicability conditions
                    </Label>
                    <textarea
                      id={`${draftControl.id}-applicability-conditions`}
                      name="applicabilityConditions"
                      className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
                      required
                    />
                  </div>
                  <Button type="submit" disabled={publishingDraftId === draftControl.id}>
                    <CheckCircle2 />
                    {publishingDraftId === draftControl.id ? 'Publishing...' : 'Publish Control'}
                  </Button>
                </form>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
