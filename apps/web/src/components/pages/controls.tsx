import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Plus } from 'lucide-react';
import { useParams } from 'react-router';
import {
  createDraftControl,
  getMembershipResolution,
  listControls,
  listDraftControls,
  publishDraftControl,
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

export function ControlsPage() {
  const { organizationSlug } = useParams();
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

  useEffect(() => {
    const refresh = async () => {
      if (!organizationSlug) return;

      setIsLoading(true);
      setError(null);
      try {
        const [controlResponse, draftResponse, resolution] = await Promise.all([
          listControls(organizationSlug),
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
  }, [organizationSlug]);

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

  const canPublish = canPublishControls(currentRole);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Controls</h1>
        <p className="text-sm text-muted-foreground">
          Publish complete Controls into the active Control Library.
        </p>
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

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Active Control Library</h2>
          <p className="text-sm text-muted-foreground">
            Published Controls are visible to every Organization member.
          </p>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading Controls...</p>
        ) : controls.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <h3 className="text-lg font-medium">No active Controls yet</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Published Controls will appear here after a Draft Control is completed.
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
                    Published {formatDate(control.createdAt)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading Draft Controls...</p>
      ) : draftControls.length === 0 ? (
        <section className="rounded-xl border border-dashed p-8 text-center">
          <h2 className="text-lg font-medium">No Draft Controls yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Draft Controls you can access will appear here after they are saved.
          </p>
        </section>
      ) : (
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
                <p className="shrink-0 text-xs text-muted-foreground">
                  Saved {formatDate(draftControl.createdAt)}
                </p>
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
      )}
    </div>
  );
}
