import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import app from '../src/index';
import { db } from '../src/db/client';
import { invitations, sessions, users } from '../src/db/schema';
import { auth } from '../src/lib/auth';
import type { MembershipResolutionResponse } from '../src/lib/auth-organization';

const authHeaders = {
  origin: 'http://localhost:5173',
  host: 'localhost:8787',
};
const verificationCallbackURL = 'http://localhost:8787/sign-in';
const mailpitSendUrl = 'http://127.0.0.1:8025/api/v1/send';

type CapturedEmail = {
  Subject: string;
  Text: string;
};

const sentEmails: CapturedEmail[] = [];

function createCredentials(prefix: string) {
  const token = crypto.randomUUID();

  return {
    name: `${prefix} user`,
    email: `${prefix}-${token}@example.com`,
    password: `Password-${token}`,
  };
}

async function signUpUser(credentials: ReturnType<typeof createCredentials>) {
  await auth.api.signUpEmail({
    body: {
      ...credentials,
      callbackURL: verificationCallbackURL,
    },
    headers: authHeaders,
  });

  await db.update(users).set({ emailVerified: true }).where(eq(users.email, credentials.email));
}

async function signInUser(credentials: ReturnType<typeof createCredentials>) {
  const result = await auth.api.signInEmail({
    body: {
      email: credentials.email,
      password: credentials.password,
    },
    headers: authHeaders,
    returnHeaders: true,
  });

  const sessionCookie = result.headers.get('set-cookie');

  expect(sessionCookie).toBeTruthy();

  if (!sessionCookie) {
    throw new Error('Expected Better Auth to return a session cookie.');
  }

  const cookie = sessionCookie.split(';', 1)[0] ?? sessionCookie;

  return new Headers({
    ...authHeaders,
    cookie,
  });
}

async function createOrganization(
  headers: Headers,
  namePrefix: string,
  keepCurrentActiveOrganization = true,
) {
  const suffix = crypto.randomUUID().slice(0, 8);

  return auth.api.createOrganization({
    body: {
      keepCurrentActiveOrganization,
      name: `${namePrefix} Organization`,
      slug: `${namePrefix}-${suffix}`,
    },
    headers,
  });
}

async function getMembershipResolution(headers: Headers) {
  const response = await app.request('http://example.com/api/auth/membership-resolution', {
    headers,
  });

  expect(response.status).toBe(200);

  return (await response.json()) as MembershipResolutionResponse;
}

async function getInvitationEntry(invitationId: string, headers?: Headers) {
  const response = await app.request(`http://example.com/api/auth/invitations/${invitationId}`, {
    headers,
  });

  return {
    body: (await response.json()) as {
      action: string;
      invitation: {
        email: string;
        id: string;
        organizationId: string;
        organizationName: string;
        role: string | null;
      } | null;
      status: string;
      viewer: {
        email: string | null;
        emailVerified: boolean | null;
        isAuthenticated: boolean;
      };
    },
    status: response.status,
  };
}

function getLatestInviteLink() {
  const latestEmail = sentEmails.at(-1);
  const inviteLink = latestEmail?.Text.match(/https?:\/\/\S+/)?.[0];

  expect(inviteLink).toBeTruthy();

  if (!inviteLink) {
    throw new Error('Expected an invitation URL in the latest email.');
  }

  return inviteLink;
}

