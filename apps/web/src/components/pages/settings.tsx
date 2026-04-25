import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Copy } from 'lucide-react';
import {
  createOrganizationInvitation,
  getMembershipResolution,
  type MembershipResolutionResponse,
} from '../../features/auth/auth-api';
import { humanizeAuthError } from '../../features/auth/auth-errors';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

const INVITE_ROLES: Array<{ value: string; label: string }> = [
  { value: 'member', label: 'Member' },
  { value: 'admin', label: 'Admin' },
];

export function SettingsPage() {
  const [resolution, setResolution] = useState<MembershipResolutionResponse | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isSubmittingInvite, setIsSubmittingInvite] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadResolution() {
      try {
        const next = await getMembershipResolution();
        if (!cancelled) setResolution(next);
      } catch {
        if (!cancelled) setResolution(null);
      }
    }

    void loadResolution();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeOrg =
    resolution?.organizations.find((org) => org.id === resolution.activeOrganizationId) ?? null;

  const handleInviteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInviteError(null);
    setInviteLink(null);
    setCopied(false);
    setIsSubmittingInvite(true);

    try {
      const invitation = await createOrganizationInvitation({
        email: inviteEmail,
        role: inviteRole,
      });
      setInviteLink(`${window.location.origin}/invite/${invitation.id}`);
      setInviteEmail('');
    } catch (caughtError) {
      const rawMessage =
        caughtError instanceof Error ? caughtError.message : 'Unable to create invitation.';
      setInviteError(humanizeAuthError(null, rawMessage, 'Unable to create invitation.'));
    } finally {
      setIsSubmittingInvite(false);
    }
  };

  const handleCopyLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard may be unavailable; user can select the link manually
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your organization and the people who have access to it.
        </p>
      </header>

      <Separator />

      <section className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-lg font-medium">Invite members</h2>
          <p className="text-sm text-muted-foreground">
            {activeOrg
              ? `Send an invitation to join ${activeOrg.name}.`
              : 'Select or create an organization before sending invitations.'}
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleInviteSubmit}>
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              autoComplete="email"
              disabled={!activeOrg || isSubmittingInvite}
              placeholder="teammate@company.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Role</Label>
            <div className="flex gap-2">
              {INVITE_ROLES.map((role) => (
                <Button
                  key={role.value}
                  type="button"
                  variant={inviteRole === role.value ? 'default' : 'outline'}
                  onClick={() => setInviteRole(role.value)}
                  disabled={!activeOrg || isSubmittingInvite}
                >
                  {role.label}
                </Button>
              ))}
            </div>
          </div>

          {inviteError ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Couldn’t send invite</AlertTitle>
              <AlertDescription>{inviteError}</AlertDescription>
            </Alert>
          ) : null}

          {inviteLink ? (
            <Alert>
              <CheckCircle2 />
              <AlertTitle>Invitation created</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>Share this link with the invitee.</p>
                <div className="flex items-stretch gap-2">
                  <Input value={inviteLink} readOnly className="flex-1 font-mono text-xs" />
                  <Button type="button" variant="outline" onClick={() => void handleCopyLink()}>
                    <Copy />
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}

          <div>
            <Button type="submit" disabled={!activeOrg || isSubmittingInvite}>
              {isSubmittingInvite ? 'Sending...' : 'Send invite'}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
