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

async function addChecklistTemplateItemRequest(
  organizationSlug: string,
  templateId: string,
  headers: Headers,
  body: Record<string, unknown>,
) {
  const response = await app.request(
    `http://example.com/api/organizations/${organizationSlug}/checklist-templates/${templateId}/items`,
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

async function createChecklistTemplateSectionRequest(
  organizationSlug: string,
  templateId: string,
  headers: Headers,
  body: Record<string, unknown>,
) {
  const response = await app.request(
    `http://example.com/api/organizations/${organizationSlug}/checklist-templates/${templateId}/sections`,
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

async function renameChecklistTemplateSectionRequest(
  organizationSlug: string,
  templateId: string,
  sectionId: string,
  headers: Headers,
  body: Record<string, unknown>,
) {
  const response = await app.request(
    `http://example.com/api/organizations/${organizationSlug}/checklist-templates/${templateId}/sections/${sectionId}`,
    {
      body: JSON.stringify(body),
      headers,
      method: 'PATCH',
    },
  );

  return {
    body: (await response.json()) as Record<string, unknown>,
    status: response.status,
  };
}

async function reorderChecklistTemplateSectionsRequest(
  organizationSlug: string,
  templateId: string,
  headers: Headers,
  body: Record<string, unknown>,
) {
  const response = await app.request(
    `http://example.com/api/organizations/${organizationSlug}/checklist-templates/${templateId}/sections/order`,
    {
      body: JSON.stringify(body),
      headers,
      method: 'PATCH',
    },
  );

  return {
    body: (await response.json()) as Record<string, unknown>,
    status: response.status,
  };
}

async function reorderChecklistTemplateItemsRequest(
  organizationSlug: string,
  templateId: string,
  headers: Headers,
  body: Record<string, unknown>,
) {
  const response = await app.request(
    `http://example.com/api/organizations/${organizationSlug}/checklist-templates/${templateId}/items/order`,
    {
      body: JSON.stringify(body),
      headers,
      method: 'PATCH',
    },
  );

  return {
    body: (await response.json()) as Record<string, unknown>,
    status: response.status,
  };
}

async function removeChecklistTemplateItemRequest(
  organizationSlug: string,
  templateId: string,
  itemId: string,
  headers: Headers,
) {
  const response = await app.request(
    `http://example.com/api/organizations/${organizationSlug}/checklist-templates/${templateId}/items/${itemId}`,
    {
      headers,
      method: 'DELETE',
    },
  );

  return {
    body: (await response.json()) as Record<string, unknown>,
    status: response.status,
  };
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

async function archiveControlRequest(
  organizationSlug: string,
  controlId: string,
  headers: Headers,
) {
  const response = await app.request(
    `http://example.com/api/organizations/${organizationSlug}/controls/${controlId}/archive`,
    {
      body: JSON.stringify({ reason: 'No longer used for new Checklist Templates.' }),
      headers,
      method: 'PATCH',
    },
  );

  return {
    body: (await response.json()) as Record<string, unknown>,
    status: response.status,
  };
}

async function createActiveControl(
  organizationSlug: string,
  headers: Headers,
  input: { controlCode: string; title: string },
) {
  const draftResponse = await createDraftControlRequest(organizationSlug, headers, input);
  const draft = draftResponse.body.draftControl as { id: string };
  const publishResponse = await publishDraftControlRequest(organizationSlug, draft.id, headers);

  expect(draftResponse.status).toBe(201);
  expect(publishResponse.status).toBe(201);

  return publishResponse.body.control as { id: string };
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

async function archiveChecklistTemplateRequest(
  organizationSlug: string,
  templateId: string,
  headers: Headers,
) {
  const response = await app.request(
    `http://example.com/api/organizations/${organizationSlug}/checklist-templates/${templateId}/archive`,
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

async function restoreChecklistTemplateRequest(
  organizationSlug: string,
  templateId: string,
  headers: Headers,
) {
  const response = await app.request(
    `http://example.com/api/organizations/${organizationSlug}/checklist-templates/${templateId}/restore`,
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

  it('lets Organization owners and admins publish, archive, and restore Checklist Templates', async () => {
    const { headers, organization } = await createSignedInOwner('template-lifecycle');
    const admin = await createSignedInMember({
      ownerHeaders: headers,
      organizationId: organization.id,
      prefix: 'template-lifecycle-admin',
      role: 'admin',
    });

    const createResponse = await createChecklistTemplateRequest(organization.slug, headers, {
      name: 'Lifecycle Template',
    });
    const template = createResponse.body.checklistTemplate as { id: string };

    const publishResponse = await publishChecklistTemplateRequest(
      organization.slug,
      template.id,
      headers,
    );
    const publishedTemplate = publishResponse.body.checklistTemplate as {
      createdAt: string;
      id: string;
      publishedAt: string;
    };
    const archiveResponse = await archiveChecklistTemplateRequest(
      organization.slug,
      template.id,
      admin.headers,
    );
    const restoreResponse = await restoreChecklistTemplateRequest(
      organization.slug,
      template.id,
      admin.headers,
    );

    expect(publishResponse.status).toBe(200);
    expect(archiveResponse.status).toBe(200);
    expect(archiveResponse.body.checklistTemplate).toMatchObject({
      id: template.id,
      name: 'Lifecycle Template',
      status: 'archived',
    });
    expect(restoreResponse.status).toBe(200);
    expect(restoreResponse.body.checklistTemplate).toMatchObject({
      createdAt: publishedTemplate.createdAt,
      id: template.id,
      name: 'Lifecycle Template',
      publishedAt: publishedTemplate.publishedAt,
      status: 'active',
    });
  });

  it('shows archived Checklist Templates only to Organization owners and admins', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner(
      'template-archive-visibility',
    );
    const admin = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'template-archive-visibility-admin',
      role: 'admin',
    });
    const member = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'template-archive-visibility-member',
      role: 'member',
    });

    const createResponse = await createChecklistTemplateRequest(organization.slug, ownerHeaders, {
      name: 'Archived Release Template',
    });
    const template = createResponse.body.checklistTemplate as { id: string };

    await publishChecklistTemplateRequest(organization.slug, template.id, ownerHeaders);
    await archiveChecklistTemplateRequest(organization.slug, template.id, ownerHeaders);

    const ownerArchivedListResponse = await listChecklistTemplatesRequest(
      organization.slug,
      ownerHeaders,
      { status: 'archived' },
    );
    const adminArchivedListResponse = await listChecklistTemplatesRequest(
      organization.slug,
      admin.headers,
      { status: 'archived' },
    );
    const memberAllListResponse = await listChecklistTemplatesRequest(
      organization.slug,
      member.headers,
    );
    const memberArchivedListResponse = await listChecklistTemplatesRequest(
      organization.slug,
      member.headers,
      { status: 'archived' },
    );

    expect(ownerArchivedListResponse.status).toBe(200);
    expect(ownerArchivedListResponse.body).toMatchObject({
      checklistTemplates: [{ name: 'Archived Release Template', status: 'archived' }],
    });
    expect(adminArchivedListResponse.status).toBe(200);
    expect(adminArchivedListResponse.body).toMatchObject({
      checklistTemplates: [{ name: 'Archived Release Template', status: 'archived' }],
    });
    expect(memberAllListResponse.status).toBe(200);
    expect(memberAllListResponse.body).toMatchObject({ checklistTemplates: [] });
    expect(memberArchivedListResponse.status).toBe(403);
    expect(memberArchivedListResponse.body).toMatchObject({
      error: 'Only Organization owners and admins can view archived Checklist Templates.',
    });
  });

  it('prevents Organization members from publishing, archiving, or restoring Checklist Templates', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner('template-authz');
    const member = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'template-authz-member',
      role: 'member',
    });

    const draftResponse = await createChecklistTemplateRequest(organization.slug, ownerHeaders, {
      name: 'Protected Draft Template',
    });
    const draftTemplate = draftResponse.body.checklistTemplate as { id: string };
    const activeResponse = await createChecklistTemplateRequest(organization.slug, ownerHeaders, {
      name: 'Protected Active Template',
    });
    const activeTemplate = activeResponse.body.checklistTemplate as { id: string };

    await publishChecklistTemplateRequest(organization.slug, activeTemplate.id, ownerHeaders);
    await archiveChecklistTemplateRequest(organization.slug, activeTemplate.id, ownerHeaders);

    const publishResponse = await publishChecklistTemplateRequest(
      organization.slug,
      draftTemplate.id,
      member.headers,
    );
    const archiveResponse = await archiveChecklistTemplateRequest(
      organization.slug,
      activeTemplate.id,
      member.headers,
    );
    const restoreResponse = await restoreChecklistTemplateRequest(
      organization.slug,
      activeTemplate.id,
      member.headers,
    );

    expect(publishResponse.status).toBe(403);
    expect(publishResponse.body).toMatchObject({
      error: 'Only Organization owners and admins can publish Checklist Templates.',
    });
    expect(archiveResponse.status).toBe(403);
    expect(archiveResponse.body).toMatchObject({
      error: 'Only Organization owners and admins can archive Checklist Templates.',
    });
    expect(restoreResponse.status).toBe(403);
    expect(restoreResponse.body).toMatchObject({
      error: 'Only Organization owners and admins can restore Checklist Templates.',
    });
  });

  it('lets Organization owners add active Controls outside any Section and remove template items', async () => {
    const { headers, organization } = await createSignedInOwner('template-items-owner');
    const createTemplateResponse = await createChecklistTemplateRequest(
      organization.slug,
      headers,
      {
        name: 'Release Template',
      },
    );
    const template = createTemplateResponse.body.checklistTemplate as { id: string };
    const control = await createActiveControl(organization.slug, headers, {
      controlCode: 'AUTH-043',
      title: 'Require MFA',
    });

    const addResponse = await addChecklistTemplateItemRequest(
      organization.slug,
      template.id,
      headers,
      {
        controlId: control.id,
      },
    );

    expect(addResponse.status).toBe(201);
    expect(addResponse.body.checklistTemplate).toMatchObject({
      items: [
        {
          control: {
            archivedAt: null,
            controlCode: 'AUTH-043',
            id: control.id,
            title: 'Require MFA',
          },
          sectionId: null,
          requiresAdminAttention: false,
        },
      ],
      unsectionedItems: [
        {
          control: {
            archivedAt: null,
            controlCode: 'AUTH-043',
          },
          requiresAdminAttention: false,
          sectionId: null,
        },
      ],
    });

    const addedItem = (addResponse.body.checklistTemplate as { items: Array<{ id: string }> })
      .items[0]!;
    const removeResponse = await removeChecklistTemplateItemRequest(
      organization.slug,
      template.id,
      addedItem.id,
      headers,
    );

    expect(removeResponse.status).toBe(200);
    expect(removeResponse.body.checklistTemplate).toMatchObject({ items: [] });
  });

  it('prevents duplicate Control references in the same Checklist Template', async () => {
    const { headers, organization } = await createSignedInOwner('template-items-duplicate');
    const createTemplateResponse = await createChecklistTemplateRequest(
      organization.slug,
      headers,
      {
        name: 'Duplicate Guard Template',
      },
    );
    const template = createTemplateResponse.body.checklistTemplate as { id: string };
    const control = await createActiveControl(organization.slug, headers, {
      controlCode: 'AUTH-044',
      title: 'Require SSO',
    });

    await addChecklistTemplateItemRequest(organization.slug, template.id, headers, {
      controlId: control.id,
    });
    const duplicateResponse = await addChecklistTemplateItemRequest(
      organization.slug,
      template.id,
      headers,
      { controlId: control.id },
    );

    expect(duplicateResponse.status).toBe(400);
    expect(duplicateResponse.body).toMatchObject({
      error: 'Control is already included in this Checklist Template.',
    });
  });

  it('retains archived Control references and marks them for admin attention', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner(
      'template-items-archived-retained',
    );
    const member = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'template-items-archived-member',
      role: 'member',
    });
    const createTemplateResponse = await createChecklistTemplateRequest(
      organization.slug,
      ownerHeaders,
      { name: 'Archived Reference Template' },
    );
    const template = createTemplateResponse.body.checklistTemplate as { id: string };
    const control = await createActiveControl(organization.slug, ownerHeaders, {
      controlCode: 'AUTH-145',
      title: 'Retained Archived Control',
    });

    await addChecklistTemplateItemRequest(organization.slug, template.id, ownerHeaders, {
      controlId: control.id,
    });
    await publishChecklistTemplateRequest(organization.slug, template.id, ownerHeaders);

    const archiveResponse = await archiveControlRequest(
      organization.slug,
      control.id,
      ownerHeaders,
    );

    expect(archiveResponse.status).toBe(200);

    const ownerListResponse = await listChecklistTemplatesRequest(organization.slug, ownerHeaders, {
      status: 'active',
    });
    const memberListResponse = await listChecklistTemplatesRequest(
      organization.slug,
      member.headers,
      { status: 'active' },
    );

    for (const response of [ownerListResponse, memberListResponse]) {
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        checklistTemplates: [
          {
            items: [
              {
                control: {
                  archivedAt: expect.any(String),
                  controlCode: 'AUTH-145',
                  id: control.id,
                  title: 'Retained Archived Control',
                },
                requiresAdminAttention: true,
              },
            ],
            name: 'Archived Reference Template',
            status: 'active',
          },
        ],
      });
    }

    const addArchivedAgainResponse = await addChecklistTemplateItemRequest(
      organization.slug,
      template.id,
      ownerHeaders,
      { controlId: control.id },
    );

    expect(addArchivedAgainResponse.status).toBe(400);
    expect(addArchivedAgainResponse.body).toMatchObject({
      error: 'Only active, non-archived Controls can be added to Checklist Templates.',
    });
  });

  it('rejects Draft Controls, Archived Controls, and Controls from other Organizations', async () => {
    const { headers, organization } = await createSignedInOwner('template-items-eligibility');
    const other = await createSignedInOwner('template-items-other-org');
    const createTemplateResponse = await createChecklistTemplateRequest(
      organization.slug,
      headers,
      {
        name: 'Eligible Controls Template',
      },
    );
    const template = createTemplateResponse.body.checklistTemplate as { id: string };
    const draftResponse = await createDraftControlRequest(organization.slug, headers, {
      controlCode: 'AUTH-045',
      title: 'Draft Control',
    });
    const draftControl = draftResponse.body.draftControl as { id: string };
    const archivedControl = await createActiveControl(organization.slug, headers, {
      controlCode: 'AUTH-046',
      title: 'Archived Control',
    });
    const otherControl = await createActiveControl(other.organization.slug, other.headers, {
      controlCode: 'AUTH-047',
      title: 'Other Organization Control',
    });

    expect(
      (await archiveControlRequest(organization.slug, archivedControl.id, headers)).status,
    ).toBe(200);

    for (const controlId of [draftControl.id, archivedControl.id, otherControl.id]) {
      const response = await addChecklistTemplateItemRequest(
        organization.slug,
        template.id,
        headers,
        {
          controlId,
        },
      );

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: 'Only active, non-archived Controls can be added to Checklist Templates.',
      });
    }
  });

  it('prevents Organization members from adding or removing Checklist Template items', async () => {
    const { headers: ownerHeaders, organization } =
      await createSignedInOwner('template-items-auth');
    const member = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'template-items-auth-member',
      role: 'member',
    });
    const createTemplateResponse = await createChecklistTemplateRequest(
      organization.slug,
      ownerHeaders,
      { name: 'Authorization Template' },
    );
    const template = createTemplateResponse.body.checklistTemplate as { id: string };
    const control = await createActiveControl(organization.slug, ownerHeaders, {
      controlCode: 'AUTH-048',
      title: 'Owner Added Control',
    });
    const addResponse = await addChecklistTemplateItemRequest(
      organization.slug,
      template.id,
      ownerHeaders,
      { controlId: control.id },
    );
    const item = (addResponse.body.checklistTemplate as { items: Array<{ id: string }> }).items[0]!;

    const memberAddResponse = await addChecklistTemplateItemRequest(
      organization.slug,
      template.id,
      member.headers,
      { controlId: control.id },
    );
    const memberRemoveResponse = await removeChecklistTemplateItemRequest(
      organization.slug,
      template.id,
      item.id,
      member.headers,
    );

    expect(memberAddResponse.status).toBe(403);
    expect(memberRemoveResponse.status).toBe(403);
  });

  it('lets Organization owners create, rename, and reorder local Checklist Template Sections', async () => {
    const { headers, organization } = await createSignedInOwner('template-sections-owner');
    const createTemplateResponse = await createChecklistTemplateRequest(
      organization.slug,
      headers,
      {
        name: 'Sectioned Template',
      },
    );
    const template = createTemplateResponse.body.checklistTemplate as { id: string };

    const firstResponse = await createChecklistTemplateSectionRequest(
      organization.slug,
      template.id,
      headers,
      { name: 'Access' },
    );
    const secondResponse = await createChecklistTemplateSectionRequest(
      organization.slug,
      template.id,
      headers,
      { name: 'Monitoring' },
    );

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);

    const sections = (secondResponse.body.checklistTemplate as { sections: Array<{ id: string }> })
      .sections;
    const accessSection = sections[0]!;
    const monitoringSection = sections[1]!;
    const renameResponse = await renameChecklistTemplateSectionRequest(
      organization.slug,
      template.id,
      accessSection.id,
      headers,
      { name: 'Identity' },
    );
    const reorderResponse = await reorderChecklistTemplateSectionsRequest(
      organization.slug,
      template.id,
      headers,
      { sectionIds: [monitoringSection.id, accessSection.id] },
    );

    expect(renameResponse.status).toBe(200);
    expect(renameResponse.body.checklistTemplate).toMatchObject({
      sections: [{ name: 'Identity' }, { name: 'Monitoring' }],
    });
    expect(reorderResponse.status).toBe(200);
    expect(reorderResponse.body.checklistTemplate).toMatchObject({
      sections: [
        { displayOrder: 0, name: 'Monitoring' },
        { displayOrder: 1, name: 'Identity' },
      ],
    });
  });

  it('requires Section names to be unique within one Checklist Template only', async () => {
    const { headers, organization } = await createSignedInOwner('template-sections-unique');
    const firstTemplateResponse = await createChecklistTemplateRequest(organization.slug, headers, {
      name: 'First Section Template',
    });
    const secondTemplateResponse = await createChecklistTemplateRequest(
      organization.slug,
      headers,
      {
        name: 'Second Section Template',
      },
    );
    const firstTemplate = firstTemplateResponse.body.checklistTemplate as { id: string };
    const secondTemplate = secondTemplateResponse.body.checklistTemplate as { id: string };

    await createChecklistTemplateSectionRequest(organization.slug, firstTemplate.id, headers, {
      name: 'Evidence',
    });
    const duplicateResponse = await createChecklistTemplateSectionRequest(
      organization.slug,
      firstTemplate.id,
      headers,
      { name: ' evidence ' },
    );
    const otherTemplateResponse = await createChecklistTemplateSectionRequest(
      organization.slug,
      secondTemplate.id,
      headers,
      { name: 'Evidence' },
    );

    expect(duplicateResponse.status).toBe(400);
    expect(duplicateResponse.body).toMatchObject({
      error: 'Checklist Template Section name is already used in this Checklist Template.',
    });
    expect(otherTemplateResponse.status).toBe(201);
  });

  it('assigns items to optional Sections and reorders them for display', async () => {
    const { headers, organization } = await createSignedInOwner('template-items-ordering');
    const createTemplateResponse = await createChecklistTemplateRequest(
      organization.slug,
      headers,
      {
        name: 'Grouped Template',
      },
    );
    const template = createTemplateResponse.body.checklistTemplate as { id: string };
    const sectionResponse = await createChecklistTemplateSectionRequest(
      organization.slug,
      template.id,
      headers,
      { name: 'Identity' },
    );
    const section = (sectionResponse.body.checklistTemplate as { sections: Array<{ id: string }> })
      .sections[0]!;
    const firstControl = await createActiveControl(organization.slug, headers, {
      controlCode: 'AUTH-049',
      title: 'Require MFA',
    });
    const secondControl = await createActiveControl(organization.slug, headers, {
      controlCode: 'AUTH-050',
      title: 'Require SSO',
    });

    const firstItemResponse = await addChecklistTemplateItemRequest(
      organization.slug,
      template.id,
      headers,
      { controlId: firstControl.id, sectionId: section.id },
    );
    const secondItemResponse = await addChecklistTemplateItemRequest(
      organization.slug,
      template.id,
      headers,
      { controlId: secondControl.id },
    );
    const firstItem = (firstItemResponse.body.checklistTemplate as { items: Array<{ id: string }> })
      .items[0]!;
    const secondItem = (
      secondItemResponse.body.checklistTemplate as { items: Array<{ id: string }> }
    ).items.find(({ id }) => id !== firstItem.id)!;
    const reorderResponse = await reorderChecklistTemplateItemsRequest(
      organization.slug,
      template.id,
      headers,
      {
        items: [
          { id: secondItem.id, sectionId: section.id },
          { id: firstItem.id, sectionId: null },
        ],
      },
    );

    expect(reorderResponse.status).toBe(200);
    expect(reorderResponse.body.checklistTemplate).toMatchObject({
      sections: [
        {
          items: [
            {
              control: { controlCode: 'AUTH-050' },
              displayOrder: 0,
              sectionId: section.id,
            },
          ],
          name: 'Identity',
        },
      ],
      unsectionedItems: [
        {
          control: { controlCode: 'AUTH-049' },
          displayOrder: 0,
          sectionId: null,
        },
      ],
    });
  });

  it('prevents Organization members from managing Sections or item display order', async () => {
    const { headers: ownerHeaders, organization } =
      await createSignedInOwner('template-sections-auth');
    const member = await createSignedInMember({
      ownerHeaders,
      organizationId: organization.id,
      prefix: 'template-sections-auth-member',
      role: 'member',
    });
    const createTemplateResponse = await createChecklistTemplateRequest(
      organization.slug,
      ownerHeaders,
      { name: 'Section Auth Template' },
    );
    const template = createTemplateResponse.body.checklistTemplate as { id: string };
    const sectionResponse = await createChecklistTemplateSectionRequest(
      organization.slug,
      template.id,
      ownerHeaders,
      { name: 'Owner Section' },
    );
    const section = (sectionResponse.body.checklistTemplate as { sections: Array<{ id: string }> })
      .sections[0]!;

    const memberCreateSectionResponse = await createChecklistTemplateSectionRequest(
      organization.slug,
      template.id,
      member.headers,
      { name: 'Member Section' },
    );
    const memberRenameSectionResponse = await renameChecklistTemplateSectionRequest(
      organization.slug,
      template.id,
      section.id,
      member.headers,
      { name: 'Renamed' },
    );
    const memberReorderSectionsResponse = await reorderChecklistTemplateSectionsRequest(
      organization.slug,
      template.id,
      member.headers,
      { sectionIds: [section.id] },
    );
    const memberReorderItemsResponse = await reorderChecklistTemplateItemsRequest(
      organization.slug,
      template.id,
      member.headers,
      { items: [] },
    );

    expect(memberCreateSectionResponse.status).toBe(403);
    expect(memberRenameSectionResponse.status).toBe(403);
    expect(memberReorderSectionsResponse.status).toBe(403);
    expect(memberReorderItemsResponse.status).toBe(403);
  });
});
