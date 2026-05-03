import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { acceptOrganizationInvitation } from '@/features/auth/api/auth-api';
import { signOut } from '@/features/auth/api/auth-client';
import {
  buildSignInLink,
  buildSignUpLink,
  buildVerifyEmailLink,
} from '@/features/auth/routing/auth-routing';
import type { InvitationEntryResponse } from '@/features/organizations/api/organization-api';
import { queryClient, trpc } from '@/lib/trpc';

const statusMessages: Record<
  InvitationEntryResponse['status'],
  {
    description: string;
    title: string;
  }
> = {
  accepted: {
    description: 'This invite has already been accepted.',
    title: 'Invitation already used',
  },
  canceled: {
    description: 'This invite was canceled by an administrator.',
    title: 'Invitation canceled',
  },
  expired: {
    description: 'This invite expired. Ask for a new one.',
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
    description: 'This invite was already rejected.',
    title: 'Invitation unavailable',
  },
};

function getInviteRoleLabel(role: string | null) {
  return role || 'member';
}

export function InvitationPage() {
  const navigate = useNavigate();
  const { invitationId } = useParams();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const invitationQuery = useQuery(
    trpc.organizations.invitationEntryState.queryOptions(
      { invitationId: invitationId ?? '' },
      { enabled: Boolean(invitationId) },
    ),
  );
  const acceptInvitationMutation = useMutation({
    mutationFn: acceptOrganizationInvitation,
    onMutate: () => {
      setError(null);
      setStatus(null);
    },
    onSuccess: () => {
      setStatus('Invitation accepted. Redirecting to the app...');
      void queryClient.invalidateQueries();
      navigate('/');
    },
    onError: (caughtError) => {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to accept invitation.');
    },
  });

  const invitationEntry = invitationQuery.data ?? null;
  const errorMessage = !invitationId
    ? 'Invitation not found.'
    : invitationQuery.error?.message || error;
  const isLoading = Boolean(invitationId) && invitationQuery.isPending;

  const inviteTarget = invitationId ? `/invite/${invitationId}` : '/sign-in';
  const inviteEmail = invitationEntry?.invitation?.email;
  const signInLink = buildSignInLink(inviteTarget, inviteEmail || undefined);
  const signUpLink = buildSignUpLink(inviteTarget, inviteEmail || undefined);
  const verifyEmailLink =
    inviteEmail && invitationId ? buildVerifyEmailLink(inviteEmail, inviteTarget) : '/verify-email';

  const handleAccept = async () => {
    if (!invitationEntry?.invitation) {
      return;
    }

    acceptInvitationMutation.mutate(invitationEntry.invitation.id);
  };

  const handleSwitchAccount = async () => {
    await signOut();
    navigate(signInLink);
  };

  if (isLoading) {
    return <p className="text-sm">Loading invitation...</p>;
  }

  if (errorMessage || !invitationEntry) {
    return (
      <div>
        <p className="text-xs uppercase">Invite link</p>
        <h2 className="mt-2 text-2xl font-bold">Invitation unavailable</h2>
        <p className="mt-4 border border-red-700 bg-red-100 p-3 text-sm">
          {errorMessage || 'Unable to load invitation.'}
        </p>
      </div>
    );
  }

  const statusMessage = statusMessages[invitationEntry.status];

  if (invitationEntry.status !== 'pending' || !invitationEntry.invitation) {
    return (
      <div>
        <p className="text-xs uppercase">Invite link</p>
        <h2 className="mt-2 text-2xl font-bold">{statusMessage.title}</h2>
        <p className="mt-4 text-sm">{statusMessage.description}</p>

        <div className="mt-5 space-y-2 text-sm">
          <p>
            <Link to="/sign-in" className="underline">
              Sign in
            </Link>
          </p>
          <p>
            <Link to="/" className="underline">
              Open app
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs uppercase">Invite link</p>
      <h2 className="mt-2 text-2xl font-bold">
        Join {invitationEntry.invitation.organizationName}
      </h2>
      <p className="mt-4 text-sm leading-6">
        {invitationEntry.invitation.inviterEmail} invited {invitationEntry.invitation.email} to join
        as {getInviteRoleLabel(invitationEntry.invitation.role)}.
      </p>
      <p className="mt-2 text-sm">
        Expires {new Date(invitationEntry.invitation.expiresAt).toLocaleString()}.
      </p>

      {invitationEntry.action === 'ready-for-authentication' ? (
        <div className="mt-5 space-y-2 text-sm">
          <p className="border border-black bg-stone-100 p-3">
            Sign in with the invited account, or create it first if it does not exist yet.
          </p>
          <p>
            <Link to={signInLink} className="underline">
              Sign in to continue
            </Link>
          </p>
          <p>
            <Link to={signUpLink} className="underline">
              Create account
            </Link>
          </p>
        </div>
      ) : null}

      {invitationEntry.action === 'ready-to-accept' ? (
        <div className="mt-5 space-y-3">
          <p className="border border-black bg-stone-100 p-3 text-sm">
            You are signed in as the invited user. Accept the invitation to switch into this
            organization now.
          </p>
          <button
            type="button"
            onClick={handleAccept}
            disabled={acceptInvitationMutation.isPending}
            className="border border-black bg-black px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {acceptInvitationMutation.isPending ? 'Accepting invitation...' : 'Accept invitation'}
          </button>
        </div>
      ) : null}

      {invitationEntry.action === 'email-verification-required' ? (
        <div className="mt-5 space-y-2 text-sm">
          <p className="border border-black bg-yellow-100 p-3">
            Verify this email address before you can accept the invitation.
          </p>
          <p>
            <Link to={verifyEmailLink} className="underline">
              Verify email
            </Link>
          </p>
        </div>
      ) : null}

      {invitationEntry.action === 'signed-in-as-different-user' ? (
        <div className="mt-5 space-y-3">
          <p className="border border-black bg-yellow-100 p-3 text-sm">
            You are signed in as {invitationEntry.viewer.email}. Switch to{' '}
            {invitationEntry.invitation.email} to accept this invite.
          </p>
          <button
            type="button"
            onClick={handleSwitchAccount}
            className="border border-black bg-black px-4 py-2 text-sm font-bold text-white"
          >
            Sign out and continue
          </button>
        </div>
      ) : null}

      {error ? <p className="mt-4 border border-red-700 bg-red-100 p-3 text-sm">{error}</p> : null}
      {status ? (
        <p className="mt-4 border border-green-700 bg-green-100 p-3 text-sm">{status}</p>
      ) : null}
    </div>
  );
}
