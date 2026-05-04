import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '../src/db/client';
import {
  controlPublishRequestApprovals,
  controlPublishRequests,
  controlVersions,
  controls,
  users,
} from '../src/db/schema';
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

  return { credentials, headers };
}

async function createDraftControlRequest(
  organizationSlug: string,
  headers: Headers,
  body: Record<string, unknown>,
) {
  return callTRPC(
    headers,
    (caller) => caller.controls.createDraft({ ...body, organizationSlug } as never),
    201,
  );
}

async function listDraftControlsRequest(
  organizationSlug: string,
  headers: Headers,
  query: Record<string, string | undefined> = {},
) {
  return callTRPC(headers, (caller) =>
    caller.controls.listDrafts({ organizationSlug, search: query.q } as never),
  );
}

const completePublishBody = {
  businessMeaning: 'Release teams must verify users have a second authentication factor.',
};

async function publishDraftControlRequest(
  organizationSlug: string,
  draftControlId: string,
  headers: Headers,
  body: Record<string, unknown> = completePublishBody,
) {
  return callTRPC(
    headers,
    (caller) =>
      caller.controls.publishDraft({ ...body, draftControlId, organizationSlug } as never),
    201,
  );
}

async function submitDraftControlPublishRequest(
  organizationSlug: string,
  draftControlId: string,
  headers: Headers,
  body: Record<string, unknown> = completePublishBody,
) {
  return callTRPC(
    headers,
    (caller) =>
      caller.controls.submitDraftPublishRequest({
        ...body,
        draftControlId,
        organizationSlug,
      } as never),
    201,
  );
}

async function listControlsRequest(
  organizationSlug: string,
  headers: Headers,
  query: Record<string, string | undefined> = {},
) {
  return callTRPC(headers, (caller) =>
    caller.controls.list({ ...query, organizationSlug, search: query.q } as never),
  );
}

async function archiveControlRequest(
  organizationSlug: string,
  controlId: string,
  headers: Headers,
  body: Record<string, unknown> = {},
) {
  return callTRPC(headers, (caller) =>
    caller.controls.archive({ ...body, controlId, organizationSlug } as never),
  );
}

async function restoreControlRequest(
  organizationSlug: string,
  controlId: string,
  headers: Headers,
) {
  return callTRPC(headers, (caller) => caller.controls.restore({ controlId, organizationSlug }));
}

async function cancelDraftControlRequest(
  organizationSlug: string,
  draftControlId: string,
  headers: Headers,
) {
  return callTRPC(headers, (caller) =>
    caller.controls.cancelDraft({ draftControlId, organizationSlug }),
  );
}

async function getControlRequest(organizationSlug: string, controlId: string, headers: Headers) {
  return callTRPC(headers, (caller) => caller.controls.detail({ controlId, organizationSlug }));
}

async function createControlProposedUpdateRequest(
  organizationSlug: string,
  controlId: string,
  headers: Headers,
  body: Record<string, unknown>,
) {
  return callTRPC(
    headers,
    (caller) =>
      caller.controls.createProposedUpdate({ ...body, controlId, organizationSlug } as never),
    201,
  );
}

async function listControlProposedUpdatesRequest(organizationSlug: string, headers: Headers) {
  return callTRPC(headers, (caller) => caller.controls.listProposedUpdates({ organizationSlug }));
}

async function listControlPublishRequestsRequest(organizationSlug: string, headers: Headers) {
  return callTRPC(headers, (caller) => caller.controls.listPublishRequests({ organizationSlug }));
}

async function approveControlPublishRequest(
  organizationSlug: string,
  publishRequestId: string,
  headers: Headers,
) {
  return callTRPC(headers, (caller) =>
    caller.controls.approvePublishRequest({ organizationSlug, publishRequestId }),
  );
}

async function rejectControlPublishRequest(
  organizationSlug: string,
  publishRequestId: string,
  headers: Headers,
  body: Record<string, unknown>,
) {
  return callTRPC(headers, (caller) =>
    caller.controls.rejectPublishRequest({ ...body, organizationSlug, publishRequestId } as never),
  );
}

async function withdrawControlPublishRequest(
  organizationSlug: string,
  publishRequestId: string,
  headers: Headers,
) {
  return callTRPC(headers, (caller) =>
    caller.controls.withdrawPublishRequest({ organizationSlug, publishRequestId }),
  );
}

async function publishControlPublishRequest(
  organizationSlug: string,
  publishRequestId: string,
  headers: Headers,
) {
  return callTRPC(
    headers,
    (caller) => caller.controls.publishPublishRequest({ organizationSlug, publishRequestId }),
    201,
  );
}

async function updateControlApprovalPolicyRequest(
  organizationSlug: string,
  headers: Headers,
  body: Record<string, unknown>,
) {
  return callTRPC(headers, (caller) =>
    caller.controls.updateApprovalPolicy({ ...body, organizationSlug } as never),
  );
}

async function enableControlApprovalPolicy(organizationSlug: string, headers: Headers) {
  const response = await updateControlApprovalPolicyRequest(organizationSlug, headers, {
    enabled: true,
    requiredApprovals: 1,
  });

  expect(response.status).toBe(200);
}

