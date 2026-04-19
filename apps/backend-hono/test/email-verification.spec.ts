import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import app from '../src/index';
import { db } from '../src/db/client';
import { users } from '../src/db/schema';
import { auth } from '../src/lib/auth';

const authHeaders = {
  origin: 'http://localhost:5173',
  host: 'localhost:8787',
};
const verificationCallbackURL = 'http://localhost:8787/sign-in';
const mailpitSendUrl = 'http://127.0.0.1:8025/api/v1/send';

type CapturedEmail = {
  To: Array<{
    Email: string;
    Name?: string;
  }>;
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

async function signUpUserWithoutVerification(credentials: ReturnType<typeof createCredentials>) {
  await auth.api.signUpEmail({
    body: {
      ...credentials,
      callbackURL: verificationCallbackURL,
    },
    headers: authHeaders,
  });
}

async function signUpVerifiedUser(credentials: ReturnType<typeof createCredentials>) {
  await signUpUserWithoutVerification(credentials);
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

async function signInEmailRequest(credentials: ReturnType<typeof createCredentials>) {
  return app.request('http://example.com/api/auth/sign-in/email', {
    method: 'POST',
    headers: {
      ...authHeaders,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: credentials.email,
      password: credentials.password,
      rememberMe: false,
      callbackURL: verificationCallbackURL,
    }),
  });
}

async function resendVerificationEmail(email: string) {
  return app.request('http://example.com/api/auth/send-verification-email', {
    method: 'POST',
    headers: {
      ...authHeaders,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email,
      callbackURL: verificationCallbackURL,
    }),
  });
}

function getLatestVerificationUrl() {
  const latestEmail = sentEmails.at(-1);
  const verificationUrl = latestEmail?.Text.match(/https?:\/\/\S+/)?.[0];

  expect(verificationUrl).toBeTruthy();

  if (!verificationUrl) {
    throw new Error('Expected a verification URL in the latest email.');
  }

  return verificationUrl;
}

async function verifyLatestEmail() {
  return app.request(getLatestVerificationUrl(), {
    headers: authHeaders,
  });
}

async function getUserByEmail(email: string) {
  return (await db.select().from(users).where(eq(users.email, email)))[0] ?? null;
}

beforeEach(() => {
  sentEmails.length = 0;

  const originalFetch = globalThis.fetch;

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (url === mailpitSendUrl) {
      if (typeof init?.body !== 'string') {
        throw new Error('Expected Mailpit request body to be a JSON string.');
      }

      sentEmails.push(JSON.parse(init.body) as CapturedEmail);

      return new Response(null, { status: 200 });
    }

    return originalFetch(input, init);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('email verification', () => {
  describe('direct sign-up accounts', () => {
    it('blocks unverified users from signing in until they verify their email', async () => {
      const user = createCredentials('unverified-sign-in');

      await signUpUserWithoutVerification(user);

      expect(sentEmails).toHaveLength(1);

      const response = await signInEmailRequest(user);

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Email not verified',
      });
    });

    it('verifies users through Better Auth email links', async () => {
      const user = createCredentials('verify-direct-sign-up');

      await signUpUserWithoutVerification(user);

      const verificationResponse = await verifyLatestEmail();
      const verifiedUser = await getUserByEmail(user.email);
      const sessionHeaders = await signInUser(user);
      const session = await auth.api.getSession({ headers: sessionHeaders });

      expect(verificationResponse.status).toBe(302);
      expect(verificationResponse.headers.get('location')).toBe(verificationCallbackURL);
      expect(verifiedUser?.emailVerified).toBe(true);
      expect(session?.user.emailVerified).toBe(true);
    });

    it('resends verification emails for unverified accounts', async () => {
      const user = createCredentials('resend-verification');

      await signUpUserWithoutVerification(user);
      sentEmails.length = 0;

      const response = await resendVerificationEmail(user.email);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ status: true });
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0]?.To).toEqual([{ Email: user.email, Name: user.name }]);
      expect(getLatestVerificationUrl()).toContain('/verify-email?token=');
    });

    it('redirects invalid verification tokens with the Better Auth error code', async () => {
      const response = await app.request(
        `http://example.com/api/auth/verify-email?token=invalid-token&callbackURL=${encodeURIComponent(verificationCallbackURL)}`,
        {
          headers: authHeaders,
        },
      );

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(`${verificationCallbackURL}?error=INVALID_TOKEN`);
    });
  });

  describe('invite-based sign-up accounts', () => {
    it('requires invited users to verify their email before they can sign in', async () => {
      const owner = createCredentials('verification-invite-owner');

      await signUpVerifiedUser(owner);

      const ownerSessionHeaders = await signInUser(owner);
      const ownerOrganization = (await auth.api.listOrganizations({ headers: ownerSessionHeaders }))[0];

      expect(ownerOrganization?.id).toBeTruthy();

      if (!ownerOrganization?.id) {
        throw new Error('Expected a default organization for the invite owner.');
      }

      const invitedUser = createCredentials('verification-invitee');

      await auth.api.createInvitation({
        body: {
          email: invitedUser.email,
          organizationId: ownerOrganization.id,
          role: 'member',
        },
        headers: ownerSessionHeaders,
      });

      await signUpUserWithoutVerification(invitedUser);

      const blockedSignInResponse = await signInEmailRequest(invitedUser);

      expect(blockedSignInResponse.status).toBe(403);
      await expect(blockedSignInResponse.json()).resolves.toMatchObject({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Email not verified',
      });

      const verificationResponse = await verifyLatestEmail();
      const invitedUserSessionHeaders = await signInUser(invitedUser);
      const verifiedUser = await getUserByEmail(invitedUser.email);
      const invitedUserInvitations = await auth.api.listUserInvitations({
        headers: invitedUserSessionHeaders,
      });

      expect(verificationResponse.status).toBe(302);
      expect(verificationResponse.headers.get('location')).toBe(verificationCallbackURL);
      expect(verifiedUser?.emailVerified).toBe(true);
      expect(invitedUserInvitations).toHaveLength(1);
      expect(invitedUserInvitations[0]?.organizationId).toBe(ownerOrganization.id);
    });
  });
});
