import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertCircle, Archive, CheckCircle2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useParams, useSearchParams } from 'react-router';
import {
  archiveControl,
  approveControlPublishRequest,
  cancelDraftControl,
  createControlProposedUpdate,
  createDraftControl,
  getControlApprovalPolicy,
  getMembershipResolution,
  listControlProposedUpdates,
  listControlPublishRequests,
  listControls,
  listDraftControls,
  publishControlProposedUpdate,
  publishDraftControl,
  rejectControlPublishRequest,
  restoreControl,
  submitControlProposedUpdatePublishRequest,
  submitDraftControlPublishRequest,
  withdrawControlPublishRequest,
  type ControlListItem,
  type ControlProposedUpdateListItem,
  type ControlPublishRequestListItem,
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

function toStatusFilter(value: string | null) {
  return value === 'active' || value === 'draft' || value === 'archived' ? value : 'all';
}

export function ControlsPage() {
  const { organizationSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [controls, setControls] = useState<ControlListItem[]>([]);
  const [draftControls, setDraftControls] = useState<DraftControlListItem[]>([]);
  const [proposedUpdates, setProposedUpdates] = useState<ControlProposedUpdateListItem[]>([]);
  const [publishRequests, setPublishRequests] = useState<ControlPublishRequestListItem[]>([]);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [currentMemberId, setCurrentMemberId] = useState<string | null>(null);
  const [approvalPolicyEnabled, setApprovalPolicyEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [publishingDraftId, setPublishingDraftId] = useState<string | null>(null);
  const [creatingProposalControlId, setCreatingProposalControlId] = useState<string | null>(null);
  const [publishingProposalId, setPublishingProposalId] = useState<string | null>(null);
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null);
  const [rejectionComment, setRejectionComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [controlCode, setControlCode] = useState('');
  const [title, setTitle] = useState('');
  const [archiveControlId, setArchiveControlId] = useState<string | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const search = searchParams.get('q') ?? '';
  const statusFilter = toStatusFilter(searchParams.get('status'));
  const archivedView = statusFilter === 'archived';
  const releaseImpact = searchParams.get('releaseImpact') ?? '';
  const acceptedEvidenceType = searchParams.get('acceptedEvidenceType') ?? '';
  const standardsFramework = searchParams.get('standardsFramework') ?? '';
  const canListDrafts =
    (statusFilter === 'all' || statusFilter === 'draft') &&
    !releaseImpact &&
    !acceptedEvidenceType &&
    !standardsFramework;
  const hasActiveControlFilters = Boolean(
    search || releaseImpact || acceptedEvidenceType || standardsFramework,
  );

  useEffect(() => {
    const refresh = async () => {
      if (!organizationSlug) return;

      setIsLoading(true);
      setError(null);
      try {
        const [
          controlResponse,
          draftResponse,
          proposalResponse,
          publishRequestResponse,
          policyResponse,
          resolution,
        ] = await Promise.all([
          statusFilter === 'draft'
            ? Promise.resolve({ controls: [] })
            : listControls(organizationSlug, {
                acceptedEvidenceType,
                releaseImpact,
                search,
                standardsFramework,
                status: statusFilter === 'archived' ? 'archived' : 'active',
              }),
          canListDrafts
            ? listDraftControls(organizationSlug, search)
            : Promise.resolve({ draftControls: [] }),
          archivedView
            ? Promise.resolve({ proposedUpdates: [] })
            : listControlProposedUpdates(organizationSlug),
          archivedView
            ? Promise.resolve({ publishRequests: [] })
            : listControlPublishRequests(organizationSlug),
          getControlApprovalPolicy(organizationSlug),
          getMembershipResolution(),
        ]);
        const organization = resolution.organizations.find((org) => org.slug === organizationSlug);

        setControls(controlResponse.controls);
        setDraftControls(draftResponse.draftControls);
        setProposedUpdates(proposalResponse.proposedUpdates);
        setPublishRequests(publishRequestResponse.publishRequests);
        setApprovalPolicyEnabled(policyResponse.policy.enabled);
        setCurrentRole(organization?.role ?? null);
        setCurrentMemberId(organization?.memberId ?? null);
      } catch (caughtError) {
        const rawMessage =
          caughtError instanceof Error ? caughtError.message : 'Unable to load Draft Controls.';
        setError(humanizeAuthError(null, rawMessage, 'Unable to load Draft Controls.'));
      } finally {
        setIsLoading(false);
      }
    };

    void refresh();
  }, [
    acceptedEvidenceType,
    archivedView,
    canListDrafts,
    organizationSlug,
    releaseImpact,
    search,
    standardsFramework,
    statusFilter,
  ]);

  const handleFilterControls = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const nextParams = new URLSearchParams();
    const nextSearch = String(formData.get('q') ?? '').trim();
    const nextStatus = String(formData.get('status') ?? 'all');
    const nextReleaseImpact = String(formData.get('releaseImpact') ?? '');
    const nextAcceptedEvidenceType = String(formData.get('acceptedEvidenceType') ?? '').trim();
    const nextStandardsFramework = String(formData.get('standardsFramework') ?? '').trim();

    if (nextSearch) nextParams.set('q', nextSearch);
    if (nextStatus !== 'all') nextParams.set('status', nextStatus);
    if (nextReleaseImpact) nextParams.set('releaseImpact', nextReleaseImpact);
    if (nextAcceptedEvidenceType) nextParams.set('acceptedEvidenceType', nextAcceptedEvidenceType);
    if (nextStandardsFramework) nextParams.set('standardsFramework', nextStandardsFramework);

    setSearchParams(nextParams);
  };

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
      const payload = {
        acceptedEvidenceTypes,
        applicabilityConditions: String(formData.get('applicabilityConditions') ?? ''),
        businessMeaning: String(formData.get('businessMeaning') ?? ''),
        releaseImpact: String(formData.get('releaseImpact') ?? ''),
        verificationMethod: String(formData.get('verificationMethod') ?? ''),
      };

      if (approvalPolicyEnabled) {
        const response = await submitDraftControlPublishRequest(
          organizationSlug,
          draftControl.id,
          payload,
        );
        setPublishRequests((currentRequests) =>
          upsertPublishRequest(currentRequests, response.publishRequest),
        );
        setStatus('Control Publish Request submitted.');
        return;
      }

      const response = await publishDraftControl(organizationSlug, draftControl.id, payload);

      if ((statusFilter === 'all' || statusFilter === 'active') && !hasActiveControlFilters) {
        setControls((currentControls) => [...currentControls, response.control]);
      }
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

  const handleCreateControlProposedUpdate = async (
    event: FormEvent<HTMLFormElement>,
    control: ControlListItem,
  ) => {
    event.preventDefault();
    if (!organizationSlug) return;

    const formData = new FormData(event.currentTarget);
    const acceptedEvidenceTypes = String(formData.get('acceptedEvidenceTypes') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    setCreatingProposalControlId(control.id);
    setError(null);
    setStatus(null);
    try {
      const response = await createControlProposedUpdate(organizationSlug, control.id, {
        acceptedEvidenceTypes,
        applicabilityConditions: String(formData.get('applicabilityConditions') ?? ''),
        businessMeaning: String(formData.get('businessMeaning') ?? ''),
        controlCode: String(formData.get('controlCode') ?? ''),
        releaseImpact: String(formData.get('releaseImpact') ?? ''),
        title: String(formData.get('title') ?? ''),
        verificationMethod: String(formData.get('verificationMethod') ?? ''),
      });

      setProposedUpdates((currentUpdates) => [...currentUpdates, response.proposedUpdate]);
      setStatus('Proposed update saved.');
    } catch (caughtError) {
      const rawMessage =
        caughtError instanceof Error ? caughtError.message : 'Unable to save proposed update.';
      setError(humanizeAuthError(null, rawMessage, 'Unable to save proposed update.'));
    } finally {
      setCreatingProposalControlId(null);
    }
  };

  const handlePublishControlProposedUpdate = async (
    proposedUpdate: ControlProposedUpdateListItem,
  ) => {
    if (!organizationSlug) return;

    setPublishingProposalId(proposedUpdate.id);
    setError(null);
    setStatus(null);
    try {
      const response = await publishControlProposedUpdate(
        organizationSlug,
        proposedUpdate.controlId,
        proposedUpdate.id,
      );

      setControls((currentControls) =>
        currentControls.map((control) =>
          control.id === response.control.id ? response.control : control,
        ),
      );
      setProposedUpdates((currentUpdates) =>
        currentUpdates.filter((currentUpdate) => currentUpdate.id !== proposedUpdate.id),
      );
      setStatus('Proposed update published.');
    } catch (caughtError) {
      const rawMessage =
        caughtError instanceof Error ? caughtError.message : 'Unable to publish proposed update.';
      setError(humanizeAuthError(null, rawMessage, 'Unable to publish proposed update.'));
    } finally {
      setPublishingProposalId(null);
    }
  };

  const handleSubmitControlProposedUpdate = async (
    proposedUpdate: ControlProposedUpdateListItem,
  ) => {
    if (!organizationSlug) return;

    setPublishingProposalId(proposedUpdate.id);
    setError(null);
    setStatus(null);
    try {
      const response = await submitControlProposedUpdatePublishRequest(
        organizationSlug,
        proposedUpdate.controlId,
        proposedUpdate.id,
      );

      setPublishRequests((currentRequests) =>
        upsertPublishRequest(currentRequests, response.publishRequest),
      );
      setStatus('Control Publish Request submitted.');
    } catch (caughtError) {
      const rawMessage =
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to submit Control Publish Request.';
      setError(humanizeAuthError(null, rawMessage, 'Unable to submit Control Publish Request.'));
    } finally {
      setPublishingProposalId(null);
    }
  };

  const handleApproveControlPublishRequest = async (request: ControlPublishRequestListItem) => {
    if (!organizationSlug) return;

    setReviewingRequestId(request.id);
    setError(null);
    setStatus(null);
    try {
      const response = await approveControlPublishRequest(organizationSlug, request.id);

      setPublishRequests((currentRequests) =>
        upsertPublishRequest(currentRequests, response.publishRequest),
      );
      setStatus('Control Publish Request approved.');
    } catch (caughtError) {
      const rawMessage =
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to approve Control Publish Request.';
      setError(humanizeAuthError(null, rawMessage, 'Unable to approve Control Publish Request.'));
    } finally {
      setReviewingRequestId(null);
    }
  };

  const handleRejectControlPublishRequest = async (
    event: FormEvent<HTMLFormElement>,
    request: ControlPublishRequestListItem,
  ) => {
    event.preventDefault();
    if (!organizationSlug) return;

    setReviewingRequestId(request.id);
    setError(null);
    setStatus(null);
    try {
      const response = await rejectControlPublishRequest(organizationSlug, request.id, {
        comment: rejectionComment,
      });

      setPublishRequests((currentRequests) =>
        upsertPublishRequest(currentRequests, response.publishRequest),
      );
      setRejectingRequestId(null);
      setRejectionComment('');
      setStatus('Control Publish Request rejected and returned to draft.');
    } catch (caughtError) {
      const rawMessage =
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to reject Control Publish Request.';
      setError(humanizeAuthError(null, rawMessage, 'Unable to reject Control Publish Request.'));
    } finally {
      setReviewingRequestId(null);
    }
  };

  const handleWithdrawControlPublishRequest = async (request: ControlPublishRequestListItem) => {
    if (!organizationSlug) return;

    setReviewingRequestId(request.id);
    setError(null);
    setStatus(null);
    try {
      const response = await withdrawControlPublishRequest(organizationSlug, request.id);

      setPublishRequests((currentRequests) =>
        upsertPublishRequest(currentRequests, response.publishRequest),
      );
      setStatus('Control Publish Request withdrawn.');
    } catch (caughtError) {
      const rawMessage =
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to withdraw Control Publish Request.';
      setError(humanizeAuthError(null, rawMessage, 'Unable to withdraw Control Publish Request.'));
    } finally {
      setReviewingRequestId(null);
    }
  };

  const canPublish = canPublishControls(currentRole);
  const canCompleteDrafts = canPublish || approvalPolicyEnabled;
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
        <form className="rounded-xl border bg-card p-4" onSubmit={handleFilterControls}>
          <div className="grid gap-4 md:grid-cols-5">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="control-search">Search Controls</Label>
              <Input
                id="control-search"
                name="q"
                defaultValue={search}
                placeholder="Control Code, title, meaning, or standard"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="control-status-filter">Status</Label>
              <select
                id="control-status-filter"
                name="status"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                defaultValue={statusFilter}
              >
                <option value="all">All current</option>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="release-impact-filter">Release Impact</Label>
              <select
                id="release-impact-filter"
                name="releaseImpact"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                defaultValue={releaseImpact}
              >
                <option value="">Any</option>
                <option value="blocking">blocking</option>
                <option value="needs review">needs review</option>
                <option value="advisory">advisory</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="evidence-type-filter">Accepted Evidence Type</Label>
              <Input
                id="evidence-type-filter"
                name="acceptedEvidenceType"
                defaultValue={acceptedEvidenceType}
                placeholder="document"
              />
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="standards-framework-filter">Standards framework</Label>
              <Input
                id="standards-framework-filter"
                name="standardsFramework"
                defaultValue={standardsFramework}
                placeholder="SOC 2"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Apply filters</Button>
              <Button type="button" variant="outline" onClick={() => setSearchParams({})}>
                Clear
              </Button>
            </div>
          </div>
        </form>
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
            {controls.map((control) => {
              const proposedUpdate = proposedUpdates.find(
                (update) => update.controlId === control.id,
              );

              return (
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
                  {control.versions.length > 0 ? (
                    <div className="mt-4 rounded-lg border bg-muted/30 p-3">
                      <h4 className="text-sm font-medium">Version history</h4>
                      <div className="mt-2 space-y-2">
                        {control.versions.map((version) => (
                          <div key={version.id} className="text-sm text-muted-foreground">
                            v{version.versionNumber} · {version.controlCode} · {version.title} ·{' '}
                            {formatDate(version.createdAt)}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {!archivedView && proposedUpdate ? (
                    <div className="mt-4 rounded-lg border border-dashed p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium">Open proposed update</h4>
                          <p className="text-sm text-muted-foreground">
                            {proposedUpdate.controlCode} · {proposedUpdate.title}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Author: {proposedUpdate.author.name} ({proposedUpdate.author.email})
                          </p>
                        </div>
                        {approvalPolicyEnabled ? (
                          <Button
                            type="button"
                            disabled={
                              publishingProposalId === proposedUpdate.id ||
                              publishRequests.some(
                                (request) =>
                                  request.proposedUpdateId === proposedUpdate.id &&
                                  request.status === 'submitted',
                              )
                            }
                            onClick={() => void handleSubmitControlProposedUpdate(proposedUpdate)}
                          >
                            <CheckCircle2 />
                            {publishRequests.some(
                              (request) =>
                                request.proposedUpdateId === proposedUpdate.id &&
                                request.status === 'submitted',
                            )
                              ? 'Request Submitted'
                              : publishingProposalId === proposedUpdate.id
                                ? 'Submitting...'
                                : 'Submit for Review'}
                          </Button>
                        ) : canPublish ? (
                          <Button
                            type="button"
                            disabled={publishingProposalId === proposedUpdate.id}
                            onClick={() => void handlePublishControlProposedUpdate(proposedUpdate)}
                          >
                            <CheckCircle2 />
                            {publishingProposalId === proposedUpdate.id
                              ? 'Publishing...'
                              : 'Publish Proposed Update'}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : !archivedView ? (
                    <form
                      className="mt-4 grid gap-4 rounded-lg border p-4"
                      onSubmit={(event) => handleCreateControlProposedUpdate(event, control)}
                    >
                      <h4 className="text-sm font-medium">Propose update</h4>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor={`${control.id}-proposal-code`}>Control Code</Label>
                          <Input
                            id={`${control.id}-proposal-code`}
                            name="controlCode"
                            defaultValue={control.currentVersion.controlCode}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`${control.id}-proposal-title`}>Title</Label>
                          <Input
                            id={`${control.id}-proposal-title`}
                            name="title"
                            defaultValue={control.currentVersion.title}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`${control.id}-proposal-business-meaning`}>
                            Business meaning
                          </Label>
                          <textarea
                            id={`${control.id}-proposal-business-meaning`}
                            name="businessMeaning"
                            className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                            defaultValue={control.currentVersion.businessMeaning}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`${control.id}-proposal-verification-method`}>
                            Verification method
                          </Label>
                          <textarea
                            id={`${control.id}-proposal-verification-method`}
                            name="verificationMethod"
                            className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                            defaultValue={control.currentVersion.verificationMethod}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`${control.id}-proposal-evidence-types`}>
                            Accepted Evidence Types
                          </Label>
                          <Input
                            id={`${control.id}-proposal-evidence-types`}
                            name="acceptedEvidenceTypes"
                            defaultValue={control.currentVersion.acceptedEvidenceTypes.join(', ')}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`${control.id}-proposal-release-impact`}>
                            Release Impact
                          </Label>
                          <select
                            id={`${control.id}-proposal-release-impact`}
                            name="releaseImpact"
                            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                            defaultValue={control.currentVersion.releaseImpact}
                            required
                          >
                            <option value="blocking">blocking</option>
                            <option value="needs review">needs review</option>
                            <option value="advisory">advisory</option>
                          </select>
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor={`${control.id}-proposal-applicability`}>
                            Applicability conditions
                          </Label>
                          <textarea
                            id={`${control.id}-proposal-applicability`}
                            name="applicabilityConditions"
                            className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
                            defaultValue={control.currentVersion.applicabilityConditions}
                            required
                          />
                        </div>
                      </div>
                      <Button type="submit" disabled={creatingProposalControlId === control.id}>
                        <Plus />
                        {creatingProposalControlId === control.id
                          ? 'Saving...'
                          : 'Save Proposed Update'}
                      </Button>
                    </form>
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
              );
            })}
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
              {canCompleteDrafts ? (
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
                  <Button
                    type="submit"
                    disabled={
                      publishingDraftId === draftControl.id ||
                      publishRequests.some(
                        (request) =>
                          request.draftControlId === draftControl.id &&
                          request.status === 'submitted',
                      )
                    }
                  >
                    <CheckCircle2 />
                    {publishRequests.some(
                      (request) =>
                        request.draftControlId === draftControl.id &&
                        request.status === 'submitted',
                    )
                      ? 'Request Submitted'
                      : publishingDraftId === draftControl.id
                        ? approvalPolicyEnabled
                          ? 'Submitting...'
                          : 'Publishing...'
                        : approvalPolicyEnabled
                          ? 'Submit for Review'
                          : 'Publish Control'}
                  </Button>
                </form>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}

      {!archivedView && publishRequests.length > 0 ? (
        <section className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Control Publish Requests</h2>
            <p className="text-sm text-muted-foreground">
              Submitted requests wait for approvals before the Control can be published.
            </p>
          </div>
          <div className="grid gap-3">
            {publishRequests.map((request) => (
              <article key={request.id} className="rounded-xl border bg-card p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {request.controlCode} ·{' '}
                      {request.requestType === 'draft_control' ? 'New Control' : 'Control update'}
                    </p>
                    <h3 className="text-base font-semibold">{request.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      Author: {request.author.name} ({request.author.email})
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Approvals: {request.approvalCount} of {request.requiredApprovalCount}
                    </p>
                    <p className="text-sm text-muted-foreground">Status: {request.status}</p>
                    {request.rejectionComment ? (
                      <p className="text-sm text-muted-foreground">
                        Rejection comment: {request.rejectionComment}
                      </p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-xs text-muted-foreground">
                    Submitted {formatDate(request.submittedAt)}
                  </p>
                </div>
                {request.status === 'submitted' ? (
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    {request.author.id === currentMemberId ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={reviewingRequestId === request.id}
                        onClick={() => void handleWithdrawControlPublishRequest(request)}
                      >
                        Withdraw
                      </Button>
                    ) : null}
                    {canPublish && request.author.id !== currentMemberId ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          disabled={reviewingRequestId === request.id}
                          onClick={() => void handleApproveControlPublishRequest(request)}
                        >
                          Approve
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={reviewingRequestId === request.id}
                          onClick={() => {
                            setRejectingRequestId(request.id);
                            setRejectionComment('');
                          }}
                        >
                          Reject
                        </Button>
                      </>
                    ) : null}
                  </div>
                ) : null}
                {rejectingRequestId === request.id ? (
                  <form
                    className="mt-4 space-y-3 rounded-lg border bg-muted/30 p-3"
                    onSubmit={(event) => handleRejectControlPublishRequest(event, request)}
                  >
                    <div className="space-y-2">
                      <Label htmlFor={`${request.id}-rejection-comment`}>Rejection comment</Label>
                      <textarea
                        id={`${request.id}-rejection-comment`}
                        value={rejectionComment}
                        onChange={(event) => setRejectionComment(event.target.value)}
                        className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
                        required
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setRejectingRequestId(null);
                          setRejectionComment('');
                        }}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" size="sm" disabled={reviewingRequestId === request.id}>
                        Reject Request
                      </Button>
                    </div>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function upsertPublishRequest(
  requests: ControlPublishRequestListItem[],
  nextRequest: ControlPublishRequestListItem,
) {
  return requests.some((request) => request.id === nextRequest.id)
    ? requests.map((request) => (request.id === nextRequest.id ? nextRequest : request))
    : [...requests, nextRequest];
}