async function publishControlProposedUpdateRequest(
  organizationSlug: string,
  controlId: string,
  proposedUpdateId: string,
  headers: Headers,
) {
  return callTRPC(
    headers,
    (caller) =>
      caller.controls.publishProposedUpdate({ controlId, organizationSlug, proposedUpdateId }),
    201,
  );
}

async function submitControlProposedUpdatePublishRequest(
  organizationSlug: string,
  controlId: string,
  proposedUpdateId: string,
  headers: Headers,
) {
  return callTRPC(
    headers,
    (caller) =>
      caller.controls.submitProposedUpdatePublishRequest({
        controlId,
        organizationSlug,
        proposedUpdateId,
      }),
    201,
  );
}

async function rejectControlProposedUpdateRequest(
  organizationSlug: string,
  controlId: string,
  proposedUpdateId: string,
  headers: Headers,
) {
  return callTRPC(headers, (caller) =>
    caller.controls.rejectProposedUpdate({ controlId, organizationSlug, proposedUpdateId }),
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
      controlCode: 'CTL-001',
      title: 'Require multi-factor authentication',
    });

    await expect(
      listDraftControlsRequest(organization.slug, member.headers),
    ).resolves.toMatchObject({
      body: { draftControls: [{ controlCode: 'CTL-001' }] },
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
      body: { draftControls: [{ controlCode: 'CTL-001' }] },
      status: 200,
    });
    await expect(listDraftControlsRequest(organization.slug, ownerHeaders)).resolves.toMatchObject({
      body: {
        draftControls: [{ controlCode: 'CTL-001' }, { controlCode: 'CTL-002' }],
      },
      status: 200,
    });
    await expect(listDraftControlsRequest(organization.slug, admin.headers)).resolves.toMatchObject(
      {
        body: {
          draftControls: [{ controlCode: 'CTL-001' }, { controlCode: 'CTL-002' }],
        },
        status: 200,
      },
    );
  });

  it('validates required Draft Control fields and generates Organization-local Control Codes', async () => {
    const first = await createSignedInOwner('draft-first-org');
    const second = await createSignedInOwner('draft-second-org');

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

    const firstDraftResponse = await createDraftControlRequest(
      first.organization.slug,
      first.headers,
      {
        controlCode: 'AUTH-003',
        title: 'First code use',
      },
    );
    expect(firstDraftResponse.body.draftControl).toMatchObject({ controlCode: 'CTL-001' });

    await expect(
      createDraftControlRequest(first.organization.slug, first.headers, {
        controlCode: 'AUTH-003',
        title: 'Next generated code',
      }),
    ).resolves.toMatchObject({
      body: { draftControl: { controlCode: 'CTL-002' } },
      status: 201,
    });

    await expect(
      createDraftControlRequest(second.organization.slug, second.headers, {
        controlCode: 'AUTH-003',
        title: 'Same code in another Organization',
      }),
    ).resolves.toMatchObject({
      body: { draftControl: { controlCode: 'CTL-001' } },
      status: 201,
    });
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
      controlCode: 'CTL-001',
      currentVersion: {
        title: 'Require phishing-resistant MFA',
        versionNumber: 1,
      },
      title: 'Require phishing-resistant MFA',
    });

    const [controlRow] = await db
      .select()
      .from(controls)
      .where(eq(controls.organizationId, organization.id));
    expect(controlRow?.currentControlCode).toBe('CTL-001');

    const versions = await db
      .select()
      .from(controlVersions)
      .where(eq(controlVersions.controlId, controlRow!.id));
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ controlCode: 'CTL-001', versionNumber: 1 });

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
      body: { controls: [{ controlCode: 'CTL-001', currentVersion: { versionNumber: 1 } }] },
      status: 200,
    });
    await expect(
      getControlRequest(organization.slug, control.id, member.headers),
    ).resolves.toMatchObject({
      body: { control: { controlCode: 'CTL-001', currentVersion: { versionNumber: 1 } } },
      status: 200,
    });
  });

  it('searches active Controls by current MVP Control fields', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner('control-search');
    const member = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'control-search-member',
      role: 'member',
    });

    const firstDraftResponse = await createDraftControlRequest(organization.slug, ownerHeaders, {
      controlCode: 'AUTH-008',
      title: 'Require phishing-resistant MFA',
    });
    const secondDraftResponse = await createDraftControlRequest(organization.slug, ownerHeaders, {
      controlCode: 'DATA-003',
      title: 'Retain audit logs',
    });
    const firstDraft = firstDraftResponse.body.draftControl as { id: string };
    const secondDraft = secondDraftResponse.body.draftControl as { id: string };

    await publishDraftControlRequest(organization.slug, firstDraft.id, ownerHeaders);
    await publishDraftControlRequest(organization.slug, secondDraft.id, ownerHeaders, {
      businessMeaning: 'Release teams must preserve audit events for investigation.',
    });

    await expect(
      listControlsRequest(organization.slug, member.headers, { q: 'phishing' }),
    ).resolves.toMatchObject({
      body: { controls: [{ controlCode: 'CTL-001' }] },
      status: 200,
    });
    await expect(
      listControlsRequest(organization.slug, member.headers, { q: 'investigation' }),
    ).resolves.toMatchObject({
      body: { controls: [{ controlCode: 'CTL-002' }] },
      status: 200,
    });
    await expect(
      listControlsRequest(organization.slug, ownerHeaders, { status: 'archived' }),
    ).resolves.toMatchObject({
      body: { controls: [] },
      status: 200,
    });
  });

  it('searches Draft Controls without weakening draft visibility rules', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner('draft-search-owner');
    const firstMember = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'draft-search-first-member',
      role: 'member',
    });
    const secondMember = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'draft-search-second-member',
      role: 'member',
    });

    await createDraftControlRequest(organization.slug, firstMember.headers, {
      controlCode: 'AUTH-009',
      title: 'Review session timeout',
    });
    await createDraftControlRequest(organization.slug, secondMember.headers, {
      controlCode: 'DATA-004',
      title: 'Classify analytics exports',
    });

    await expect(
      listDraftControlsRequest(organization.slug, firstMember.headers, { q: 'Classify' }),
    ).resolves.toMatchObject({
      body: { draftControls: [] },
      status: 200,
    });
    await expect(
      listDraftControlsRequest(organization.slug, ownerHeaders, { q: 'Classify' }),
    ).resolves.toMatchObject({
      body: { draftControls: [{ controlCode: 'CTL-002' }] },
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

  it('lets members submit complete Draft Controls for review when Control Approval Policy is enabled', async () => {
    const { headers: ownerHeaders, organization } =
      await createSignedInOwner('request-draft-owner');
    await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'request-draft-admin',
      role: 'admin',
    });
    const member = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'request-draft-member',
      role: 'member',
    });

    await enableControlApprovalPolicy(organization.slug, ownerHeaders);

    const createResponse = await createDraftControlRequest(organization.slug, member.headers, {
      controlCode: 'AUTH-026',
      title: 'Submit MFA Control',
    });
    const draftControl = createResponse.body.draftControl as { id: string };
    const submitResponse = await submitDraftControlPublishRequest(
      organization.slug,
      draftControl.id,
      member.headers,
    );

    expect(submitResponse.status).toBe(201);
    expect(submitResponse.body.publishRequest).toMatchObject({
      approvalCount: 0,
      author: { email: member.credentials.email },
      controlCode: 'CTL-001',
      draftControlId: draftControl.id,
      requestType: 'draft_control',
      requiredApprovalCount: 1,
      status: 'submitted',
      title: 'Submit MFA Control',
    });

    await expect(
      db
        .select()
        .from(controlPublishRequests)
        .where(eq(controlPublishRequests.draftControlId, draftControl.id)),
    ).resolves.toHaveLength(1);
  });

  it('limits submitted Control Publish Request visibility to author and Organization owners/admins', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner(
      'request-visibility-owner',
    );
    const admin = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'request-visibility-admin',
      role: 'admin',
    });
    const firstMember = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'request-visibility-first-member',
      role: 'member',
    });
    const secondMember = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'request-visibility-second-member',
      role: 'member',
    });

    await enableControlApprovalPolicy(organization.slug, ownerHeaders);

    const draftResponse = await createDraftControlRequest(organization.slug, firstMember.headers, {
      controlCode: 'AUTH-027',
      title: 'Visible submitted request',
    });
    const draftControl = draftResponse.body.draftControl as { id: string };

    await submitDraftControlPublishRequest(organization.slug, draftControl.id, firstMember.headers);

    await expect(
      listControlPublishRequestsRequest(organization.slug, firstMember.headers),
    ).resolves.toMatchObject({
      body: { publishRequests: [{ controlCode: 'CTL-001' }] },
      status: 200,
    });
    await expect(
      listControlPublishRequestsRequest(organization.slug, secondMember.headers),
    ).resolves.toMatchObject({ body: { publishRequests: [] }, status: 200 });
    await expect(
      listControlPublishRequestsRequest(organization.slug, ownerHeaders),
    ).resolves.toMatchObject({
      body: { publishRequests: [{ controlCode: 'CTL-001' }] },
      status: 200,
    });
    await expect(
      listControlPublishRequestsRequest(organization.slug, admin.headers),
    ).resolves.toMatchObject({
      body: { publishRequests: [{ controlCode: 'CTL-001' }] },
      status: 200,
    });
  });

  it('blocks publishing while Control Approval Policy requires an approved Control Publish Request', async () => {
    const { headers: ownerHeaders, organization } =
      await createSignedInOwner('request-block-owner');
    await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'request-block-admin',
      role: 'admin',
    });

    await enableControlApprovalPolicy(organization.slug, ownerHeaders);

    const createResponse = await createDraftControlRequest(organization.slug, ownerHeaders, {
      controlCode: 'AUTH-028',
      title: 'Blocked publish Control',
    });
    const draftControl = createResponse.body.draftControl as { id: string };

    await submitDraftControlPublishRequest(organization.slug, draftControl.id, ownerHeaders);

    await expect(
      publishDraftControlRequest(organization.slug, draftControl.id, ownerHeaders),
    ).resolves.toMatchObject({
      body: {
        error:
          'Control Approval Policy requires an approved Control Publish Request before publishing.',
      },
      status: 400,
    });
  });

  it('lets eligible owners and admins approve submitted Control Publish Requests except their own', async () => {
    const { headers: ownerHeaders, organization } =
      await createSignedInOwner('request-approve-owner');
    const admin = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'request-approve-admin',
      role: 'admin',
    });
    const member = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'request-approve-member',
      role: 'member',
    });

    await enableControlApprovalPolicy(organization.slug, ownerHeaders);

    const createResponse = await createDraftControlRequest(organization.slug, member.headers, {
      controlCode: 'AUTH-030',
      title: 'Approval reviewed Control',
    });
    const draftControl = createResponse.body.draftControl as { id: string };
    const submitResponse = await submitDraftControlPublishRequest(
      organization.slug,
      draftControl.id,
      member.headers,
    );
    const publishRequest = submitResponse.body.publishRequest as { id: string };

    await expect(
      approveControlPublishRequest(organization.slug, publishRequest.id, member.headers),
    ).resolves.toMatchObject({
      body: { error: 'Only Organization owners and admins can approve Control Publish Requests.' },
      status: 403,
    });

    const adminApproveResponse = await approveControlPublishRequest(
      organization.slug,
      publishRequest.id,
      admin.headers,
    );

    expect(adminApproveResponse.status).toBe(200);
    expect(adminApproveResponse.body.publishRequest).toMatchObject({
      approvalCount: 1,
      status: 'submitted',
    });

    await expect(
      approveControlPublishRequest(organization.slug, publishRequest.id, admin.headers),
    ).resolves.toMatchObject({
      body: { publishRequest: { approvalCount: 1 } },
      status: 200,
    });
  });

  it('prevents Control Publish Request authors from approving their own requests', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner(
      'request-self-approve-owner',
    );
    await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'request-self-approve-admin',
      role: 'admin',
    });

    await enableControlApprovalPolicy(organization.slug, ownerHeaders);

    const createResponse = await createDraftControlRequest(organization.slug, ownerHeaders, {
      controlCode: 'AUTH-031',
      title: 'Self approval Control',
    });
    const draftControl = createResponse.body.draftControl as { id: string };
    const submitResponse = await submitDraftControlPublishRequest(
      organization.slug,
      draftControl.id,
      ownerHeaders,
    );
    const publishRequest = submitResponse.body.publishRequest as { id: string };

    await expect(
      approveControlPublishRequest(organization.slug, publishRequest.id, ownerHeaders),
    ).resolves.toMatchObject({
      body: { error: 'Authors cannot approve their own Control Publish Requests.' },
      status: 400,
    });
  });

  it('requires a rejection comment and returns submitted requests to draft with approvals reset', async () => {
    const { headers: ownerHeaders, organization } =
      await createSignedInOwner('request-reject-owner');
    const admin = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'request-reject-admin',
      role: 'admin',
    });
    const member = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'request-reject-member',
      role: 'member',
    });

    await enableControlApprovalPolicy(organization.slug, ownerHeaders);

    const createResponse = await createDraftControlRequest(organization.slug, member.headers, {
      controlCode: 'AUTH-032',
      title: 'Rejected Control',
    });
    const draftControl = createResponse.body.draftControl as { id: string };
    const submitResponse = await submitDraftControlPublishRequest(
      organization.slug,
      draftControl.id,
      member.headers,
    );
    const publishRequest = submitResponse.body.publishRequest as { id: string };

    await approveControlPublishRequest(organization.slug, publishRequest.id, admin.headers);

    await expect(
      rejectControlPublishRequest(organization.slug, publishRequest.id, ownerHeaders, {
        comment: '',
      }),
    ).resolves.toMatchObject({
      body: { error: 'Rejection comment is required.' },
      status: 400,
    });

    const rejectResponse = await rejectControlPublishRequest(
      organization.slug,
      publishRequest.id,
      ownerHeaders,
      { comment: 'Business meaning needs more detail.' },
    );

    expect(rejectResponse.status).toBe(200);
    expect(rejectResponse.body.publishRequest).toMatchObject({
      approvalCount: 0,
      rejectionComment: 'Business meaning needs more detail.',
      status: 'draft',
    });
    await expect(
      db
        .select()
        .from(controlPublishRequestApprovals)
        .where(eq(controlPublishRequestApprovals.requestId, publishRequest.id)),
    ).resolves.toHaveLength(0);
  });

  it('lets authors withdraw submitted requests and resubmit edits with approvals reset', async () => {
    const { headers: ownerHeaders, organization } =
      await createSignedInOwner('request-withdraw-owner');
    const admin = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'request-withdraw-admin',
      role: 'admin',
    });
    const member = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'request-withdraw-member',
      role: 'member',
    });

    await enableControlApprovalPolicy(organization.slug, ownerHeaders);

    const createResponse = await createDraftControlRequest(organization.slug, member.headers, {
      controlCode: 'AUTH-033',
      title: 'Withdrawn Control',
    });
    const draftControl = createResponse.body.draftControl as { id: string };
    const submitResponse = await submitDraftControlPublishRequest(
      organization.slug,
      draftControl.id,
      member.headers,
    );
    const publishRequest = submitResponse.body.publishRequest as { id: string };

    await approveControlPublishRequest(organization.slug, publishRequest.id, admin.headers);

    await expect(
      withdrawControlPublishRequest(organization.slug, publishRequest.id, ownerHeaders),
    ).resolves.toMatchObject({
      body: { error: 'Only the author can withdraw a Control Publish Request.' },
      status: 400,
    });

    await expect(
      withdrawControlPublishRequest(organization.slug, publishRequest.id, member.headers),
    ).resolves.toMatchObject({
      body: { publishRequest: { approvalCount: 0, status: 'draft' } },
      status: 200,
    });

    const resubmitResponse = await submitDraftControlPublishRequest(
      organization.slug,
      draftControl.id,
      member.headers,
      {
        ...completePublishBody,
        businessMeaning: 'Edited after review so approvals must be recollected.',
      },
    );

    expect(resubmitResponse.status).toBe(201);
    expect(resubmitResponse.body.publishRequest).toMatchObject({
      approvalCount: 0,
      businessMeaning: 'Edited after review so approvals must be recollected.',
      id: publishRequest.id,
      status: 'submitted',
    });
  });

  it('publishes approved Draft Control requests as v1 Controls', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner(
      'request-publish-draft-owner',
    );
    const admin = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'request-publish-draft-admin',
      role: 'admin',
    });
    const member = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'request-publish-draft-member',
      role: 'member',
    });

    await enableControlApprovalPolicy(organization.slug, ownerHeaders);

    const createResponse = await createDraftControlRequest(organization.slug, member.headers, {
      controlCode: 'CTL-001',
      title: 'Approved new Control',
    });
    const draftControl = createResponse.body.draftControl as { id: string };
    const submitResponse = await submitDraftControlPublishRequest(
      organization.slug,
      draftControl.id,
      member.headers,
    );
    const publishRequest = submitResponse.body.publishRequest as { id: string };

    await approveControlPublishRequest(organization.slug, publishRequest.id, admin.headers);

    const publishResponse = await publishControlPublishRequest(
      organization.slug,
      publishRequest.id,
      ownerHeaders,
    );

    expect(publishResponse.status).toBe(201);
    expect(publishResponse.body.control).toMatchObject({
      controlCode: 'CTL-001',
      currentVersion: { title: 'Approved new Control', versionNumber: 1 },
      versions: [{ versionNumber: 1 }],
    });
    await expect(
      listControlPublishRequestsRequest(organization.slug, ownerHeaders),
    ).resolves.toMatchObject({ body: { publishRequests: [] }, status: 200 });
  });

  it('publishes approved proposed update requests as the next Control Version', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner(
      'request-publish-update-owner',
    );
    const admin = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'request-publish-update-admin',
      role: 'admin',
    });

    const createResponse = await createDraftControlRequest(organization.slug, ownerHeaders, {
      controlCode: 'AUTH-035',
      title: 'Before approved update',
    });
    const draftControl = createResponse.body.draftControl as { id: string };
    const initialPublishResponse = await publishDraftControlRequest(
      organization.slug,
      draftControl.id,
      ownerHeaders,
    );
    const control = initialPublishResponse.body.control as { id: string };

    await enableControlApprovalPolicy(organization.slug, ownerHeaders);

    const proposedResponse = await createControlProposedUpdateRequest(
      organization.slug,
      control.id,
      ownerHeaders,
      {
        ...completePublishBody,
        businessMeaning: 'Approved request creates the next Control Version.',
        controlCode: 'AUTH-035',
        title: 'After approved update',
      },
    );
    const proposedUpdate = proposedResponse.body.proposedUpdate as { id: string };
    const submitResponse = await submitControlProposedUpdatePublishRequest(
      organization.slug,
      control.id,
      proposedUpdate.id,
      ownerHeaders,
    );
    const publishRequest = submitResponse.body.publishRequest as { id: string };

    await approveControlPublishRequest(organization.slug, publishRequest.id, admin.headers);

    const publishResponse = await publishControlPublishRequest(
      organization.slug,
      publishRequest.id,
      admin.headers,
    );

    expect(publishResponse.status).toBe(201);
    expect(publishResponse.body.control).toMatchObject({
      currentVersion: {
        businessMeaning: 'Approved request creates the next Control Version.',
        title: 'After approved update',
        versionNumber: 2,
      },
      versions: [{ versionNumber: 2 }, { versionNumber: 1 }],
    });
  });

  it('uses snapshotted Control Approval Policy settings for in-flight requests', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner(
      'request-policy-snapshot-owner',
    );
    const firstAdmin = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'request-policy-snapshot-first-admin',
      role: 'admin',
    });
    const secondAdmin = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'request-policy-snapshot-second-admin',
      role: 'admin',
    });
    const member = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'request-policy-snapshot-member',
      role: 'member',
    });

    await expect(
      updateControlApprovalPolicyRequest(organization.slug, ownerHeaders, {
        enabled: true,
        requiredApprovals: 2,
      }),
    ).resolves.toMatchObject({ status: 200 });

    const firstDraftResponse = await createDraftControlRequest(organization.slug, member.headers, {
      controlCode: 'AUTH-036',
      title: 'Policy count follows request snapshot',
    });
    const firstDraft = firstDraftResponse.body.draftControl as { id: string };
    const firstSubmitResponse = await submitDraftControlPublishRequest(
      organization.slug,
      firstDraft.id,
      member.headers,
    );
    const firstRequest = firstSubmitResponse.body.publishRequest as { id: string };

    await approveControlPublishRequest(organization.slug, firstRequest.id, firstAdmin.headers);
    await expect(
      publishControlPublishRequest(organization.slug, firstRequest.id, ownerHeaders),
    ).resolves.toMatchObject({
      body: {
        error:
          'Control Approval Policy requires an approved Control Publish Request before publishing.',
      },
      status: 400,
    });

    await expect(
      updateControlApprovalPolicyRequest(organization.slug, ownerHeaders, {
        enabled: true,
        requiredApprovals: 1,
      }),
    ).resolves.toMatchObject({ status: 200 });

    await expect(
      listControlPublishRequestsRequest(organization.slug, ownerHeaders),
    ).resolves.toMatchObject({
      body: { publishRequests: [{ controlCode: 'CTL-001', isPublishable: false }] },
      status: 200,
    });
    await expect(
      publishControlPublishRequest(organization.slug, firstRequest.id, ownerHeaders),
    ).resolves.toMatchObject({
      body: {
        error:
          'Control Approval Policy requires an approved Control Publish Request before publishing.',
      },
      status: 400,
    });

    await approveControlPublishRequest(organization.slug, firstRequest.id, secondAdmin.headers);
    await expect(
      listControlPublishRequestsRequest(organization.slug, ownerHeaders),
    ).resolves.toMatchObject({
      body: { publishRequests: [{ controlCode: 'CTL-001', isPublishable: true }] },
      status: 200,
    });
    await expect(
      publishControlPublishRequest(organization.slug, firstRequest.id, ownerHeaders),
    ).resolves.toMatchObject({
      body: { control: { controlCode: 'CTL-001', currentVersion: { versionNumber: 1 } } },
      status: 201,
    });

    await expect(
      updateControlApprovalPolicyRequest(organization.slug, ownerHeaders, {
        enabled: true,
        requiredApprovals: 2,
      }),
    ).resolves.toMatchObject({ status: 200 });

    const secondDraftResponse = await createDraftControlRequest(organization.slug, member.headers, {
      controlCode: 'AUTH-037',
      title: 'Disabled policy allows submitted requests',
    });
    const secondDraft = secondDraftResponse.body.draftControl as { id: string };
    const secondSubmitResponse = await submitDraftControlPublishRequest(
      organization.slug,
      secondDraft.id,
      member.headers,
    );
    const secondRequest = secondSubmitResponse.body.publishRequest as { id: string };

    await expect(
      updateControlApprovalPolicyRequest(organization.slug, ownerHeaders, {
        enabled: false,
        requiredApprovals: 1,
      }),
    ).resolves.toMatchObject({ status: 200 });
    await expect(
      publishControlPublishRequest(organization.slug, secondRequest.id, ownerHeaders),
    ).resolves.toMatchObject({
      body: {
        error:
          'Control Approval Policy requires an approved Control Publish Request before publishing.',
      },
      status: 400,
    });

    const thirdDraftResponse = await createDraftControlRequest(organization.slug, ownerHeaders, {
      controlCode: 'AUTH-038',
      title: 'Disabled policy direct publish',
    });
    const thirdDraft = thirdDraftResponse.body.draftControl as { id: string };

    await expect(
      publishDraftControlRequest(organization.slug, thirdDraft.id, ownerHeaders),
    ).resolves.toMatchObject({
      body: { control: { controlCode: 'CTL-003', currentVersion: { versionNumber: 1 } } },
      status: 201,
    });
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
        businessMeaning: '',
      },
    );

    expect(publishResponse.status).toBe(400);
    expect(publishResponse.body).toMatchObject({
      error: 'Business meaning is required.',
    });
  });

  it('lets Organization owners archive and restore published Controls with an optional reason', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner('archive-owner');

    const createResponse = await createDraftControlRequest(organization.slug, ownerHeaders, {
      controlCode: 'AUTH-008',
      title: 'Archive published Control',
    });
    const draftControl = createResponse.body.draftControl as { id: string };
    const publishResponse = await publishDraftControlRequest(
      organization.slug,
      draftControl.id,
      ownerHeaders,
    );
    const control = publishResponse.body.control as { id: string };

    const archiveResponse = await archiveControlRequest(
      organization.slug,
      control.id,
      ownerHeaders,
      {
        reason: 'Replaced by a stricter Control.',
      },
    );

    expect(archiveResponse.status).toBe(200);
    expect(archiveResponse.body.control).toMatchObject({
      archiveReason: 'Replaced by a stricter Control.',
      controlCode: 'CTL-001',
    });
    expect((archiveResponse.body.control as { archivedAt?: string }).archivedAt).toBeTruthy();

    await expect(listControlsRequest(organization.slug, ownerHeaders)).resolves.toMatchObject({
      body: { controls: [] },
      status: 200,
    });
    await expect(
      listControlsRequest(organization.slug, ownerHeaders, { status: 'archived' }),
    ).resolves.toMatchObject({
      body: { controls: [{ controlCode: 'CTL-001' }] },
      status: 200,
    });

    const restoreResponse = await restoreControlRequest(
      organization.slug,
      control.id,
      ownerHeaders,
    );

    expect(restoreResponse.status).toBe(200);
    expect(restoreResponse.body.control).toMatchObject({
      archivedAt: null,
      archiveReason: null,
      controlCode: 'CTL-001',
    });
    await expect(listControlsRequest(organization.slug, ownerHeaders)).resolves.toMatchObject({
      body: { controls: [{ controlCode: 'CTL-001' }] },
      status: 200,
    });
  });

  it('creates one proposed update for an active Control without changing the current version', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner('proposal-create');
    const createResponse = await createDraftControlRequest(organization.slug, ownerHeaders, {
      controlCode: 'AUTH-008',
      title: 'Require MFA',
    });
    const draftControl = createResponse.body.draftControl as { id: string };
    const publishResponse = await publishDraftControlRequest(
      organization.slug,
      draftControl.id,
      ownerHeaders,
    );
    const control = publishResponse.body.control as { id: string };

    const proposedBody = {
      ...completePublishBody,
      businessMeaning: 'Release teams must verify phishing-resistant authentication factors.',
      controlCode: 'AUTH-008',
      title: 'Require phishing-resistant MFA',
    };
    const proposedResponse = await createControlProposedUpdateRequest(
      organization.slug,
      control.id,
      ownerHeaders,
      proposedBody,
    );

    expect(proposedResponse.status).toBe(201);
    expect(proposedResponse.body.proposedUpdate).toMatchObject({
      businessMeaning: proposedBody.businessMeaning,
      controlCode: 'CTL-001',
      title: 'Require phishing-resistant MFA',
    });

    await expect(
      getControlRequest(organization.slug, control.id, ownerHeaders),
    ).resolves.toMatchObject({
      body: {
        control: {
          currentVersion: {
            businessMeaning: completePublishBody.businessMeaning,
            versionNumber: 1,
          },
          versions: [{ versionNumber: 1 }],
        },
      },
      status: 200,
    });
    await expect(
      createControlProposedUpdateRequest(organization.slug, control.id, ownerHeaders, proposedBody),
    ).resolves.toMatchObject({
      body: { error: 'This Control already has an open proposed update.' },
      status: 400,
    });
  });

  it('lets proposed Control updates be submitted as Control Publish Requests when policy is enabled', async () => {
    const { headers: ownerHeaders, organization } =
      await createSignedInOwner('proposal-request-owner');
    await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'proposal-request-admin',
      role: 'admin',
    });
    const member = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'proposal-request-member',
      role: 'member',
    });

    const createResponse = await createDraftControlRequest(organization.slug, ownerHeaders, {
      controlCode: 'AUTH-029',
      title: 'Require MFA before request',
    });
    const draftControl = createResponse.body.draftControl as { id: string };
    const publishResponse = await publishDraftControlRequest(
      organization.slug,
      draftControl.id,
      ownerHeaders,
    );
    const control = publishResponse.body.control as { id: string };

    await enableControlApprovalPolicy(organization.slug, ownerHeaders);

    const proposedResponse = await createControlProposedUpdateRequest(
      organization.slug,
      control.id,
      member.headers,
      {
        ...completePublishBody,
        businessMeaning: 'Updated proposed release assurance meaning.',
        controlCode: 'AUTH-029',
        title: 'Require MFA after request',
      },
    );
    const proposedUpdate = proposedResponse.body.proposedUpdate as { id: string };

    await expect(
      submitControlProposedUpdatePublishRequest(
        organization.slug,
        control.id,
        proposedUpdate.id,
        member.headers,
      ),
    ).resolves.toMatchObject({
      body: {
        publishRequest: {
          controlCode: 'CTL-001',
          controlId: control.id,
          proposedUpdateId: proposedUpdate.id,
          requestType: 'proposed_update',
          requiredApprovalCount: 1,
        },
      },
      status: 201,
    });
    await expect(
      publishControlProposedUpdateRequest(
        organization.slug,
        control.id,
        proposedUpdate.id,
        ownerHeaders,
      ),
    ).resolves.toMatchObject({
      body: {
        error:
          'Control Approval Policy requires an approved Control Publish Request before publishing.',
      },
      status: 400,
    });
  });

  it('lets Organization owners and admins reject open proposed Control updates', async () => {
    const { headers: ownerHeaders, organization } =
      await createSignedInOwner('proposal-reject-owner');
    const member = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'proposal-reject-member',
      role: 'member',
    });

    const createResponse = await createDraftControlRequest(organization.slug, ownerHeaders, {
      controlCode: 'AUTH-040',
      title: 'Require MFA before rejected update',
    });
    const draftControl = createResponse.body.draftControl as { id: string };
    const publishResponse = await publishDraftControlRequest(
      organization.slug,
      draftControl.id,
      ownerHeaders,
    );
    const control = publishResponse.body.control as { id: string };

    const proposedResponse = await createControlProposedUpdateRequest(
      organization.slug,
      control.id,
      member.headers,
      {
        ...completePublishBody,
        businessMeaning: 'Rejected release assurance meaning.',
        controlCode: 'AUTH-040',
        title: 'Require MFA after rejected update',
      },
    );
    const proposedUpdate = proposedResponse.body.proposedUpdate as { id: string };

    await expect(
      rejectControlProposedUpdateRequest(
        organization.slug,
        control.id,
        proposedUpdate.id,
        member.headers,
      ),
    ).resolves.toMatchObject({
      body: { error: 'Only Organization owners and admins can reject proposed Control updates.' },
      status: 403,
    });

    await expect(
      rejectControlProposedUpdateRequest(
        organization.slug,
        control.id,
        proposedUpdate.id,
        ownerHeaders,
      ),
    ).resolves.toMatchObject({
      body: { rejected: true },
      status: 200,
    });
    await expect(
      listControlProposedUpdatesRequest(organization.slug, ownerHeaders),
    ).resolves.toMatchObject({ body: { proposedUpdates: [] }, status: 200 });
  });

  it('restricts archived Control access and archive actions to Organization owners and admins', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner('archive-role-owner');
    const member = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'archive-role-member',
      role: 'member',
    });
    const admin = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'archive-role-admin',
      role: 'admin',
    });

    const createResponse = await createDraftControlRequest(organization.slug, ownerHeaders, {
      controlCode: 'AUTH-009',
      title: 'Restrict archived Control',
    });
    const draftControl = createResponse.body.draftControl as { id: string };
    const publishResponse = await publishDraftControlRequest(
      organization.slug,
      draftControl.id,
      ownerHeaders,
    );
    const control = publishResponse.body.control as { id: string };

    await expect(
      archiveControlRequest(organization.slug, control.id, member.headers),
    ).resolves.toMatchObject({ status: 403 });

    await archiveControlRequest(organization.slug, control.id, admin.headers);

    await expect(
      listControlsRequest(organization.slug, member.headers, { status: 'archived' }),
    ).resolves.toMatchObject({
      body: { error: 'Only Organization owners and admins can view archived Controls.' },
      status: 403,
    });
    await expect(
      getControlRequest(organization.slug, control.id, member.headers),
    ).resolves.toMatchObject({
      body: { error: 'Only Organization owners and admins can view archived Controls.' },
      status: 403,
    });
    await expect(
      restoreControlRequest(organization.slug, control.id, member.headers),
    ).resolves.toMatchObject({ status: 403 });
  });

  it('publishes a proposed update as the next Control Version and clears the open proposal', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner('proposal-publish');
    const createResponse = await createDraftControlRequest(organization.slug, ownerHeaders, {
      controlCode: 'AUTH-009',
      title: 'Require MFA before update',
    });
    const draftControl = createResponse.body.draftControl as { id: string };
    const publishResponse = await publishDraftControlRequest(
      organization.slug,
      draftControl.id,
      ownerHeaders,
    );
    const control = publishResponse.body.control as { id: string };

    const proposedResponse = await createControlProposedUpdateRequest(
      organization.slug,
      control.id,
      ownerHeaders,
      {
        ...completePublishBody,
        businessMeaning: 'Updated release assurance meaning.',
        controlCode: 'AUTH-009A',
        title: 'Require MFA after update',
      },
    );
    const proposedUpdate = proposedResponse.body.proposedUpdate as { id: string };

    const proposedPublishResponse = await publishControlProposedUpdateRequest(
      organization.slug,
      control.id,
      proposedUpdate.id,
      ownerHeaders,
    );

    expect(proposedPublishResponse.status).toBe(201);
    expect(proposedPublishResponse.body.control).toMatchObject({
      controlCode: 'CTL-001',
      currentVersion: {
        businessMeaning: 'Updated release assurance meaning.',
        title: 'Require MFA after update',
        versionNumber: 2,
      },
      versions: [{ versionNumber: 2 }, { versionNumber: 1 }],
    });

    const versions = await db
      .select()
      .from(controlVersions)
      .where(eq(controlVersions.controlId, control.id));
    expect(versions).toHaveLength(2);
    expect(versions.map((version) => version.versionNumber).sort()).toEqual([1, 2]);
    await expect(
      listControlProposedUpdatesRequest(organization.slug, ownerHeaders),
    ).resolves.toMatchObject({ body: { proposedUpdates: [] }, status: 200 });
  });

  it('keeps generated Control Codes reserved after archive and Draft Control cancellation', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner('code-reuse-owner');

    const publishedDraftResponse = await createDraftControlRequest(
      organization.slug,
      ownerHeaders,
      {
        controlCode: 'AUTH-010',
        title: 'Reserve archived code',
      },
    );
    const publishedDraft = publishedDraftResponse.body.draftControl as { id: string };
    const publishResponse = await publishDraftControlRequest(
      organization.slug,
      publishedDraft.id,
      ownerHeaders,
    );
    const control = publishResponse.body.control as { id: string };

    await archiveControlRequest(organization.slug, control.id, ownerHeaders);

    const nextDraftResponse = await createDraftControlRequest(organization.slug, ownerHeaders, {
      controlCode: 'AUTH-010',
      title: 'Reuse archived published code',
    });

    expect(nextDraftResponse.status).toBe(201);
    expect(nextDraftResponse.body.draftControl).toMatchObject({ controlCode: 'CTL-002' });

    const canceledDraftResponse = await createDraftControlRequest(organization.slug, ownerHeaders, {
      controlCode: 'AUTH-011',
      title: 'Reusable canceled draft',
    });
    const canceledDraft = canceledDraftResponse.body.draftControl as { id: string };

    await expect(
      cancelDraftControlRequest(organization.slug, canceledDraft.id, ownerHeaders),
    ).resolves.toMatchObject({ body: { canceled: true }, status: 200 });
    await expect(
      createDraftControlRequest(organization.slug, ownerHeaders, {
        controlCode: 'AUTH-011',
        title: 'Reused canceled draft code',
      }),
    ).resolves.toMatchObject({
      body: { draftControl: { controlCode: 'CTL-004' } },
      status: 201,
    });
  });
});
