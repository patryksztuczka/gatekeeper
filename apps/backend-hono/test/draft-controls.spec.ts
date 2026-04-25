import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import app from '../src/index';
import { db } from '../src/db/client';
import { controlVersions, controls, users } from '../src/db/schema';
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

async function createDraftControlRequest(
  organizationSlug: string,
  headers: Headers,
  body: Record<string, unknown>,
) {
  const response = await app.request(
    `http://example.com/api/organizations/${organizationSlug}/controls/drafts`,
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

async function listDraftControlsRequest(organizationSlug: string, headers: Headers) {
  const response = await app.request(
    `http://example.com/api/organizations/${organizationSlug}/controls/drafts`,
    { headers },
  );

  return {
    body: (await response.json()) as Record<string, unknown>,
    status: response.status,
  };
}

const completePublishBody = {
  acceptedEvidenceTypes: ['document', 'approval record'],
  applicabilityConditions: 'Applies to internet-facing authentication surfaces.',
  businessMeaning: 'Release teams must verify users have a second authentication factor.',
  releaseImpact: 'blocking',
  verificationMethod: 'Review identity provider MFA policy evidence.',
};

async function publishDraftControlRequest(
  organizationSlug: string,
  draftControlId: string,
  headers: Headers,
  body: Record<string, unknown> = completePublishBody,
) {
  const response = await app.request(
    `http://example.com/api/organizations/${organizationSlug}/controls/drafts/${draftControlId}/publish`,
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

async function listControlsRequest(organizationSlug: string, headers: Headers) {
  const response = await app.request(
    `http://example.com/api/organizations/${organizationSlug}/controls`,
    {
      headers,
    },
  );

  return {
    body: (await response.json()) as Record<string, unknown>,
    status: response.status,
  };
}

async function getControlRequest(organizationSlug: string, controlId: string, headers: Headers) {
  const response = await app.request(
    `http://example.com/api/organizations/${organizationSlug}/controls/${controlId}`,
    { headers },
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

describe('Draft Controls', () => {
  it('lets Organization members create and list their own Draft Controls', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner('draft-owner');
    const member = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'draft-member',
      role: 'member',
    });

    const createResponse = await createDraftControlRequest(organization.slug, member.headers, {
      controlCode: 'AUTH-001',
      title: 'Require multi-factor authentication',
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.draftControl).toMatchObject({
      author: { email: member.credentials.email },
      controlCode: 'AUTH-001',
      title: 'Require multi-factor authentication',
    });

    await expect(
      listDraftControlsRequest(organization.slug, member.headers),
    ).resolves.toMatchObject({
      body: { draftControls: [{ controlCode: 'AUTH-001' }] },
      status: 200,
    });
  });

  it('enforces Draft Control visibility by author and Organization owner/admin role', async () => {
    const { headers: ownerHeaders, organization } =
      await createSignedInOwner('draft-visibility-owner');
    const firstMember = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'draft-first-member',
      role: 'member',
    });
    const secondMember = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'draft-second-member',
      role: 'member',
    });
    const admin = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'draft-admin',
      role: 'admin',
    });

    await createDraftControlRequest(organization.slug, firstMember.headers, {
      controlCode: 'AUTH-002',
      title: 'Review privileged access',
    });
    await createDraftControlRequest(organization.slug, secondMember.headers, {
      controlCode: 'DATA-001',
      title: 'Classify production data',
    });

    await expect(
      listDraftControlsRequest(organization.slug, firstMember.headers),
    ).resolves.toMatchObject({
      body: { draftControls: [{ controlCode: 'AUTH-002' }] },
      status: 200,
    });
    await expect(listDraftControlsRequest(organization.slug, ownerHeaders)).resolves.toMatchObject({
      body: {
        draftControls: [{ controlCode: 'AUTH-002' }, { controlCode: 'DATA-001' }],
      },
      status: 200,
    });
    await expect(listDraftControlsRequest(organization.slug, admin.headers)).resolves.toMatchObject(
      {
        body: {
          draftControls: [{ controlCode: 'AUTH-002' }, { controlCode: 'DATA-001' }],
        },
        status: 200,
      },
    );
  });

  it('validates required Draft Control fields and Organization-local Control Code uniqueness', async () => {
    const first = await createSignedInOwner('draft-first-org');
    const second = await createSignedInOwner('draft-second-org');

    const missingCodeResponse = await createDraftControlRequest(
      first.organization.slug,
      first.headers,
      {
        controlCode: '',
        title: 'Missing code',
      },
    );

    expect(missingCodeResponse.status).toBe(400);
    expect(missingCodeResponse.body).toMatchObject({ error: 'Control Code is required.' });

    const missingTitleResponse = await createDraftControlRequest(
      first.organization.slug,
      first.headers,
      {
        controlCode: 'AUTH-003',
        title: '',
      },
    );

    expect(missingTitleResponse.status).toBe(400);
    expect(missingTitleResponse.body).toMatchObject({ error: 'Control title is required.' });

    await createDraftControlRequest(first.organization.slug, first.headers, {
      controlCode: 'AUTH-003',
      title: 'First code use',
    });

    const duplicateResponse = await createDraftControlRequest(
      first.organization.slug,
      first.headers,
      {
        controlCode: 'AUTH-003',
        title: 'Duplicate code use',
      },
    );

    expect(duplicateResponse.status).toBe(400);
    expect(duplicateResponse.body).toMatchObject({
      error: 'Control Code is already used in this Organization.',
    });

    await expect(
      createDraftControlRequest(second.organization.slug, second.headers, {
        controlCode: 'AUTH-003',
        title: 'Same code in another Organization',
      }),
    ).resolves.toMatchObject({ status: 201 });
  });

  it('lets Organization owners publish a complete Draft Control as active Control Version v1', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner('publish-owner');

    const createResponse = await createDraftControlRequest(organization.slug, ownerHeaders, {
      controlCode: 'AUTH-004',
      title: 'Require phishing-resistant MFA',
    });

    expect(createResponse.status).toBe(201);

    const draftControl = createResponse.body.draftControl as { id: string };
    const publishResponse = await publishDraftControlRequest(
      organization.slug,
      draftControl.id,
      ownerHeaders,
    );

    expect(publishResponse.status).toBe(201);
    expect(publishResponse.body.control).toMatchObject({
      controlCode: 'AUTH-004',
      currentVersion: {
        acceptedEvidenceTypes: ['document', 'approval record'],
        releaseImpact: 'blocking',
        title: 'Require phishing-resistant MFA',
        versionNumber: 1,
      },
      title: 'Require phishing-resistant MFA',
    });

    const [controlRow] = await db
      .select()
      .from(controls)
      .where(eq(controls.organizationId, organization.id));
    expect(controlRow?.currentControlCode).toBe('AUTH-004');

    const versions = await db
      .select()
      .from(controlVersions)
      .where(eq(controlVersions.controlId, controlRow!.id));
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ controlCode: 'AUTH-004', versionNumber: 1 });

    await expect(listDraftControlsRequest(organization.slug, ownerHeaders)).resolves.toMatchObject({
      body: { draftControls: [] },
      status: 200,
    });
  });

  it('makes published Controls visible in list and detail to all Organization members', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner('active-owner');
    const member = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'active-member',
      role: 'member',
    });

    const createResponse = await createDraftControlRequest(organization.slug, ownerHeaders, {
      controlCode: 'DATA-002',
      title: 'Classify customer data',
    });
    const draftControl = createResponse.body.draftControl as { id: string };
    const publishResponse = await publishDraftControlRequest(
      organization.slug,
      draftControl.id,
      ownerHeaders,
    );
    const control = publishResponse.body.control as { id: string };

    await expect(listControlsRequest(organization.slug, member.headers)).resolves.toMatchObject({
      body: { controls: [{ controlCode: 'DATA-002', currentVersion: { versionNumber: 1 } }] },
      status: 200,
    });
    await expect(
      getControlRequest(organization.slug, control.id, member.headers),
    ).resolves.toMatchObject({
      body: { control: { controlCode: 'DATA-002', currentVersion: { releaseImpact: 'blocking' } } },
      status: 200,
    });
  });

  it('limits Draft Control publishing to Organization owners and admins', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner('publish-role-owner');
    const member = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'publish-role-member',
      role: 'member',
    });
    const admin = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'publish-role-admin',
      role: 'admin',
    });

    const firstDraftResponse = await createDraftControlRequest(organization.slug, member.headers, {
      controlCode: 'AUTH-005',
      title: 'Review privileged sessions',
    });
    const firstDraft = firstDraftResponse.body.draftControl as { id: string };

    await expect(
      publishDraftControlRequest(organization.slug, firstDraft.id, member.headers),
    ).resolves.toMatchObject({
      body: { error: 'Only Organization owners and admins can publish Controls.' },
      status: 403,
    });

    const secondDraftResponse = await createDraftControlRequest(organization.slug, admin.headers, {
      controlCode: 'AUTH-006',
      title: 'Review production access',
    });
    const secondDraft = secondDraftResponse.body.draftControl as { id: string };

    await expect(
      publishDraftControlRequest(organization.slug, secondDraft.id, admin.headers),
    ).resolves.toMatchObject({ status: 201 });
  });

  it('validates required Control publish fields', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner('publish-validation');
    const createResponse = await createDraftControlRequest(organization.slug, ownerHeaders, {
      controlCode: 'AUTH-007',
      title: 'Validate publish fields',
    });
    const draftControl = createResponse.body.draftControl as { id: string };

    const publishResponse = await publishDraftControlRequest(
      organization.slug,
      draftControl.id,
      ownerHeaders,
      {
        ...completePublishBody,
        acceptedEvidenceTypes: [],
      },
    );

    expect(publishResponse.status).toBe(400);
    expect(publishResponse.body).toMatchObject({
      error: 'At least one Accepted Evidence Type is required.',
    });
  });
});
