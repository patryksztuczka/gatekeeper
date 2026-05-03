import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '../src/db/client';
import { organizations, users } from '../src/db/schema';
import { auth } from '../src/lib/auth';
import { callTRPC } from './trpc-test-utils';

const authHeaders = {
  origin: 'http://localhost:5173',
  host: 'localhost:8787',
};
const verificationCallbackURL = 'http://localhost:8787/sign-in';
const mailpitSendUrl = 'http://127.0.0.1:8025/api/v1/send';

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

async function createSignedInOwner(prefix: string) {
  const credentials = createCredentials(prefix);

  await signUpUser(credentials);

  const headers = await signInUser(credentials);
  const organization = (await auth.api.listOrganizations({ headers }))[0];

  expect(organization?.id).toBeTruthy();

  if (!organization?.id) {
    throw new Error('Expected a default organization.');
  }

  return { headers, organization };
}

async function createSignedInMember(input: {
  ownerHeaders: Headers;
  organizationId: string;
  prefix: string;
  role: 'admin' | 'member';
}) {
  const credentials = createCredentials(input.prefix);

  await signUpUser(credentials);

  const invitation = await auth.api.createInvitation({
    body: {
      email: credentials.email,
      organizationId: input.organizationId,
      role: input.role,
    },
    headers: input.ownerHeaders,
  });
  const headers = await signInUser(credentials);

  await auth.api.acceptInvitation({
    body: { invitationId: invitation.id },
    headers,
  });

  return { headers };
}

async function getPolicyRequest(organizationSlug: string, headers: Headers) {
  return callTRPC(headers, (caller) => caller.controls.approvalPolicy({ organizationSlug }));
}

async function updatePolicyRequest(
  organizationSlug: string,
  headers: Headers,
  body: Record<string, unknown>,
) {
  return callTRPC(headers, (caller) =>
    caller.controls.updateApprovalPolicy({ ...body, organizationSlug } as never),
  );
}

beforeEach(() => {
  const originalFetch = globalThis.fetch;

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (url === mailpitSendUrl) {
      return new Response(null, { status: 200 });
    }

    return originalFetch(input, init);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Control Approval Policy', () => {
  it('lets Organization owners enable policy with a default required approval count', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner('policy-owner');

    await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'policy-admin',
      role: 'admin',
    });

    await expect(getPolicyRequest(organization.slug, ownerHeaders)).resolves.toMatchObject({
      body: {
        policy: {
          enabled: false,
          maxRequiredApprovals: 1,
          requiredApprovals: 1,
        },
      },
      status: 200,
    });

    const updateResponse = await updatePolicyRequest(organization.slug, ownerHeaders, {
      enabled: true,
    });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.policy).toMatchObject({
      enabled: true,
      maxRequiredApprovals: 1,
      requiredApprovals: 1,
    });

    await expect(
      db
        .select({
          enabled: organizations.controlApprovalPolicyEnabled,
          requiredCount: organizations.controlApprovalRequiredCount,
        })
        .from(organizations)
        .where(eq(organizations.id, organization.id))
        .limit(1)
        .then((rows) => rows[0]),
    ).resolves.toMatchObject({ enabled: true, requiredCount: 1 });
  });

  it('lets Organization admins configure required approval count within eligible approver limits', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner('policy-admin-owner');
    const firstAdmin = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'policy-first-admin',
      role: 'admin',
    });

    await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'policy-second-admin',
      role: 'admin',
    });

    await expect(
      updatePolicyRequest(organization.slug, firstAdmin.headers, {
        enabled: true,
        requiredApprovals: 2,
      }),
    ).resolves.toMatchObject({
      body: {
        policy: {
          enabled: true,
          maxRequiredApprovals: 2,
          requiredApprovals: 2,
        },
      },
      status: 200,
    });
  });

  it('prevents members and impossible approval counts from changing policy', async () => {
    const { headers: ownerHeaders, organization } =
      await createSignedInOwner('policy-invalid-owner');
    const member = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'policy-member',
      role: 'member',
    });

    await expect(
      updatePolicyRequest(organization.slug, member.headers, {
        enabled: true,
        requiredApprovals: 1,
      }),
    ).resolves.toMatchObject({ status: 403 });

    await expect(
      updatePolicyRequest(organization.slug, ownerHeaders, {
        enabled: true,
        requiredApprovals: 1,
      }),
    ).resolves.toMatchObject({
      body: {
        error:
          'Control Approval Policy needs at least two Organization owners/admins before it can be enabled.',
      },
      status: 400,
    });

    await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'policy-invalid-admin',
      role: 'admin',
    });

    await expect(
      updatePolicyRequest(organization.slug, ownerHeaders, {
        enabled: true,
        requiredApprovals: 2,
      }),
    ).resolves.toMatchObject({
      body: {
        error: 'Required approval count cannot exceed eligible approvers other than the author.',
      },
      status: 400,
    });

    await expect(
      updatePolicyRequest(organization.slug, ownerHeaders, {
        enabled: true,
        requiredApprovals: 0,
      }),
    ).resolves.toMatchObject({
      body: { error: 'Required approval count must be at least 1.' },
      status: 400,
    });
  });
});
