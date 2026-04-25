import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Copy } from 'lucide-react';
import {
  createOrganizationInvitation,
  getControlApprovalPolicy,
  getMembershipResolution,
  updateControlApprovalPolicy,
  type ControlApprovalPolicy,
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

  const [policy, setPolicy] = useState<ControlApprovalPolicy | null>(null);
  const [policyEnabled, setPolicyEnabled] = useState(false);
  const [requiredApprovals, setRequiredApprovals] = useState('1');
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [policyStatus, setPolicyStatus] = useState<string | null>(null);
  const [isSubmittingPolicy, setIsSubmittingPolicy] = useState(false);

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
  const canManagePolicy = activeOrg?.role === 'owner' || activeOrg?.role === 'admin';

  useEffect(() => {
    let cancelled = false;

    async function loadPolicy() {
      if (!activeOrg) {
        setPolicy(null);
        return;
      }

      try {
        const response = await getControlApprovalPolicy(activeOrg.slug);
        if (cancelled) return;

        setPolicy(response.policy);
        setPolicyEnabled(response.policy.enabled);
        setRequiredApprovals(String(response.policy.requiredApprovals));
      } catch (caughtError) {
        if (cancelled) return;

        const rawMessage =
          caughtError instanceof Error
            ? caughtError.message
            : 'Unable to load Control Approval Policy.';
        setPolicyError(
          humanizeAuthError(null, rawMessage, 'Unable to load Control Approval Policy.'),
        );
      }
    }

    void loadPolicy();

    return () => {
      cancelled = true;
    };
  }, [activeOrg]);

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

  const handlePolicySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeOrg || !policy) return;

    setPolicyError(null);
    setPolicyStatus(null);

    const nextRequiredApprovals = policyEnabled ? Number(requiredApprovals) : 1;

    if (!Number.isInteger(nextRequiredApprovals) || nextRequiredApprovals < 1) {
      setPolicyError('Required approval count must be at least 1.');
      return;
    }

    if (policyEnabled && nextRequiredApprovals > policy.maxRequiredApprovals) {
      setPolicyError(
        'Required approval count cannot exceed eligible approvers other than the author.',
      );
      return;
    }

    setIsSubmittingPolicy(true);

    try {
      const response = await updateControlApprovalPolicy(activeOrg.slug, {
        enabled: policyEnabled,
        requiredApprovals: nextRequiredApprovals,
      });

      setPolicy(response.policy);
      setPolicyEnabled(response.policy.enabled);
      setRequiredApprovals(String(response.policy.requiredApprovals));
      setPolicyStatus('Control Approval Policy saved.');
    } catch (caughtError) {
      const rawMessage =
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to save Control Approval Policy.';
      setPolicyError(
        humanizeAuthError(null, rawMessage, 'Unable to save Control Approval Policy.'),
      );
    } finally {
      setIsSubmittingPolicy(false);
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
          <h2 className="text-lg font-medium">Control Approval Policy</h2>
          <p className="text-sm text-muted-foreground">
            Require approval before Organization owners and admins publish Controls or Control
            updates.
          </p>
        </div>

        {!canManagePolicy && activeOrg ? (
          <Alert>
            <AlertCircle />
            <AlertTitle>Read-only policy</AlertTitle>
            <AlertDescription>
              Only Organization owners and admins can edit Control Approval Policy.
            </AlertDescription>
          </Alert>
        ) : null}

        <form className="space-y-5" onSubmit={handlePolicySubmit}>
          <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <Label htmlFor="control-approval-enabled">Require approval to publish Controls</Label>
              <p className="text-sm text-muted-foreground">
                When enabled, publish actions need approval from eligible Organization owners/admins
                other than the author.
              </p>
            </div>
            <input
              id="control-approval-enabled"
              type="checkbox"
              className="size-5"
              checked={policyEnabled}
              onChange={(event) => {
                setPolicyEnabled(event.target.checked);
                if (event.target.checked && requiredApprovals === '') setRequiredApprovals('1');
              }}
              disabled={!activeOrg || !canManagePolicy || !policy || isSubmittingPolicy}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="required-approvals">Required approval count</Label>
            <Input
              id="required-approvals"
              type="number"
              min={1}
              max={policy?.maxRequiredApprovals || 1}
              value={requiredApprovals}
              onChange={(event) => setRequiredApprovals(event.target.value)}
              disabled={!activeOrg || !canManagePolicy || !policyEnabled || isSubmittingPolicy}
            />
            <p className="text-sm text-muted-foreground">
              {policy
                ? `Maximum currently allowed: ${policy.maxRequiredApprovals}. Add more Organization owners/admins before requiring more approvals.`
                : 'Loading approval limits...'}
            </p>
          </div>

          {policyError ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Couldn’t save policy</AlertTitle>
              <AlertDescription>{policyError}</AlertDescription>
            </Alert>
          ) : null}

          {policyStatus ? (
            <Alert>
              <CheckCircle2 />
              <AlertTitle>{policyStatus}</AlertTitle>
            </Alert>
          ) : null}

          <div>
            <Button
              type="submit"
              disabled={!activeOrg || !canManagePolicy || !policy || isSubmittingPolicy}
            >
              {isSubmittingPolicy ? 'Saving...' : 'Save policy'}
            </Button>
          </div>
        </form>
      </section>

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
