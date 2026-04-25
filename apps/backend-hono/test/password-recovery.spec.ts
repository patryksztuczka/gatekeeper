import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import app from '../src/index';
import { db } from '../src/db/client';
import { users, verifications } from '../src/db/schema';
import { auth } from '../src/lib/auth';

const authHeaders = {
  origin: 'http://localhost:5173',
  host: 'localhost:8787',
};
const resetCallbackURL = 'http://localhost:8787/reset-password';
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
      callbackURL: 'http://localhost:8787/sign-in',
    },
    headers: authHeaders,
  });
}

async function signUpVerifiedUser(credentials: ReturnType<typeof createCredentials>) {
  await signUpUserWithoutVerification(credentials);
  await db.update(users).set({ emailVerified: true }).where(eq(users.email, credentials.email));
}

async function signInUser(credentials: { email: string; password: string }) {
  const result = await auth.api.signInEmail({
    body: credentials,
    headers: authHeaders,
    returnHeaders: true,
  });

  const sessionCookie = result.headers.get('set-cookie');

  expect(sessionCookie).toBeTruthy();

  if (!sessionCookie) {
    throw new Error('Expected Better Auth to return a session cookie.');
  }

  return result;
}

async function signInEmailRequest(credentials: { email: string; password: string }) {
  return app.request('http://example.com/api/auth/sign-in/email', {
    method: 'POST',
    headers: {
      ...authHeaders,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      ...credentials,
      rememberMe: false,
      callbackURL: 'http://localhost:8787/sign-in',
    }),
  });
}

async function requestPasswordReset(email: string) {
  return app.request('http://example.com/api/auth/request-password-reset', {
    method: 'POST',
    headers: {
      ...authHeaders,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email,
      redirectTo: resetCallbackURL,
    }),
  });
}

function getLatestResetUrl() {
  const latestEmail = sentEmails.at(-1);
  const resetUrl = latestEmail?.Text.match(/https?:\/\/\S+/)?.[0];

  expect(resetUrl).toBeTruthy();

  if (!resetUrl) {
    throw new Error('Expected a reset URL in the latest email.');
  }

  return resetUrl;
}

function getResetTokenFromLatestEmail() {
  const resetUrl = new URL(getLatestResetUrl());
  const token = resetUrl.pathname.split('/').at(-1);

  expect(token).toBeTruthy();

  if (!token) {
    throw new Error('Expected a reset token in the latest reset URL.');
  }

  return token;
}

async function visitLatestResetLink() {
  return app.request(getLatestResetUrl(), {
    headers: authHeaders,
  });
}

async function resetPassword(token: string, newPassword: string) {
  return app.request('http://example.com/api/auth/reset-password', {
    method: 'POST',
    headers: {
      ...authHeaders,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      token,
      newPassword,
    }),
  });
}

async function getUserByEmail(email: string) {
  return (await db.select().from(users).where(eq(users.email, email)))[0] ?? null;
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

      sentEmails.push(JSON.parse(init.body) as CapturedEmail);

      return new Response(null, { status: 200 });
    }

    return originalFetch(input, init);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('password recovery', () => {
  describe('reset request', () => {
    it('sends a reset email with a Better Auth callback link', async () => {
      const user = createCredentials('request-password-reset');

      await signUpVerifiedUser(user);
      sentEmails.length = 0;

      const response = await requestPasswordReset(user.email);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        status: true,
        message: 'If this email exists in our system, check your email for the reset link',
      });
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0]?.To).toEqual([{ Email: user.email, Name: user.name }]);
      expect(getLatestResetUrl()).toContain('/reset-password/');
      expect(getLatestResetUrl()).toContain(`callbackURL=${encodeURIComponent(resetCallbackURL)}`);
    });

    it('returns the same generic success for unknown emails', async () => {
      const response = await requestPasswordReset('missing-user@example.com');

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        status: true,
        message: 'If this email exists in our system, check your email for the reset link',
      });
      expect(sentEmails).toHaveLength(0);
    });
  });

  describe('reset callback', () => {
    it('redirects valid reset links to the app callback with the token', async () => {
      const user = createCredentials('reset-callback');

      await signUpVerifiedUser(user);
      sentEmails.length = 0;

      await requestPasswordReset(user.email);

      const response = await visitLatestResetLink();
      const token = getResetTokenFromLatestEmail();

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(`${resetCallbackURL}?token=${token}`);
    });

    it('redirects invalid reset links with INVALID_TOKEN', async () => {
      const response = await app.request(
        `http://example.com/api/auth/reset-password/invalid-token?callbackURL=${encodeURIComponent(resetCallbackURL)}`,
        {
          headers: authHeaders,
        },
      );

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(`${resetCallbackURL}?error=INVALID_TOKEN`);
    });

    it('redirects expired reset links with INVALID_TOKEN', async () => {
      const user = createCredentials('expired-reset-link');

      await signUpVerifiedUser(user);
      sentEmails.length = 0;

      await requestPasswordReset(user.email);

      const token = getResetTokenFromLatestEmail();

      await db
        .update(verifications)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .where(eq(verifications.identifier, `reset-password:${token}`));

      const response = await visitLatestResetLink();

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(`${resetCallbackURL}?error=INVALID_TOKEN`);
    });
  });

  describe('reset completion', () => {
    it('lets verified users reset their password and sign in with the new one', async () => {
      const user = createCredentials('verified-reset-complete');
      const newPassword = `${user.password}-updated`;

      await signUpVerifiedUser(user);
      sentEmails.length = 0;

      await requestPasswordReset(user.email);

      const resetResponse = await resetPassword(getResetTokenFromLatestEmail(), newPassword);
      const oldPasswordSignIn = await signInEmailRequest({
        email: user.email,
        password: user.password,
      });
      const newPasswordSignIn = await signInUser({
        email: user.email,
        password: newPassword,
      });

      expect(resetResponse.status).toBe(200);
      await expect(resetResponse.json()).resolves.toMatchObject({ status: true });
      expect(oldPasswordSignIn.status).toBe(401);
      await expect(oldPasswordSignIn.json()).resolves.toMatchObject({
        code: 'INVALID_EMAIL_OR_PASSWORD',
        message: 'Invalid email or password',
      });
      expect(newPasswordSignIn.response.user.email).toBe(user.email);
      expect(newPasswordSignIn.response.user.emailVerified).toBe(true);
    });

    it('lets unverified users reset their password without bypassing email verification', async () => {
      const user = createCredentials('unverified-reset-complete');
      const newPassword = `${user.password}-updated`;

      await signUpUserWithoutVerification(user);
      sentEmails.length = 0;

      await requestPasswordReset(user.email);

      const resetResponse = await resetPassword(getResetTokenFromLatestEmail(), newPassword);
      const updatedUser = await getUserByEmail(user.email);
      const signInResponse = await signInEmailRequest({
        email: user.email,
        password: newPassword,
      });

      expect(resetResponse.status).toBe(200);
      await expect(resetResponse.json()).resolves.toMatchObject({ status: true });
      expect(updatedUser?.emailVerified).toBe(false);
      expect(signInResponse.status).toBe(403);
      await expect(signInResponse.json()).resolves.toMatchObject({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Email not verified',
      });
    });

    it('rejects invalid reset tokens during password submission', async () => {
      const response = await resetPassword('invalid-token', 'Password-updated');

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        code: 'INVALID_TOKEN',
        message: 'Invalid token',
      });
    });
  });
});
