import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import {
  createOrganizationInvitation,
  getMembershipResolution,
  type MembershipResolutionResponse,
} from '../../features/auth/auth-api';
import { signOut, useSession } from '../../features/auth/auth-client';

export function HomePage() {
  const { data: session } = useSession();
  const [membershipResolution, setMembershipResolution] =
    useState<MembershipResolutionResponse | null>(null);
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [isLoadingResolution, setIsLoadingResolution] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [isSubmittingInvite, setIsSubmittingInvite] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function loadMembershipResolution() {
      setIsLoadingResolution(true);
      setResolutionError(null);

      try {
        const nextMembershipResolution = await getMembershipResolution();

        if (!isCancelled) {
          setMembershipResolution(nextMembershipResolution);
        }
      } catch (caughtError) {
        if (!isCancelled) {
          setResolutionError(
            caughtError instanceof Error
              ? caughtError.message
              : 'Unable to load organization context.',
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingResolution(false);
        }
      }
    }

    loadMembershipResolution();

    return () => {
      isCancelled = true;
    };
  }, []);

  const activeOrganization =
    membershipResolution?.organizations.find(
      ({ id }) => id === membershipResolution.activeOrganizationId,
    ) ?? null;

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

      setInviteStatus('Invitation created and emailed successfully.');
      setInviteLink(`${window.location.origin}/invite/${invitation.id}`);
      setInviteEmail('');
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Unable to create invitation.';
      setInviteError(message);
    } finally {
      setIsSubmittingInvite(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-slate-100 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-5xl rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-slate-950/30 backdrop-blur sm:p-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium tracking-[0.2em] text-emerald-300 uppercase">
              Protected route
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Welcome to Gatekeeper
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              This placeholder shell now includes organization invite creation and invite entry
              links.
            </p>
          </div>

          <button
            type="button"
            className="rounded-xl border border-white/15 bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-slate-800"
            onClick={async () => {
              await signOut();
            }}
          >
            Sign out
          </button>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
            <p className="text-sm font-medium text-slate-400">Signed in user</p>
            <p className="mt-2 text-lg font-semibold text-white">
              {session?.user.name ?? 'Unknown user'}
            </p>
            <p className="mt-1 text-sm text-slate-400">{session?.user.email}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
            <p className="text-sm font-medium text-slate-400">Active organization</p>
            <p className="mt-2 text-lg font-semibold text-white">
              {activeOrganization?.name || 'No active organization'}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {activeOrganization ? `${activeOrganization.role} access` : 'Load an invite to join one.'}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
            <p className="text-sm font-medium text-slate-400">Membership state</p>
            <p className="mt-2 text-lg font-semibold text-white">
              {membershipResolution?.status || 'Loading'}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {membershipResolution
                ? `${membershipResolution.organizations.length} organizations, ${membershipResolution.pendingInvites.length} pending invites`
                : 'Resolving access...' }
            </p>
          </div>
        </div>

        <section className="mt-8 rounded-3xl border border-white/10 bg-slate-900/70 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium tracking-[0.2em] text-slate-400 uppercase">
                Admin invite
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Invite a user</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Invitations are created in the current active organization context.
              </p>
            </div>
            {activeOrganization ? (
              <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-medium text-sky-200">
                {activeOrganization.name}
              </span>
            ) : null}
          </div>

          {resolutionError ? (
            <p className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {resolutionError}
            </p>
          ) : null}

          {isLoadingResolution ? (
            <p className="mt-4 text-sm text-slate-400">Loading organization context...</p>
          ) : null}

          <form className="mt-6 grid gap-4 sm:grid-cols-[1fr_180px_auto]" onSubmit={handleInviteSubmit}>
            <label className="block text-sm font-medium text-slate-200">
              Email
              <input
                type="email"
                placeholder="you@company.com"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                autoComplete="email"
                disabled={!activeOrganization || isSubmittingInvite}
                required
              />
            </label>

            <label className="block text-sm font-medium text-slate-200">
              Role
              <select
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white focus:border-sky-400 focus:outline-none"
                disabled={!activeOrganization || isSubmittingInvite}
              >
                <option value="member">member</option>
                <option value="admin">admin</option>
              </select>
            </label>

            <button
              type="submit"
              className="mt-7 rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
              disabled={!activeOrganization || isSubmittingInvite}
            >
              {isSubmittingInvite ? 'Sending invite...' : 'Send invite'}
            </button>
          </form>

          {inviteError ? (
            <p className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {inviteError}
            </p>
          ) : null}

          {inviteStatus ? (
            <div className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
              <p>{inviteStatus}</p>
              {inviteLink ? (
                <p className="mt-2 break-all text-emerald-100">
                  Invite link: <span className="font-medium">{inviteLink}</span>
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        {membershipResolution?.pendingInvites.length ? (
          <section className="mt-8 rounded-3xl border border-white/10 bg-slate-900/70 p-6">
            <p className="text-sm font-medium tracking-[0.2em] text-slate-400 uppercase">
              Pending invites
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Invites for this account</h2>
            <div className="mt-5 space-y-3">
              {membershipResolution.pendingInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/80 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{invite.organizationName}</p>
                    <p className="mt-1 text-sm text-slate-400">
                      Role: {invite.role || 'member'} · Expires {new Date(invite.expiresAt).toLocaleString()}
                    </p>
                  </div>
                  <Link
                    to={`/invite/${invite.id}`}
                    className="rounded-xl border border-white/15 bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-slate-800"
                  >
                    Review invite
                  </Link>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