beforeEach(() => {
  sentEmails.length = 0;

  const originalFetch = globalThis.fetch;

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (url === mailpitSendUrl) {
      if (typeof init?.body !== 'string') {
        throw new Error('Expected Mailpit request body to be a JSON string.');
      }

      const parsedEmail = JSON.parse(init.body) as {
        Subject: string;
        Text: string;
      };

      sentEmails.push(parsedEmail);
      return new Response(null, { status: 200 });
    }

    return originalFetch(input, init);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('organization membership resolution', () => {
  describe('sign-up outcomes', () => {
    it('creates a default organization on direct sign-up', async () => {
      const user = createCredentials('direct-sign-up');

      await signUpUser(user);

      const sessionHeaders = await signInUser(user);
      const organizations = await auth.api.listOrganizations({ headers: sessionHeaders });
      const session = await auth.api.getSession({ headers: sessionHeaders });

      expect(organizations).toHaveLength(1);
      expect(session?.session.activeOrganizationId).toBe(organizations[0]?.id);
    });

    it('skips default organization creation when the user already has a pending invite', async () => {
      const owner = createCredentials('owner');

      await signUpUser(owner);

      const ownerSessionHeaders = await signInUser(owner);
      const ownerOrganizations = await auth.api.listOrganizations({ headers: ownerSessionHeaders });
      const organizationId = ownerOrganizations[0]?.id;

      expect(organizationId).toBeTruthy();

      if (!organizationId) {
        throw new Error('Expected a default organization for the owner.');
      }

      const invitedUser = createCredentials('invitee');

      await auth.api.createInvitation({
        body: {
          email: invitedUser.email,
          role: 'member',
          organizationId,
        },
        headers: ownerSessionHeaders,
      });

      await signUpUser(invitedUser);

      const invitedUserSessionHeaders = await signInUser(invitedUser);
      const invitedUserOrganizations = await auth.api.listOrganizations({
        headers: invitedUserSessionHeaders,
      });
      const invitedUserInvitations = await auth.api.listUserInvitations({
        headers: invitedUserSessionHeaders,
      });
      const invitedUserSession = await auth.api.getSession({ headers: invitedUserSessionHeaders });
      const membershipResolution = await getMembershipResolution(invitedUserSessionHeaders);

      expect(invitedUserOrganizations).toHaveLength(0);
      expect(invitedUserInvitations).toHaveLength(1);
      expect(invitedUserInvitations[0]?.organizationId).toBe(organizationId);
      expect(invitedUserSession?.session.activeOrganizationId).toBeNull();
      expect(membershipResolution).toMatchObject({
        activeOrganizationId: null,
        canCreateOrganization: true,
        organizations: [],
        pendingInvites: [
          {
            organizationId,
          },
        ],
        status: 'needs-organization-choice',
      });
    });
  });

  describe('invitation issuance', () => {
    it('creates an invite in the active organization context and sends an invite link', async () => {
      const owner = createCredentials('invite-admin');

      await signUpUser(owner);

      const ownerSessionHeaders = await signInUser(owner);
      const secondOrganization = await createOrganization(
        ownerSessionHeaders,
        'invite-target',
        false,
      );

      expect(secondOrganization.id).toBeTruthy();

      await auth.api.setActiveOrganization({
        body: {
          organizationId: secondOrganization.id,
        },
        headers: ownerSessionHeaders,
      });

      sentEmails.length = 0;

      const invitation = await auth.api.createInvitation({
        body: {
          email: createCredentials('active-org-invitee').email,
          role: 'member',
        },
        headers: ownerSessionHeaders,
      });

      expect(invitation.organizationId).toBe(secondOrganization.id);
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0]?.Subject).toBe(`Join ${secondOrganization.name} on Gatekeeper`);
      expect(getLatestInviteLink()).toContain(`/invite/${invitation.id}`);
    });
  });

  describe('membership resolution state', () => {
    it('resolves and persists the fallback active organization when the current session is missing one', async () => {
      const user = createCredentials('membership-fallback');

      await signUpUser(user);

      const sessionHeaders = await signInUser(user);
      const defaultOrganization = (
        await auth.api.listOrganizations({ headers: sessionHeaders })
      )[0];
      const secondOrganization = await createOrganization(sessionHeaders, 'second-membership');
      const session = await auth.api.getSession({ headers: sessionHeaders });

      expect(defaultOrganization?.id).toBeTruthy();
      expect(secondOrganization?.id).toBeTruthy();
      expect(session?.session.id).toBeTruthy();

      if (!defaultOrganization?.id || !secondOrganization?.id || !session?.session.id) {
        throw new Error('Expected memberships and an active session for the fallback test.');
      }

      await db
        .update(sessions)
        .set({ activeOrganizationId: null })
        .where(eq(sessions.id, session.session.id));

      const membershipResolution = await getMembershipResolution(sessionHeaders);
      const refreshedSession = await auth.api.getSession({ headers: sessionHeaders });

      expect(membershipResolution).toMatchObject({
        activeOrganizationId: defaultOrganization.id,
        canCreateOrganization: true,
        organizations: [{ id: defaultOrganization.id }, { id: secondOrganization.id }],
        pendingInvites: [],
        status: 'active-organization',
      });
      expect(refreshedSession?.session.activeOrganizationId).toBe(defaultOrganization.id);
    });

    it('keeps a valid active organization and still returns pending invites', async () => {
      const user = createCredentials('membership-active');

      await signUpUser(user);

      const userSessionHeaders = await signInUser(user);
      const defaultOrganization = (
        await auth.api.listOrganizations({ headers: userSessionHeaders })
      )[0];
      const secondOrganization = await createOrganization(userSessionHeaders, 'active-membership');

      expect(defaultOrganization?.id).toBeTruthy();
      expect(secondOrganization?.id).toBeTruthy();

      if (!defaultOrganization?.id || !secondOrganization?.id) {
        throw new Error('Expected two organizations for the active membership test.');
      }

      await auth.api.setActiveOrganization({
        body: {
          organizationId: secondOrganization.id,
        },
        headers: userSessionHeaders,
      });

      const inviter = createCredentials('membership-inviter');

      await signUpUser(inviter);

      const inviterSessionHeaders = await signInUser(inviter);
      const inviterOrganization = (
        await auth.api.listOrganizations({ headers: inviterSessionHeaders })
      )[0];

      expect(inviterOrganization?.id).toBeTruthy();

      if (!inviterOrganization?.id) {
        throw new Error('Expected a default organization for the inviter.');
      }

      await auth.api.createInvitation({
        body: {
          email: user.email,
          organizationId: inviterOrganization.id,
          role: 'member',
        },
        headers: inviterSessionHeaders,
      });

      const membershipResolution = await getMembershipResolution(userSessionHeaders);
      const session = await auth.api.getSession({ headers: userSessionHeaders });

      expect(membershipResolution).toMatchObject({
        activeOrganizationId: secondOrganization.id,
        canCreateOrganization: true,
        organizations: [{ id: secondOrganization.id }, { id: defaultOrganization.id }],
        pendingInvites: [
          {
            organizationId: inviterOrganization.id,
          },
        ],
        status: 'active-organization',
      });
      expect(session?.session.activeOrganizationId).toBe(secondOrganization.id);
    });

    it('ignores expired invites when resolving membership status', async () => {
      const owner = createCredentials('expired-invite-owner');

      await signUpUser(owner);

      const ownerSessionHeaders = await signInUser(owner);
      const ownerOrganization = (
        await auth.api.listOrganizations({ headers: ownerSessionHeaders })
      )[0];

      expect(ownerOrganization?.id).toBeTruthy();

      if (!ownerOrganization?.id) {
        throw new Error('Expected a default organization for the expired invite owner.');
      }

      const invitedUser = createCredentials('expired-invite-user');

      const invitation = await auth.api.createInvitation({
        body: {
          email: invitedUser.email,
          organizationId: ownerOrganization.id,
          role: 'member',
        },
        headers: ownerSessionHeaders,
      });

      await signUpUser(invitedUser);

      await db
        .update(invitations)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .where(eq(invitations.id, invitation.id));

      const invitedUserSessionHeaders = await signInUser(invitedUser);
      const membershipResolution = await getMembershipResolution(invitedUserSessionHeaders);
      const session = await auth.api.getSession({ headers: invitedUserSessionHeaders });

      expect(membershipResolution).toMatchObject({
        activeOrganizationId: null,
        canCreateOrganization: true,
        organizations: [],
        pendingInvites: [],
        status: 'needs-organization-creation',
      });
      expect(session?.session.activeOrganizationId).toBeNull();
    });
  });

  describe('invitation entry state', () => {
    it('returns a pending invite state for unauthenticated invite links', async () => {
      const owner = createCredentials('entry-owner');

      await signUpUser(owner);

      const ownerSessionHeaders = await signInUser(owner);
      const ownerOrganization = (
        await auth.api.listOrganizations({ headers: ownerSessionHeaders })
      )[0];

      expect(ownerOrganization?.id).toBeTruthy();

      if (!ownerOrganization?.id) {
        throw new Error('Expected a default organization for the invite entry owner.');
      }

      const invitedUser = createCredentials('entry-user');
      const invitation = await auth.api.createInvitation({
        body: {
          email: invitedUser.email,
          organizationId: ownerOrganization.id,
          role: 'member',
        },
        headers: ownerSessionHeaders,
      });

      const invitationEntry = await getInvitationEntry(invitation.id);

      expect(invitationEntry.status).toBe(200);
      expect(invitationEntry.body).toMatchObject({
        action: 'ready-for-authentication',
        invitation: {
          email: invitedUser.email,
          id: invitation.id,
          organizationId: ownerOrganization.id,
          organizationName: ownerOrganization.name,
          role: 'member',
        },
        status: 'pending',
        viewer: {
          email: null,
          emailVerified: null,
          isAuthenticated: false,
        },
      });
    });

    it('returns ready-to-accept for the authenticated invite recipient', async () => {
      const owner = createCredentials('entry-ready-owner');

      await signUpUser(owner);

      const ownerSessionHeaders = await signInUser(owner);
      const ownerOrganization = (
        await auth.api.listOrganizations({ headers: ownerSessionHeaders })
      )[0];

      expect(ownerOrganization?.id).toBeTruthy();

      if (!ownerOrganization?.id) {
        throw new Error('Expected a default organization for the ready-to-accept owner.');
      }

      const invitedUser = createCredentials('entry-ready-user');
      const invitation = await auth.api.createInvitation({
        body: {
          email: invitedUser.email,
          organizationId: ownerOrganization.id,
          role: 'member',
        },
        headers: ownerSessionHeaders,
      });

      await signUpUser(invitedUser);

      const invitedUserSessionHeaders = await signInUser(invitedUser);
      const invitationEntry = await getInvitationEntry(invitation.id, invitedUserSessionHeaders);

      expect(invitationEntry.status).toBe(200);
      expect(invitationEntry.body).toMatchObject({
        action: 'ready-to-accept',
        status: 'pending',
        viewer: {
          email: invitedUser.email,
          emailVerified: true,
          isAuthenticated: true,
        },
      });
    });

    it('returns an expired state for expired invite links', async () => {
      const owner = createCredentials('entry-expired-owner');

      await signUpUser(owner);

      const ownerSessionHeaders = await signInUser(owner);
      const ownerOrganization = (
        await auth.api.listOrganizations({ headers: ownerSessionHeaders })
      )[0];

      expect(ownerOrganization?.id).toBeTruthy();

      if (!ownerOrganization?.id) {
        throw new Error('Expected a default organization for the expired invite entry owner.');
      }

      const invitation = await auth.api.createInvitation({
        body: {
          email: createCredentials('entry-expired-user').email,
          organizationId: ownerOrganization.id,
          role: 'member',
        },
        headers: ownerSessionHeaders,
      });

      await db
        .update(invitations)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .where(eq(invitations.id, invitation.id));

      const invitationEntry = await getInvitationEntry(invitation.id);

      expect(invitationEntry.status).toBe(200);
      expect(invitationEntry.body).toMatchObject({
        action: 'unavailable',
        status: 'expired',
      });
    });

    it('returns an accepted state for already used invite links', async () => {
      const owner = createCredentials('entry-accepted-owner');

      await signUpUser(owner);

      const ownerSessionHeaders = await signInUser(owner);
      const ownerOrganization = (
        await auth.api.listOrganizations({ headers: ownerSessionHeaders })
      )[0];

      expect(ownerOrganization?.id).toBeTruthy();

      if (!ownerOrganization?.id) {
        throw new Error('Expected a default organization for the accepted invite entry owner.');
      }

      const invitedUser = createCredentials('entry-accepted-user');
      const invitation = await auth.api.createInvitation({
        body: {
          email: invitedUser.email,
          organizationId: ownerOrganization.id,
          role: 'member',
        },
        headers: ownerSessionHeaders,
      });

      await signUpUser(invitedUser);

      const invitedUserSessionHeaders = await signInUser(invitedUser);
      await auth.api.acceptInvitation({
        body: {
          invitationId: invitation.id,
        },
        headers: invitedUserSessionHeaders,
      });

      const invitationEntry = await getInvitationEntry(invitation.id);

      expect(invitationEntry.status).toBe(200);
      expect(invitationEntry.body).toMatchObject({
        action: 'unavailable',
        status: 'accepted',
      });
    });

    it('returns a canceled state for canceled invite links', async () => {
      const owner = createCredentials('entry-canceled-owner');

      await signUpUser(owner);

      const ownerSessionHeaders = await signInUser(owner);
      const ownerOrganization = (
        await auth.api.listOrganizations({ headers: ownerSessionHeaders })
      )[0];

      expect(ownerOrganization?.id).toBeTruthy();

      if (!ownerOrganization?.id) {
        throw new Error('Expected a default organization for the canceled invite entry owner.');
      }

      const invitation = await auth.api.createInvitation({
        body: {
          email: createCredentials('entry-canceled-user').email,
          organizationId: ownerOrganization.id,
          role: 'member',
        },
        headers: ownerSessionHeaders,
      });

      await auth.api.cancelInvitation({
        body: {
          invitationId: invitation.id,
        },
        headers: ownerSessionHeaders,
      });

      const invitationEntry = await getInvitationEntry(invitation.id);

      expect(invitationEntry.status).toBe(200);
      expect(invitationEntry.body).toMatchObject({
        action: 'unavailable',
        status: 'canceled',
      });
    });

    it('returns not found for invalid invite links', async () => {
      const invitationEntry = await getInvitationEntry(crypto.randomUUID());

      expect(invitationEntry.status).toBe(404);
      expect(invitationEntry.body).toMatchObject({
        action: 'unavailable',
        invitation: null,
        status: 'invalid',
      });
    });
  });

  describe('invitation acceptance', () => {
    it('activates the invited organization immediately after invite acceptance', async () => {
      const owner = createCredentials('accept-owner');

      await signUpUser(owner);

      const ownerSessionHeaders = await signInUser(owner);
      const ownerOrganization = (
        await auth.api.listOrganizations({ headers: ownerSessionHeaders })
      )[0];

      expect(ownerOrganization?.id).toBeTruthy();

      if (!ownerOrganization?.id) {
        throw new Error('Expected a default organization for the invite owner.');
      }

      const invitedUser = createCredentials('accept-user');

      await signUpUser(invitedUser);

      await auth.api.createInvitation({
        body: {
          email: invitedUser.email,
          organizationId: ownerOrganization.id,
          role: 'member',
        },
        headers: ownerSessionHeaders,
      });

      const invitedUserSessionHeaders = await signInUser(invitedUser);
      const invitedUserDefaultOrganization = (
        await auth.api.listOrganizations({
          headers: invitedUserSessionHeaders,
        })
      )[0];
      const userInvitations = await auth.api.listUserInvitations({
        headers: invitedUserSessionHeaders,
      });
      const invitationId = userInvitations[0]?.id;

      expect(invitedUserDefaultOrganization?.id).toBeTruthy();
      expect(invitationId).toBeTruthy();

      if (!invitedUserDefaultOrganization?.id || !invitationId) {
        throw new Error('Expected a default organization and a pending invitation.');
      }

      await auth.api.acceptInvitation({
        body: {
          invitationId,
        },
        headers: invitedUserSessionHeaders,
      });

      const membershipResolution = await getMembershipResolution(invitedUserSessionHeaders);
      const refreshedSession = await auth.api.getSession({ headers: invitedUserSessionHeaders });

      expect(membershipResolution).toMatchObject({
        activeOrganizationId: ownerOrganization.id,
        canCreateOrganization: true,
        organizations: [{ id: ownerOrganization.id }, { id: invitedUserDefaultOrganization.id }],
        pendingInvites: [],
        status: 'active-organization',
      });
      expect(refreshedSession?.session.activeOrganizationId).toBe(ownerOrganization.id);
    });
  });
});
