import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router';
import {
  acceptOrganizationInvitation,
  createOrganization,
  getMembershipResolution,
  type MembershipResolutionResponse,
} from '../../features/auth/auth-api';
import { humanizeAuthError } from '../../features/auth/auth-errors';
import {
  buildOrganizationPath,
  getPostLoginView,
  slugifyOrganizationName,
} from '../../features/auth/auth-routing';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function getInviteRoleLabel(role: string | null) {
  return role || 'member';
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

export function HomePage() {
  const { organizationSlug } = useParams();
  const [resolution, setResolution] = useState<MembershipResolutionResponse | null>(null);
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [orgError, setOrgError] = useState<string | null>(null);
  const [orgStatus, setOrgStatus] = useState<string | null>(null);
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);

  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const refresh = async () => {
    setIsLoading(true);
    setResolutionError(null);
    try {
      const next = await getMembershipResolution();
      setResolution(next);
    } catch (caughtError) {
      const rawMessage =
        caughtError instanceof Error ? caughtError.message : 'Unable to load organization context.';
      setResolutionError(
        humanizeAuthError(null, rawMessage, 'Unable to load organization context.'),
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleCreateOrganization = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!orgSlug) {
      setOrgError('Organization slug is required.');
      return;
    }
    setOrgError(null);
    setOrgStatus(null);
    setIsCreatingOrg(true);
    try {
      await createOrganization({
        keepCurrentActiveOrganization: false,
        name: orgName,
        slug: orgSlug,
      });
      setOrgStatus('Organization created.');
      setOrgName('');
      setOrgSlug('');
      await refresh();
    } catch (caughtError) {
      const rawMessage =
        caughtError instanceof Error ? caughtError.message : 'Unable to create organization.';
      setOrgError(humanizeAuthError(null, rawMessage, 'Unable to create organization.'));
    } finally {
      setIsCreatingOrg(false);
    }
  };

  const handleAcceptInvitation = async (invitationId: string) => {
    setOrgError(null);
    setOrgStatus(null);
    setAcceptingId(invitationId);
    try {
      await acceptOrganizationInvitation(invitationId);
      setOrgStatus('Invitation accepted.');
      await refresh();
    } catch (caughtError) {
      const rawMessage =
        caughtError instanceof Error ? caughtError.message : 'Unable to accept invitation.';
      setOrgError(humanizeAuthError(null, rawMessage, 'Unable to accept invitation.'));
    } finally {
      setAcceptingId(null);
    }
  };

  if (isLoading && !resolution) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  if (!resolution) {
    return (
      <div className="mx-auto w-full max-w-xl space-y-4">
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Couldn’t load your account</AlertTitle>
          <AlertDescription>{resolutionError || 'Unknown error.'}</AlertDescription>
        </Alert>
        <Button onClick={() => void refresh()}>Try again</Button>
      </div>
    );
  }

  const view = getPostLoginView(resolution);
  const activeOrg =
    resolution.organizations.find((org) => org.id === resolution.activeOrganizationId) ?? null;

  if (!organizationSlug && view === 'app' && activeOrg) {
    return <Navigate to={buildOrganizationPath(activeOrg.slug)} replace />;
  }

  const feedback = (
    <>
      {orgError ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{orgError}</AlertDescription>
        </Alert>
      ) : null}
      {orgStatus ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Done</AlertTitle>
          <AlertDescription>{orgStatus}</AlertDescription>
        </Alert>
      ) : null}
    </>
  );

  const createOrganizationForm = (
    <form className="space-y-5" onSubmit={handleCreateOrganization}>
      <div className="space-y-2">
        <Label htmlFor="org-name">Organization name</Label>
        <Input
          id="org-name"
          type="text"
          value={orgName}
          onChange={(event) => {
            setOrgName(event.target.value);
            setOrgSlug(slugifyOrganizationName(event.target.value));
          }}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="org-slug">Slug</Label>
        <Input
          id="org-slug"
          type="text"
          value={orgSlug}
          onChange={(event) => setOrgSlug(slugifyOrganizationName(event.target.value))}
          required
        />
      </div>
      <Button type="submit" disabled={isCreatingOrg}>
        {isCreatingOrg ? 'Creating...' : 'Create organization'}
      </Button>
    </form>
  );

  if (view === 'organization-creation') {
    return (
      <div className="mx-auto w-full max-w-xl space-y-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Create your organization</h1>
          <p className="text-sm text-muted-foreground">
            You don’t belong to any organization yet. Create one to start using Gatekeeper.
          </p>
        </header>
        {feedback}
        {createOrganizationForm}
      </div>
    );
  }

  if (view === 'organization-choice') {
    return (
      <div className="mx-auto w-full max-w-xl space-y-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Choose how to continue</h1>
          <p className="text-sm text-muted-foreground">
            Accept one of your pending invites, or create a new organization.
          </p>
        </header>

        {feedback}

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Pending invites</h2>
          <div className="space-y-3">
            {resolution.pendingInvites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium">{invite.organizationName}</p>
                  <p className="text-xs text-muted-foreground">
                    {getInviteRoleLabel(invite.role)} · expires {formatDateTime(invite.expiresAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => void handleAcceptInvitation(invite.id)}
                    disabled={acceptingId === invite.id}
                  >
                    {acceptingId === invite.id ? 'Accepting...' : 'Accept'}
                  </Button>
                  <Button asChild variant="outline">
                    <Link to={`/invite/${invite.id}`}>Review</Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {resolution.canCreateOrganization ? (
          <section className="space-y-4">
            <h2 className="text-sm font-medium text-muted-foreground">
              Or create a new organization
            </h2>
            {createOrganizationForm}
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {activeOrg ? `You’re working in ${activeOrg.name}.` : 'Welcome back.'}
        </p>
      </header>

      {feedback}

      {resolution.pendingInvites.length ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Pending invites</h2>
          <div className="space-y-3">
            {resolution.pendingInvites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium">{invite.organizationName}</p>
                  <p className="text-xs text-muted-foreground">
                    {getInviteRoleLabel(invite.role)} · expires {formatDateTime(invite.expiresAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => void handleAcceptInvitation(invite.id)}
                    disabled={acceptingId === invite.id}
                  >
                    {acceptingId === invite.id ? 'Accepting...' : 'Accept'}
                  </Button>
                  <Button asChild variant="outline">
                    <Link to={`/invite/${invite.id}`}>Review</Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
