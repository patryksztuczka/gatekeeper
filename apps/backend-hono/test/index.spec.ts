import { SELF } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import app from '../src/index';
import { db } from '../src/db/client';
import { users } from '../src/db/schema';
import { auth } from '../src/lib/auth';

const authHeaders = {
  origin: 'http://localhost:5173',
  host: 'localhost:8787',
};

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
    body: credentials,
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

describe('Hello Hono worker', () => {
  it('responds with Hello Hono! (unit style)', async () => {
    const response = await app.request('http://example.com');

    expect(await response.text()).toBe('Hello Hono!');
  });

  it('responds with Hello Hono! (integration style)', async () => {
    const response = await SELF.fetch('https://example.com');

    expect(await response.text()).toBe('Hello Hono!');
  });

  it('mounts Better Auth routes', async () => {
    const response = await SELF.fetch('https://example.com/api/auth/get-session');

    expect(response.status).toBe(200);
  });

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

    expect(invitedUserOrganizations).toHaveLength(0);
    expect(invitedUserInvitations).toHaveLength(1);
    expect(invitedUserInvitations[0]?.organizationId).toBe(organizationId);
    expect(invitedUserSession?.session.activeOrganizationId).toBeNull();
  });
});
