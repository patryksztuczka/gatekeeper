import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  acceptOrganizationInvitation,
  getInvitationEntry,
  type InvitationEntryResponse,
} from '../../features/auth/auth-api';
import { signOut } from '../../features/auth/auth-client';

const statusMessages: Record<
  InvitationEntryResponse['status'],
  {
    description: string;
    title: string;
  }
> = {
  accepted: {
    description: 'This invite has already been accepted. Sign in if you need to access the organization.',
    title: 'Invitation already used',
  },
  canceled: {
    description: 'This invite was cancelled by an administrator. Ask them to send a new one if you still need access.',
    title: 'Invitation cancelled',
  },
  expired: {
    description: 'This invite has expired. Ask an administrator to send a fresh invite link.',
    title: 'Invitation expired',
  },
  invalid: {
    description: 'This invite link is not valid.',
    title: 'Invitation not found',
  },
  pending: {
    description: '',
    title: 'Organization invitation',
  },
  rejected: {
    description: 'This invite was already rejected. Ask an administrator to send a new invite if needed.',
    title: 'Invitation unavailable',
  },
};

function getInviteRoleLabel(role: string | null) {
  if (!role) {
    return 'member';
  }

  return role;
}

export function InvitationPage() {
  const navigate = useNavigate();
  const { invitationId } = useParams();
  const [invitationEntry, setInvitationEntry] = useState<InvitationEntryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    async function loadInvitation() {
      if (!invitationId) {
        setError('Invitation not found.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const nextInvitationEntry = await getInvitationEntry(invitationId);

        if (!isCancelled) {
          setInvitationEntry(nextInvitationEntry);
        }
      } catch (caughtError) {
        if (!isCancelled) {
          setError(
            caughtError instanceof Error ? caughtError.message : 'Unable to load invitation.',
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    loadInvitation();

    return () => {
      isCancelled = true;
    };
  }, [invitationId]);

  const inviteTarget = invitationId ? `/invite/${invitationId}` : '/sign-in';
  const inviteEmail = invitationEntry?.invitation?.email;
  const signInLink = `/sign-in?redirectTo=${encodeURIComponent(inviteTarget)}${inviteEmail ? `&email=${encodeURIComponent(inviteEmail)}` : ''}`;
  const signUpLink = `/sign-up?redirectTo=${encodeURIComponent(inviteTarget)}${inviteEmail ? `&email=${encodeURIComponent(inviteEmail)}` : ''}`;

  const handleAccept = async () => {
    if (!invitationEntry?.invitation) {
      return;
    }

    setError(null);
    setStatus(null);
    setIsAccepting(true);

    try {
      await acceptOrganizationInvitation(invitationEntry.invitation.id);
      setStatus('Invitation accepted. Redirecting to the invited organization...');
      navigate('/');
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Unable to accept invitation.';
      setError(message);
    } finally {
      setIsAccepting(false);
    }
  };

  const handleSwitchAccount = async () => {
    await signOut();
    navigate(signInLink);
  };

  if (isLoading) {
    return (
      <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/20 sm:p-7">
        <p className="text-sm text-slate-300">Loading invitation...</p>
      </section>
    );
  }

  if (error || !invitationEntry) {
    return (
      <section className="rounded-3xl border border-rose-400/25 bg-rose-400/10 p-6 text-rose-100 shadow-xl shadow-slate-950/20 sm:p-7">
        <h2 className="text-2xl font-semibold">Invitation unavailable</h2>
        <p className="mt-3 text-sm leading-6 text-rose-100/90">{error || 'Unable to load invitation.'}</p>
      </section>
    );
  }

  const statusMessage = statusMessages[invitationEntry.status];

  if (invitationEntry.status !== 'pending' || !invitationEntry.invitation) {
    return (
      <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/20 sm:p-7">
        <p className="text-sm font-medium tracking-[0.2em] text-slate-400 uppercase">Invite link</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">{statusMessage.title}</h2>
        <p className="mt-4 text-sm leading-6 text-slate-300">{statusMessage.description}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/sign-in"
            className="rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
          >
            Sign in
          </Link>
          <Link
            to="/"
            className="rounded-xl border border-white/15 bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-slate-800"
          >
            Open app
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/20 sm:p-7">
      <p className="text-sm font-medium tracking-[0.2em] text-slate-400 uppercase">Invite link</p>
      <h2 className="mt-2 text-2xl font-semibold text-white">
        Join {invitationEntry.invitation.organizationName}
      </h2>
      <p className="mt-4 text-sm leading-6 text-slate-300">
        {invitationEntry.invitation.inviterEmail} invited <span className="font-medium text-white">{invitationEntry.invitation.email}</span> to join as{' '}
        <span className="font-medium text-white">{getInviteRoleLabel(invitationEntry.invitation.role)}</span>.
      </p>
      <p className="mt-2 text-sm text-slate-400">
        This link expires on {new Date(invitationEntry.invitation.expiresAt).toLocaleString()}.
      </p>

      {invitationEntry.action === 'ready-for-authentication' ? (
        <div className="mt-6 space-y-4">
          <p className="rounded-xl border border-sky-400/25 bg-sky-400/10 px-4 py-3 text-sm text-sky-100">
            Sign in with the invited account, or create it first if you have not joined Gatekeeper yet.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to={signInLink}
              className="rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
            >
              Sign in to continue
            </Link>
            <Link
              to={signUpLink}
              className="rounded-xl border border-white/15 bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-slate-800"
            >
              Create account
            </Link>
          </div>
        </div>
      ) : null}

      {invitationEntry.action === 'ready-to-accept' ? (
        <div className="mt-6 space-y-4">
          <p className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            You are signed in as the invited user. Accept the invite to switch into this organization now.
          </p>
          <button
            type="button"
            onClick={handleAccept}
            disabled={isAccepting}
            className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400"
          >
            {isAccepting ? 'Accepting invitation...' : 'Accept invitation'}
          </button>
        </div>
      ) : null}

      {invitationEntry.action === 'email-verification-required' ? (
        <p className="mt-6 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          Verify this account's email address before accepting the invitation.
        </p>
      ) : null}

      {invitationEntry.action === 'signed-in-as-different-user' ? (
        <div className="mt-6 space-y-4">
          <p className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            You are signed in as {invitationEntry.viewer.email}. Switch to {invitationEntry.invitation.email} to accept this invite.
          </p>
          <button
            type="button"
            onClick={handleSwitchAccount}
            className="rounded-xl bg-amber-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
          >
            Sign out and continue
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {status ? (
        <p className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
          {status}
        </p>
      ) : null}
    </section>
  );
}
