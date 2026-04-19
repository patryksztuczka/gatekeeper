import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import {
  acceptOrganizationInvitation,
  createOrganization,
  createOrganizationInvitation,
  getMembershipResolution,
  setActiveOrganization,
  type MembershipResolutionResponse,
} from '../../features/auth/auth-api';
import { signOut, useSession } from '../../features/auth/auth-client';
import { getPostLoginView, slugifyOrganizationName } from '../../features/auth/auth-routing';

function getInviteRoleLabel(role: string | null) {
  return role || 'member';
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

export function HomePage() {
  const { data: session } = useSession();
  const [membershipResolution, setMembershipResolution] =
    useState<MembershipResolutionResponse | null>(null);
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [isLoadingResolution, setIsLoadingResolution] = useState(true);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [organizationSlug, setOrganizationSlug] = useState('');
  const [organizationError, setOrganizationError] = useState<string | null>(null);
  const [organizationStatus, setOrganizationStatus] = useState<string | null>(null);
  const [isSubmittingOrganization, setIsSubmittingOrganization] = useState(false);
  const [switchingOrganizationId, setSwitchingOrganizationId] = useState(false);
  const [acceptingInvitationId, setAcceptingInvitationId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [isSubmittingInvite, setIsSubmittingInvite] = useState(false);

  async function refreshMembershipResolution() {
    setIsLoadingResolution(true);
    setResolutionError(null);

    try {
      const nextMembershipResolution = await getMembershipResolution();
      setMembershipResolution(nextMembershipResolution);
      setSelectedOrganizationId(nextMembershipResolution.activeOrganizationId || '');
    } catch (caughtError) {
      setResolutionError(
        caughtError instanceof Error ? caughtError.message : 'Unable to load organization context.',
      );
    } finally {
      setIsLoadingResolution(false);
    }
  }

  useEffect(() => {
    void refreshMembershipResolution();
  }, []);

  const activeOrganization =
    membershipResolution?.organizations.find(
      ({ id }) => id === membershipResolution.activeOrganizationId,
    ) ?? null;

  const handleCreateOrganization = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!organizationSlug) {
      setOrganizationError('Organization slug is required.');
      return;
    }

    setOrganizationError(null);
    setOrganizationStatus(null);
    setIsSubmittingOrganization(true);

    try {
      await createOrganization({
        keepCurrentActiveOrganization: false,
        name: organizationName,
        slug: organizationSlug,
      });

      setOrganizationStatus('Organization created.');
      setOrganizationName('');
      setOrganizationSlug('');
      await refreshMembershipResolution();
    } catch (caughtError) {
      setOrganizationError(
        caughtError instanceof Error ? caughtError.message : 'Unable to create organization.',
      );
    } finally {
      setIsSubmittingOrganization(false);
    }
  };

  const handleSwitchOrganization = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedOrganizationId) {
      setOrganizationError('Choose an organization first.');
      return;
    }

    setOrganizationError(null);
    setOrganizationStatus(null);
    setSwitchingOrganizationId(true);

    try {
      await setActiveOrganization({ organizationId: selectedOrganizationId });
      setOrganizationStatus('Active organization updated.');
      await refreshMembershipResolution();
    } catch (caughtError) {
      setOrganizationError(
        caughtError instanceof Error ? caughtError.message : 'Unable to switch organization.',
      );
    } finally {
      setSwitchingOrganizationId(false);
    }
  };

  const handleAcceptInvitation = async (invitationId: string) => {
    setOrganizationError(null);
    setOrganizationStatus(null);
    setAcceptingInvitationId(invitationId);

    try {
      await acceptOrganizationInvitation(invitationId);
      setOrganizationStatus('Invitation accepted.');
      await refreshMembershipResolution();
    } catch (caughtError) {
      setOrganizationError(
        caughtError instanceof Error ? caughtError.message : 'Unable to accept invitation.',
      );
    } finally {
      setAcceptingInvitationId(null);
    }
  };

  const handleInviteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInviteError(null);
    setInviteStatus(null);
    setInviteLink(null);
    setIsSubmittingInvite(true);

    try {
      const invitation = await createOrganizationInvitation({
        email: inviteEmail,
        role: inviteRole,
      });

      setInviteStatus('Invitation created.');
      setInviteLink(`${window.location.origin}/invite/${invitation.id}`);
      setInviteEmail('');
      await refreshMembershipResolution();
    } catch (caughtError) {
      setInviteError(
        caughtError instanceof Error ? caughtError.message : 'Unable to create invitation.',
      );
    } finally {
      setIsSubmittingInvite(false);
    }
  };

  if (isLoadingResolution && !membershipResolution) {
    return <p className="text-sm">Loading account state...</p>;
  }

  if (!membershipResolution) {
    return (
      <div>
        <p className="text-xs uppercase">Post-login routing</p>
        <h1 className="mt-2 text-2xl font-bold">Unable to load your organization state</h1>
        <p className="mt-4 border border-red-700 bg-red-100 p-3 text-sm">
          {resolutionError || 'Unknown error.'}
        </p>
        <button
          type="button"
          onClick={() => {
            void refreshMembershipResolution();
          }}
          className="mt-4 border border-black bg-black px-4 py-2 text-sm font-bold text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  const postLoginView = getPostLoginView(membershipResolution);

  return (
    <main className="min-h-screen bg-stone-200 px-4 py-6 text-black sm:px-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <section className="border-2 border-black bg-white p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs uppercase">Protected app</p>
              <h1 className="mt-2 text-3xl font-bold">Gatekeeper</h1>
              <p className="mt-3 text-sm leading-6">
                Signed in as {session?.user.name || session?.user.email || 'unknown user'}.
              </p>
              <p className="text-sm">{session?.user.email}</p>
            </div>

            <button
              type="button"
              onClick={async () => {
                await signOut();
              }}
              className="border border-black bg-black px-4 py-2 text-sm font-bold text-white"
            >
              Sign out
            </button>
          </div>

          {resolutionError ? (
            <p className="mt-4 border border-red-700 bg-red-100 p-3 text-sm">{resolutionError}</p>
          ) : null}
          {organizationError ? (
            <p className="mt-4 border border-red-700 bg-red-100 p-3 text-sm">{organizationError}</p>
          ) : null}
          {organizationStatus ? (
            <p className="mt-4 border border-green-700 bg-green-100 p-3 text-sm">
              {organizationStatus}
            </p>
          ) : null}
          {isLoadingResolution ? <p className="mt-4 text-sm">Refreshing organization data...</p> : null}
        </section>

        {postLoginView === 'organization-creation' ? (
          <section className="border-2 border-black bg-white p-5">
            <p className="text-xs uppercase">Create organization</p>
            <h2 className="mt-2 text-2xl font-bold">You do not have an organization yet</h2>
            <p className="mt-4 text-sm leading-6">
              Create one to enter the product. There are no pending invites for this account.
            </p>

            <form className="mt-5 space-y-4" onSubmit={handleCreateOrganization}>
              <label className="block text-sm">
                <span className="font-bold">Organization name</span>
                <input
                  type="text"
                  value={organizationName}
                  onChange={(event) => {
                    setOrganizationName(event.target.value);
                    setOrganizationSlug(slugifyOrganizationName(event.target.value));
                  }}
                  className="mt-1 block w-full border border-black px-3 py-2"
                  required
                />
              </label>

              <label className="block text-sm">
                <span className="font-bold">Slug</span>
                <input
                  type="text"
                  value={organizationSlug}
                  onChange={(event) => setOrganizationSlug(slugifyOrganizationName(event.target.value))}
                  className="mt-1 block w-full border border-black px-3 py-2"
                  required
                />
              </label>

              <button
                type="submit"
                className="border border-black bg-black px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                disabled={isSubmittingOrganization}
              >
                {isSubmittingOrganization ? 'Creating...' : 'Create organization'}
              </button>
            </form>
          </section>
        ) : null}

        {postLoginView === 'organization-choice' ? (
          <section className="border-2 border-black bg-white p-5">
            <p className="text-xs uppercase">Choose next step</p>
            <h2 className="mt-2 text-2xl font-bold">No active organization yet</h2>
            <p className="mt-4 text-sm leading-6">
              You can accept one of your pending invites or create a new organization.
            </p>

            <div className="mt-5 space-y-3">
              {membershipResolution.pendingInvites.map((invite) => (
                <div key={invite.id} className="border border-black p-4">
                  <p className="text-sm font-bold">{invite.organizationName}</p>
                  <p className="mt-1 text-sm">
                    Role: {getInviteRoleLabel(invite.role)}. Expires {formatDateTime(invite.expiresAt)}.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm">
                    <button
                      type="button"
                      onClick={() => {
                        void handleAcceptInvitation(invite.id);
                      }}
                      disabled={acceptingInvitationId === invite.id}
                      className="border border-black bg-black px-3 py-2 font-bold text-white disabled:opacity-60"
                    >
                      {acceptingInvitationId === invite.id ? 'Accepting...' : 'Accept pending invite'}
                    </button>
                    <Link to={`/invite/${invite.id}`} className="border border-black px-3 py-2">
                      Open invite screen
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {membershipResolution.canCreateOrganization ? (
              <form className="mt-6 space-y-4 border-t-2 border-black pt-5" onSubmit={handleCreateOrganization}>
                <p className="text-sm font-bold">Create organization</p>

                <label className="block text-sm">
                  <span className="font-bold">Organization name</span>
                  <input
                    type="text"
                    value={organizationName}
                    onChange={(event) => {
                      setOrganizationName(event.target.value);
                      setOrganizationSlug(slugifyOrganizationName(event.target.value));
                    }}
                    className="mt-1 block w-full border border-black px-3 py-2"
                    required
                  />
                </label>

                <label className="block text-sm">
                  <span className="font-bold">Slug</span>
                  <input
                    type="text"
                    value={organizationSlug}
                    onChange={(event) => setOrganizationSlug(slugifyOrganizationName(event.target.value))}
                    className="mt-1 block w-full border border-black px-3 py-2"
                    required
                  />
                </label>

                <button
                  type="submit"
                  className="border border-black bg-black px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                  disabled={isSubmittingOrganization}
                >
                  {isSubmittingOrganization ? 'Creating...' : 'Create organization'}
                </button>
              </form>
            ) : null}
          </section>
        ) : null}

        {postLoginView === 'app' ? (
          <>
            <section className="border-2 border-black bg-white p-5">
              <p className="text-xs uppercase">Current access</p>
              <h2 className="mt-2 text-2xl font-bold">
                {activeOrganization?.name || 'No active organization'}
              </h2>
              <p className="mt-4 text-sm">
                Status: {membershipResolution.status}. Organizations: {membershipResolution.organizations.length}. Pending invites: {membershipResolution.pendingInvites.length}.
              </p>
              <p className="text-sm">Role: {activeOrganization?.role || 'none'}.</p>
            </section>

            <section className="border-2 border-black bg-white p-5">
              <p className="text-xs uppercase">Organization picker</p>
              <h2 className="mt-2 text-2xl font-bold">Switch active organization</h2>

              <form className="mt-5 space-y-4" onSubmit={handleSwitchOrganization}>
                <label className="block text-sm">
                  <span className="font-bold">Organization</span>
                  <select
                    value={selectedOrganizationId}
                    onChange={(event) => setSelectedOrganizationId(event.target.value)}
                    className="mt-1 block w-full border border-black px-3 py-2"
                  >
                    {membershipResolution.organizations.map((organization) => (
                      <option key={organization.id} value={organization.id}>
                        {organization.name} ({organization.role})
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="submit"
                  className="border border-black bg-black px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                  disabled={switchingOrganizationId}
                >
                  {switchingOrganizationId ? 'Switching...' : 'Set active organization'}
                </button>
              </form>
            </section>

            <section className="border-2 border-black bg-white p-5">
              <p className="text-xs uppercase">Admin invite</p>
              <h2 className="mt-2 text-2xl font-bold">Invite a user</h2>
              <p className="mt-4 text-sm leading-6">
                Invitations are created in the current active organization context.
              </p>

              <form className="mt-5 space-y-4" onSubmit={handleInviteSubmit}>
                <label className="block text-sm">
                  <span className="font-bold">Email</span>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    className="mt-1 block w-full border border-black px-3 py-2"
                    autoComplete="email"
                    disabled={!activeOrganization || isSubmittingInvite}
                    required
                  />
                </label>

                <label className="block text-sm">
                  <span className="font-bold">Role</span>
                  <select
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value)}
                    className="mt-1 block w-full border border-black px-3 py-2"
                    disabled={!activeOrganization || isSubmittingInvite}
                  >
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                  </select>
                </label>

                <button
                  type="submit"
                  className="border border-black bg-black px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                  disabled={!activeOrganization || isSubmittingInvite}
                >
                  {isSubmittingInvite ? 'Sending invite...' : 'Send invite'}
                </button>
              </form>

              {inviteError ? (
                <p className="mt-4 border border-red-700 bg-red-100 p-3 text-sm">{inviteError}</p>
              ) : null}
              {inviteStatus ? (
                <div className="mt-4 border border-green-700 bg-green-100 p-3 text-sm">
                  <p>{inviteStatus}</p>
                  {inviteLink ? <p className="mt-2 break-all">Invite link: {inviteLink}</p> : null}
                </div>
              ) : null}
            </section>

            {membershipResolution.pendingInvites.length ? (
              <section className="border-2 border-black bg-white p-5">
                <p className="text-xs uppercase">Pending invites</p>
                <h2 className="mt-2 text-2xl font-bold">Invites for this account</h2>

                <div className="mt-5 space-y-3">
                  {membershipResolution.pendingInvites.map((invite) => (
                    <div key={invite.id} className="border border-black p-4">
                      <p className="text-sm font-bold">{invite.organizationName}</p>
                      <p className="mt-1 text-sm">
                        Role: {getInviteRoleLabel(invite.role)}. Expires {formatDateTime(invite.expiresAt)}.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-3 text-sm">
                        <button
                          type="button"
                          onClick={() => {
                            void handleAcceptInvitation(invite.id);
                          }}
                          disabled={acceptingInvitationId === invite.id}
                          className="border border-black bg-black px-3 py-2 font-bold text-white disabled:opacity-60"
                        >
                          {acceptingInvitationId === invite.id ? 'Accepting...' : 'Accept now'}
                        </button>
                        <Link to={`/invite/${invite.id}`} className="border border-black px-3 py-2">
                          Review invite
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
