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

  return { credentials, headers };
}

function toQueryString(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value);
    }
  }

  const value = query.toString();

  return value ? `?${value}` : '';
}

async function createChecklistTemplateRequest(
  organizationSlug: string,
  headers: Headers,
  body: Record<string, unknown>,
) {
  const response = await app.request(
    `http://example.com/api/organizations/${organizationSlug}/checklist-templates`,
    {
      body: JSON.stringify(body),
      headers,
      method: 'POST',
    },
  );

  return {
    body: (await response.json()) as Record<string, unknown>,
    status: response.status,
  };
}

async function listChecklistTemplatesRequest(
  organizationSlug: string,
  headers: Headers,
  query: Record<string, string | undefined> = {},
) {
  const response = await app.request(
    `http://example.com/api/organizations/${organizationSlug}/checklist-templates${toQueryString(query)}`,
    { headers },
  );

  return {
    body: (await response.json()) as Record<string, unknown>,
    status: response.status,
  };
}

async function publishChecklistTemplateRequest(
  organizationSlug: string,
  templateId: string,
  headers: Headers,
) {
  const response = await app.request(
    `http://example.com/api/organizations/${organizationSlug}/checklist-templates/${templateId}/publish`,
    {
      headers,
      method: 'POST',
    },
  );

  return {
    body: (await response.json()) as Record<string, unknown>,
    status: response.status,
  };
}

async function updateControlApprovalPolicyRequest(organizationSlug: string, headers: Headers) {
  const response = await app.request(
    `http://example.com/api/organizations/${organizationSlug}/control-approval-policy`,
    {
      body: JSON.stringify({ enabled: true }),
      headers,
      method: 'PATCH',
    },
  );

  return {
    body: (await response.json()) as Record<string, unknown>,
    status: response.status,
  };
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

describe('Checklist Templates', () => {
  it('lets Organization owners create and list draft Checklist Templates', async () => {
    const { headers, organization } = await createSignedInOwner('template-owner');

    const createResponse = await createChecklistTemplateRequest(organization.slug, headers, {
      name: 'Security Baseline',
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.checklistTemplate).toMatchObject({
      author: { name: 'template-owner user' },
      name: 'Security Baseline',
      publishedAt: null,
      status: 'draft',
    });

    const listResponse = await listChecklistTemplatesRequest(organization.slug, headers, {
      status: 'draft',
    });

    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toMatchObject({
      checklistTemplates: [
        {
          name: 'Security Baseline',
          status: 'draft',
        },
      ],
    });
  });

  it('validates required Checklist Template names', async () => {
    const { headers, organization } = await createSignedInOwner('template-validation');

    const createResponse = await createChecklistTemplateRequest(organization.slug, headers, {
      name: '   ',
    });

    expect(createResponse.status).toBe(400);
    expect(createResponse.body).toMatchObject({
      error: 'Checklist Template name is required.',
    });
  });

  it('allows admins to create Checklist Templates and prevents members from creating them', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner('template-admin');
    const admin = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'template-admin-member',
      role: 'admin',
    });
    const member = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'template-regular-member',
      role: 'member',
    });

    const adminCreateResponse = await createChecklistTemplateRequest(
      organization.slug,
      admin.headers,
      {
        name: 'Admin Template',
      },
    );
    const memberCreateResponse = await createChecklistTemplateRequest(
      organization.slug,
      member.headers,
      { name: 'Member Template' },
    );

    expect(adminCreateResponse.status).toBe(201);
    expect(memberCreateResponse.status).toBe(403);
  });

  it('requires Checklist Template names to be unique within an Organization', async () => {
    const { headers, organization } = await createSignedInOwner('template-unique');

    await createChecklistTemplateRequest(organization.slug, headers, {
      name: 'Release Readiness',
    });

    const duplicateResponse = await createChecklistTemplateRequest(organization.slug, headers, {
      name: ' release   readiness ',
    });

    expect(duplicateResponse.status).toBe(400);
    expect(duplicateResponse.body).toMatchObject({
      error: 'Checklist Template name is already used in this Organization.',
    });
  });

  it('limits draft visibility and lets members view active Checklist Templates', async () => {
    const { headers: ownerHeaders, organization } =
      await createSignedInOwner('template-visibility');
    const admin = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'template-visibility-admin',
      role: 'admin',
    });
    const member = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'template-visibility-member',
      role: 'member',
    });

    const createResponse = await createChecklistTemplateRequest(organization.slug, ownerHeaders, {
      name: 'Production Readiness',
    });
    const template = createResponse.body.checklistTemplate as { id: string };

    const memberDraftListResponse = await listChecklistTemplatesRequest(
      organization.slug,
      member.headers,
      { status: 'draft' },
    );
    const adminDraftListResponse = await listChecklistTemplatesRequest(
      organization.slug,
      admin.headers,
      { status: 'draft' },
    );

    expect(memberDraftListResponse.status).toBe(200);
    expect(memberDraftListResponse.body).toMatchObject({ checklistTemplates: [] });
    expect(adminDraftListResponse.status).toBe(200);
    expect(adminDraftListResponse.body).toMatchObject({
      checklistTemplates: [{ name: 'Production Readiness', status: 'draft' }],
    });

    const publishResponse = await publishChecklistTemplateRequest(
      organization.slug,
      template.id,
      ownerHeaders,
    );
    const memberActiveListResponse = await listChecklistTemplatesRequest(
      organization.slug,
      member.headers,
      { status: 'active' },
    );

    expect(publishResponse.status).toBe(200);
    expect(publishResponse.body.checklistTemplate).toMatchObject({
      name: 'Production Readiness',
      status: 'active',
    });
    expect(memberActiveListResponse.status).toBe(200);
    expect(memberActiveListResponse.body).toMatchObject({
      checklistTemplates: [{ name: 'Production Readiness', status: 'active' }],
    });
  });

  it('publishes Checklist Templates without Control Approval Policy approval', async () => {
    const { headers, organization } = await createSignedInOwner('template-policy');

    await createSignedInMember({
      ownerHeaders: headers,
      organizationId: organization.id,
      prefix: 'template-policy-admin',
      role: 'admin',
    });

    const createResponse = await createChecklistTemplateRequest(organization.slug, headers, {
      name: 'Policy Independent Template',
    });
    const template = createResponse.body.checklistTemplate as { id: string };
    const policyResponse = await updateControlApprovalPolicyRequest(organization.slug, headers);

    expect(policyResponse.status).toBe(200);

    const publishResponse = await publishChecklistTemplateRequest(
      organization.slug,
      template.id,
      headers,
    );

    expect(publishResponse.status).toBe(200);
    expect(publishResponse.body.checklistTemplate).toMatchObject({
      name: 'Policy Independent Template',
      status: 'active',
    });
  });
});
