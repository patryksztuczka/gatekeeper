import { and, eq, inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import app from '../src/index';
import { db } from '../src/db/client';
import {
  checklistTemplateItems,
  checklistTemplateSections,
  checklistTemplates,
  controlVersions,
  controls,
  members,
  projectChecklistItems,
  projectChecklists,
  projectChecklistVerificationHistory,
  projectChecklistVerificationRecords,
  projectComponents,
  projects,
  users,
} from '../src/db/schema';
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

  return new Headers({
    ...authHeaders,
    cookie: sessionCookie.split(';', 1)[0] ?? sessionCookie,
  });
}

async function getUserByEmail(email: string) {
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  expect(user).toBeTruthy();

  if (!user) {
    throw new Error('Expected user to exist.');
  }

  return user;
}

async function getMember(organizationId: string, userId: string) {
  const member = await db
    .select()
    .from(members)
    .where(and(eq(members.organizationId, organizationId), eq(members.userId, userId)))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  expect(member).toBeTruthy();

  if (!member) {
    throw new Error('Expected organization member to exist.');
  }

  return member;
}

async function createSignedInOwner(prefix: string) {
  const credentials = createCredentials(prefix);
  await signUpUser(credentials);
  const headers = await signInUser(credentials);
  const organization = (await auth.api.listOrganizations({ headers }))[0];
  const user = await getUserByEmail(credentials.email);

  expect(organization).toBeTruthy();

  if (!organization) {
    throw new Error('Expected default organization to exist.');
  }

  return {
    headers,
    member: await getMember(organization.id, user.id),
    organization,
  };
}

async function addMemberToOrganization(
  organizationId: string,
  prefix: string,
  role: 'admin' | 'member' = 'member',
) {
  const credentials = createCredentials(prefix);
  await signUpUser(credentials);
  const user = await getUserByEmail(credentials.email);
  const memberId = crypto.randomUUID();

  await db.insert(members).values({
    id: memberId,
    organizationId,
    role,
    userId: user.id,
  });

  return {
    headers: await signInUser(credentials),
    memberId,
  };
}

async function createProject(input: {
  archived?: boolean;
  organizationId: string;
  projectOwnerMemberId: string | null;
  slug: string;
}) {
  const now = new Date();
  const id = crypto.randomUUID();

  await db.insert(projects).values({
    archivedAt: input.archived ? now : null,
    createdAt: now,
    description: 'Governance work for reviewing critical vendor risk.',
    id,
    name: 'Vendor Risk Review',
    organizationId: input.organizationId,
    projectOwnerMemberId: input.projectOwnerMemberId,
    slug: input.slug,
    updatedAt: now,
  });

  return id;
}

async function createComponent(projectId: string, name = 'Payments Platform', archived = false) {
  const now = new Date();
  const id = crypto.randomUUID();

  await db.insert(projectComponents).values({
    archivedAt: archived ? now : null,
    createdAt: now,
    description: null,
    id,
    name,
    projectId,
    updatedAt: now,
  });

  return id;
}

async function createActiveControl(input: {
  controlCode: string;
  organizationId: string;
  releaseImpact?: string;
  title: string;
}) {
  const controlId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const now = new Date();

  await db.insert(controls).values({
    archivedAt: null,
    archivedByMemberId: null,
    archiveReason: null,
    createdAt: now,
    currentControlCode: input.controlCode,
    currentVersionId: versionId,
    id: controlId,
    organizationId: input.organizationId,
    updatedAt: now,
  });
  await db.insert(controlVersions).values({
    acceptedEvidenceTypes: JSON.stringify(['document']),
    applicabilityConditions: 'Applies to this component.',
    businessMeaning: 'Required release assurance.',
    controlCode: input.controlCode,
    controlId,
    createdAt: now,
    externalStandardsMappings: JSON.stringify([]),
    id: versionId,
    releaseImpact: input.releaseImpact ?? 'blocking',
    title: input.title,
    verificationMethod: 'Review evidence.',
    versionNumber: 1,
  });

  return { controlId, versionId };
}

async function addLatestControlVersion(controlId: string, controlCode: string, title: string) {
  const versionId = crypto.randomUUID();

  await db.insert(controlVersions).values({
    acceptedEvidenceTypes: JSON.stringify(['document']),
    applicabilityConditions: 'Applies to this component.',
    businessMeaning: 'Updated release assurance.',
    controlCode,
    controlId,
    createdAt: new Date(),
    externalStandardsMappings: JSON.stringify([]),
    id: versionId,
    releaseImpact: 'needs review',
    title,
    verificationMethod: 'Review updated evidence.',
    versionNumber: 2,
  });
  await db.update(controls).set({ currentVersionId: versionId }).where(eq(controls.id, controlId));

  return versionId;
}

async function createTemplate(input: {
  controlIds: string[];
  name?: string;
  organizationId: string;
  status?: 'active' | 'archived' | 'draft';
}) {
  const now = new Date();
  const templateId = crypto.randomUUID();

  await db.insert(checklistTemplates).values({
    authorMemberId: (
      await db
        .select()
        .from(members)
        .where(eq(members.organizationId, input.organizationId))
        .limit(1)
    )[0]!.id,
    createdAt: now,
    id: templateId,
    name: input.name ?? 'Release Readiness',
    normalizedName: (input.name ?? 'Release Readiness').toLowerCase(),
    organizationId: input.organizationId,
    publishedAt: input.status === 'active' ? now : null,
    status: input.status ?? 'active',
    updatedAt: now,
  });

  for (const [displayOrder, controlId] of input.controlIds.entries()) {
    await db.insert(checklistTemplateItems).values({
      controlId,
      createdAt: now,
      displayOrder,
      id: crypto.randomUUID(),
      sectionId: null,
      templateId,
    });
  }

  return templateId;
}

async function applyTemplate(input: {
  body: Record<string, unknown>;
  componentId: string;
  headers: Headers;
  organizationSlug: string;
  projectSlug: string;
}) {
  const response = await app.request(
    `http://example.com/api/organizations/${input.organizationSlug}/projects/${input.projectSlug}/components/${input.componentId}/checklists`,
    {
      body: JSON.stringify(input.body),
      headers: input.headers,
      method: 'POST',
    },
  );

  return {
    body: (await response.json()) as Record<string, unknown>,
    status: response.status,
  };
}

async function openChecklist(input: {
  checklistId: string;
  componentId: string;
  headers: Headers;
  includeRemovedFromTemplate?: boolean;
  organizationSlug: string;
  projectSlug: string;
}) {
  const query = input.includeRemovedFromTemplate ? '?includeRemovedFromTemplate=true' : '';
  const response = await app.request(
    `http://example.com/api/organizations/${input.organizationSlug}/projects/${input.projectSlug}/components/${input.componentId}/checklists/${input.checklistId}${query}`,
    { headers: input.headers },
  );

  return {
    body: (await response.json()) as Record<string, unknown>,
    status: response.status,
  };
}

async function addChecklistTemplateItem(input: {
  controlId: string;
  headers: Headers;
  organizationSlug: string;
  templateId: string;
}) {
  const response = await app.request(
    `http://example.com/api/organizations/${input.organizationSlug}/checklist-templates/${input.templateId}/items`,
    {
      body: JSON.stringify({ controlId: input.controlId }),
      headers: input.headers,
      method: 'POST',
    },
  );

  return {
    body: (await response.json()) as Record<string, unknown>,
    status: response.status,
  };
}

async function removeChecklistTemplateItem(input: {
  headers: Headers;
  itemId: string;
  organizationSlug: string;
  templateId: string;
}) {
  const response = await app.request(
    `http://example.com/api/organizations/${input.organizationSlug}/checklist-templates/${input.templateId}/items/${input.itemId}`,
    {
      headers: input.headers,
      method: 'DELETE',
    },
  );

  return {
    body: (await response.json()) as Record<string, unknown>,
    status: response.status,
  };
}

async function updateChecklistItemVerification(input: {
  body: Record<string, unknown>;
  checklistId: string;
  componentId: string;
  headers: Headers;
  itemId: string;
  organizationSlug: string;
  projectSlug: string;
}) {
  const response = await app.request(
    `http://example.com/api/organizations/${input.organizationSlug}/projects/${input.projectSlug}/components/${input.componentId}/checklists/${input.checklistId}/items/${input.itemId}/verification`,
    {
      body: JSON.stringify(input.body),
      headers: input.headers,
      method: 'PATCH',
    },
  );

  return {
    body: (await response.json()) as Record<string, unknown>,
    status: response.status,
  };
}

async function createControlProposedUpdate(input: {
  body: Record<string, unknown>;
  controlId: string;
  headers: Headers;
  organizationSlug: string;
}) {
  const response = await app.request(
    `http://example.com/api/organizations/${input.organizationSlug}/controls/${input.controlId}/proposed-updates`,
    {
      body: JSON.stringify(input.body),
      headers: input.headers,
      method: 'POST',
    },
  );

  return {
    body: (await response.json()) as Record<string, unknown>,
    status: response.status,
  };
}

async function publishControlProposedUpdate(input: {
  controlId: string;
  headers: Headers;
  organizationSlug: string;
  proposedUpdateId: string;
}) {
  const response = await app.request(
    `http://example.com/api/organizations/${input.organizationSlug}/controls/${input.controlId}/proposed-updates/${input.proposedUpdateId}/publish`,
    {
      headers: input.headers,
      method: 'POST',
    },
  );

  return {
    body: (await response.json()) as Record<string, unknown>,
    status: response.status,
  };
}

async function setChecklistArchived(input: {
  archived: boolean;
  checklistId: string;
  componentId: string;
  headers: Headers;
  organizationSlug: string;
  projectSlug: string;
}) {
  const response = await app.request(
    `http://example.com/api/organizations/${input.organizationSlug}/projects/${input.projectSlug}/components/${input.componentId}/checklists/${input.checklistId}/${input.archived ? 'archive' : 'restore'}`,
    {
      headers: input.headers,
      method: 'PATCH',
    },
  );

  return {
    body: (await response.json()) as Record<string, unknown>,
    status: response.status,
  };
}

async function getUncheckedCurrentRequirementsReport(input: {
  headers?: Headers;
  organizationSlug: string;
}) {
  const response = await app.request(
    `http://example.com/api/organizations/${input.organizationSlug}/reports/unchecked-current-requirements`,
    input.headers ? { headers: input.headers } : undefined,
  );

  return {
    body: (await response.json()) as Record<string, unknown>,
    status: response.status,
  };
}

async function getOutdatedControlVersionsReport(input: {
  headers?: Headers;
  includeArchived?: boolean;
  organizationSlug: string;
}) {
  const query = input.includeArchived ? '?includeArchived=true' : '';
  const response = await app.request(
    `http://example.com/api/organizations/${input.organizationSlug}/reports/outdated-control-versions${query}`,
    input.headers ? { headers: input.headers } : undefined,
  );

  return {
    body: (await response.json()) as Record<string, unknown>,
    status: response.status,
  };
}

async function setComponentArchived(input: {
  archived: boolean;
  componentId: string;
  headers: Headers;
  organizationSlug: string;
  projectSlug: string;
}) {
  const response = await app.request(
    `http://example.com/api/organizations/${input.organizationSlug}/projects/${input.projectSlug}/components/${input.componentId}/${input.archived ? 'archive' : 'restore'}`,
    {
      headers: input.headers,
      method: 'PATCH',
    },
  );

  return {
    body: (await response.json()) as Record<string, unknown>,
    status: response.status,
  };
}

async function setProjectArchived(input: {
  archived: boolean;
  headers: Headers;
  organizationSlug: string;
  projectSlug: string;
}) {
  const response = await app.request(
    `http://example.com/api/organizations/${input.organizationSlug}/projects/${input.projectSlug}/${input.archived ? 'archive' : 'restore'}`,
    {
      headers: input.headers,
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

describe('Project Checklists API', () => {
  it('reports unchecked current requirements to Organization members only', async () => {
    const owner = await createSignedInOwner('unchecked-report-owner');
    const member = await addMemberToOrganization(owner.organization.id, 'unchecked-report-member');
    const outsider = await createSignedInOwner('unchecked-report-outsider');
    const projectId = await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'vendor-risk',
    });
    const componentId = await createComponent(projectId, 'Active Component');
    const neverVerifiedControl = await createActiveControl({
      controlCode: 'AUTH-055',
      organizationId: owner.organization.id,
      title: 'Require MFA enrollment',
    });
    const notApplicableControl = await createActiveControl({
      controlCode: 'LOG-055',
      organizationId: owner.organization.id,
      title: 'Require centralized logs',
    });
    const removedControl = await createActiveControl({
      controlCode: 'NET-055',
      organizationId: owner.organization.id,
      title: 'Require network review',
    });
    const staleControl = await createActiveControl({
      controlCode: 'OPS-055',
      organizationId: owner.organization.id,
      title: 'Require operational readiness',
    });
    const updatedControl = await createActiveControl({
      controlCode: 'SEC-055',
      organizationId: owner.organization.id,
      title: 'Require security approval',
    });
    const templateId = await createTemplate({
      controlIds: [
        neverVerifiedControl.controlId,
        notApplicableControl.controlId,
        removedControl.controlId,
        staleControl.controlId,
        updatedControl.controlId,
      ],
      organizationId: owner.organization.id,
    });
    const checklist = (
      await applyTemplate({
        body: { templateId },
        componentId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      })
    ).body.projectChecklist as {
      id: string;
      items: Array<{ control: { id: string }; id: string }>;
    };
    const itemByControlId = new Map(checklist.items.map((item) => [item.control.id, item]));

    await updateChecklistItemVerification({
      body: {
        notApplicableExplanation: 'This Project Component does not process audit logs.',
        status: 'not-applicable',
      },
      checklistId: checklist.id,
      componentId,
      headers: owner.headers,
      itemId: itemByControlId.get(notApplicableControl.controlId)!.id,
      organizationSlug: owner.organization.slug,
      projectSlug: 'vendor-risk',
    });
    await updateChecklistItemVerification({
      body: { status: 'checked' },
      checklistId: checklist.id,
      componentId,
      headers: owner.headers,
      itemId: itemByControlId.get(updatedControl.controlId)!.id,
      organizationSlug: owner.organization.slug,
      projectSlug: 'vendor-risk',
    });

    const removedTemplateItem = await db
      .select({ id: checklistTemplateItems.id })
      .from(checklistTemplateItems)
      .where(
        and(
          eq(checklistTemplateItems.templateId, templateId),
          eq(checklistTemplateItems.controlId, removedControl.controlId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]!);

    await removeChecklistTemplateItem({
      headers: owner.headers,
      itemId: removedTemplateItem.id,
      organizationSlug: owner.organization.slug,
      templateId,
    });
    await addLatestControlVersion(staleControl.controlId, 'OPS-055', 'Require current operations');

    const proposedResponse = await createControlProposedUpdate({
      body: {
        acceptedEvidenceTypes: ['document'],
        applicabilityConditions: 'Applies to active Project Checklist Items.',
        businessMeaning: 'Updated security approval requires fresh verification.',
        controlCode: 'SEC-055',
        externalStandardsMappings: [],
        releaseImpact: 'blocking',
        title: 'Require refreshed security approval',
        verificationMethod: 'Review updated approval evidence.',
      },
      controlId: updatedControl.controlId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
    });
    await publishControlProposedUpdate({
      controlId: updatedControl.controlId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
      proposedUpdateId: (proposedResponse.body.proposedUpdate as { id: string }).id,
    });

    const archivedProjectId = await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'archived-report-project',
    });
    const archivedProjectComponentId = await createComponent(archivedProjectId, 'Archived Project');
    const archivedComponentProjectId = await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'archived-report-component',
    });
    const archivedComponentId = await createComponent(
      archivedComponentProjectId,
      'Archived Component',
    );
    const archivedChecklistProjectId = await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'archived-report-checklist',
    });
    const archivedChecklistComponentId = await createComponent(
      archivedChecklistProjectId,
      'Archived Checklist',
    );

    for (const [slug, archivedComponent] of [
      ['archived-report-project', archivedProjectComponentId],
      ['archived-report-component', archivedComponentId],
      ['archived-report-checklist', archivedChecklistComponentId],
    ] as const) {
      await applyTemplate({
        body: { templateId },
        componentId: archivedComponent,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: slug,
      });
    }
    await db
      .update(projects)
      .set({ archivedAt: new Date() })
      .where(eq(projects.id, archivedProjectId));
    await db
      .update(projectComponents)
      .set({ archivedAt: new Date() })
      .where(eq(projectComponents.id, archivedComponentId));
    await db
      .update(projectChecklists)
      .set({ archivedAt: new Date() })
      .where(eq(projectChecklists.componentId, archivedChecklistComponentId));

    await expect(
      getUncheckedCurrentRequirementsReport({ organizationSlug: owner.organization.slug }),
    ).resolves.toMatchObject({ body: { error: 'Unauthorized' }, status: 401 });
    await expect(
      getUncheckedCurrentRequirementsReport({
        headers: outsider.headers,
        organizationSlug: owner.organization.slug,
      }),
    ).resolves.toMatchObject({ body: { error: 'Organization not found' }, status: 404 });

    const reportResponse = await getUncheckedCurrentRequirementsReport({
      headers: member.headers,
      organizationSlug: owner.organization.slug,
    });
    const requirements = reportResponse.body.uncheckedCurrentRequirements as Array<{
      control: { controlCode: string; title: string };
      controlVersion: { versionNumber: number };
      project: { slug: string };
      projectChecklistItem: { id: string };
      uncheckedReason: string;
      verificationRecord: { status: string };
    }>;

    expect(reportResponse.status).toBe(200);
    expect(requirements).toHaveLength(2);
    expect(requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          control: expect.objectContaining({ controlCode: 'AUTH-055' }),
          controlVersion: expect.objectContaining({ versionNumber: 1 }),
          project: expect.objectContaining({ slug: 'vendor-risk' }),
          projectChecklistItem: { id: itemByControlId.get(neverVerifiedControl.controlId)!.id },
          uncheckedReason: 'never-verified',
          verificationRecord: expect.objectContaining({ status: 'unchecked' }),
        }),
        expect.objectContaining({
          control: expect.objectContaining({ controlCode: 'SEC-055' }),
          controlVersion: expect.objectContaining({ versionNumber: 2 }),
          project: expect.objectContaining({ slug: 'vendor-risk' }),
          projectChecklistItem: { id: itemByControlId.get(updatedControl.controlId)!.id },
          uncheckedReason: 'new-control-version',
          verificationRecord: expect.objectContaining({ status: 'unchecked' }),
        }),
      ]),
    );
  });

  it('reports outdated Control Versions with active-work defaults and archived-work access control', async () => {
    const owner = await createSignedInOwner('outdated-report-owner');
    const admin = await addMemberToOrganization(
      owner.organization.id,
      'outdated-report-admin',
      'admin',
    );
    const member = await addMemberToOrganization(owner.organization.id, 'outdated-report-member');
    const outsider = await createSignedInOwner('outdated-report-outsider');
    const projectId = await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'outdated-active-work',
    });
    const componentId = await createComponent(projectId, 'Active Outdated Component');
    const outdatedControl = await createActiveControl({
      controlCode: 'AUTH-054',
      organizationId: owner.organization.id,
      title: 'Require access review',
    });
    const neverVerifiedControl = await createActiveControl({
      controlCode: 'LOG-054',
      organizationId: owner.organization.id,
      title: 'Require log review',
    });
    const refreshedControl = await createActiveControl({
      controlCode: 'SEC-054',
      organizationId: owner.organization.id,
      title: 'Require security review',
    });
    const templateId = await createTemplate({
      controlIds: [
        outdatedControl.controlId,
        neverVerifiedControl.controlId,
        refreshedControl.controlId,
      ],
      organizationId: owner.organization.id,
    });
    const activeChecklist = (
      await applyTemplate({
        body: { templateId },
        componentId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'outdated-active-work',
      })
    ).body.projectChecklist as {
      id: string;
      items: Array<{ control: { id: string }; id: string }>;
    };
    const activeItemByControlId = new Map(
      activeChecklist.items.map((item) => [item.control.id, item]),
    );

    await updateChecklistItemVerification({
      body: { status: 'checked' },
      checklistId: activeChecklist.id,
      componentId,
      headers: owner.headers,
      itemId: activeItemByControlId.get(outdatedControl.controlId)!.id,
      organizationSlug: owner.organization.slug,
      projectSlug: 'outdated-active-work',
    });
    await updateChecklistItemVerification({
      body: { status: 'checked' },
      checklistId: activeChecklist.id,
      componentId,
      headers: owner.headers,
      itemId: activeItemByControlId.get(refreshedControl.controlId)!.id,
      organizationSlug: owner.organization.slug,
      projectSlug: 'outdated-active-work',
    });

    const archivedProjectId = await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'outdated-archived-project',
    });
    const archivedProjectComponentId = await createComponent(
      archivedProjectId,
      'Outdated Archived Project Component',
    );
    const archivedComponentProjectId = await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'outdated-archived-component',
    });
    const archivedComponentId = await createComponent(
      archivedComponentProjectId,
      'Outdated Archived Component',
    );
    const archivedChecklistProjectId = await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'outdated-archived-checklist',
    });
    const archivedChecklistComponentId = await createComponent(
      archivedChecklistProjectId,
      'Outdated Archived Checklist Component',
    );

    for (const [slug, archivedComponent] of [
      ['outdated-archived-project', archivedProjectComponentId],
      ['outdated-archived-component', archivedComponentId],
      ['outdated-archived-checklist', archivedChecklistComponentId],
    ] as const) {
      await applyTemplate({
        body: { templateId },
        componentId: archivedComponent,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: slug,
      });
    }

    const proposedResponse = await createControlProposedUpdate({
      body: {
        acceptedEvidenceTypes: ['document'],
        applicabilityConditions: 'Applies to active Project Checklist Items.',
        businessMeaning: 'Updated security review requires fresh verification.',
        controlCode: 'SEC-054',
        externalStandardsMappings: [],
        releaseImpact: 'blocking',
        title: 'Require refreshed security review',
        verificationMethod: 'Review updated security evidence.',
      },
      controlId: refreshedControl.controlId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
    });
    await publishControlProposedUpdate({
      controlId: refreshedControl.controlId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
      proposedUpdateId: (proposedResponse.body.proposedUpdate as { id: string }).id,
    });
    const latestOutdatedVersionId = await addLatestControlVersion(
      outdatedControl.controlId,
      'AUTH-054',
      'Require refreshed access review',
    );

    await db
      .update(projects)
      .set({ archivedAt: new Date() })
      .where(eq(projects.id, archivedProjectId));
    await db
      .update(projectComponents)
      .set({ archivedAt: new Date() })
      .where(eq(projectComponents.id, archivedComponentId));
    await db
      .update(projectChecklists)
      .set({ archivedAt: new Date() })
      .where(eq(projectChecklists.componentId, archivedChecklistComponentId));

    await expect(
      getOutdatedControlVersionsReport({ organizationSlug: owner.organization.slug }),
    ).resolves.toMatchObject({ body: { error: 'Unauthorized' }, status: 401 });
    await expect(
      getOutdatedControlVersionsReport({
        headers: outsider.headers,
        organizationSlug: owner.organization.slug,
      }),
    ).resolves.toMatchObject({ body: { error: 'Organization not found' }, status: 404 });
    await expect(
      getOutdatedControlVersionsReport({
        headers: member.headers,
        includeArchived: true,
        organizationSlug: owner.organization.slug,
      }),
    ).resolves.toMatchObject({ status: 403 });

    const activeReportResponse = await getOutdatedControlVersionsReport({
      headers: member.headers,
      organizationSlug: owner.organization.slug,
    });
    const activeOutdatedItems = activeReportResponse.body.outdatedControlVersions as Array<{
      control: { controlCode: string };
      latestControlVersion: { id: string; versionNumber: number };
      pinnedControlVersion: { id: string; versionNumber: number };
      project: { archivedAt: string | null; slug: string };
      projectChecklist: { archivedAt: string | null; displayName: string };
      projectChecklistItem: { id: string };
      projectComponent: { archivedAt: string | null; name: string };
      verificationRecord: { status: string };
    }>;

    expect(activeReportResponse.status).toBe(200);
    expect(activeOutdatedItems).toEqual([
      expect.objectContaining({
        control: expect.objectContaining({ controlCode: 'AUTH-054' }),
        latestControlVersion: { id: latestOutdatedVersionId, versionNumber: 2 },
        pinnedControlVersion: {
          id: outdatedControl.versionId,
          versionNumber: 1,
        },
        project: expect.objectContaining({ archivedAt: null, slug: 'outdated-active-work' }),
        projectChecklist: expect.objectContaining({ archivedAt: null }),
        projectChecklistItem: { id: activeItemByControlId.get(outdatedControl.controlId)!.id },
        projectComponent: expect.objectContaining({
          archivedAt: null,
          name: 'Active Outdated Component',
        }),
        verificationRecord: expect.objectContaining({ status: 'checked' }),
      }),
    ]);
    expect(activeOutdatedItems.map((item) => item.control.controlCode)).not.toContain('LOG-054');
    expect(activeOutdatedItems.map((item) => item.control.controlCode)).not.toContain('SEC-054');

    const archivedReportResponse = await getOutdatedControlVersionsReport({
      headers: admin.headers,
      includeArchived: true,
      organizationSlug: owner.organization.slug,
    });
    const archivedOutdatedItems = archivedReportResponse.body.outdatedControlVersions as Array<{
      project: { archivedAt: string | null; slug: string };
      projectChecklist: { archivedAt: string | null };
      projectComponent: { archivedAt: string | null };
    }>;

    expect(archivedReportResponse.status).toBe(200);
    expect(archivedOutdatedItems).toHaveLength(4);
    expect(archivedOutdatedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          project: expect.objectContaining({ archivedAt: expect.any(String) }),
        }),
        expect.objectContaining({
          projectComponent: expect.objectContaining({ archivedAt: expect.any(String) }),
        }),
        expect.objectContaining({
          projectChecklist: expect.objectContaining({ archivedAt: expect.any(String) }),
        }),
      ]),
    );
  });

  it('lets Organization owners, admins, and the Project Owner apply active Checklist Templates', async () => {
    const owner = await createSignedInOwner('project-checklist-owner');
    const admin = await addMemberToOrganization(
      owner.organization.id,
      'project-checklist-admin',
      'admin',
    );
    const projectOwner = await addMemberToOrganization(
      owner.organization.id,
      'project-checklist-project-owner',
    );
    const member = await addMemberToOrganization(owner.organization.id, 'project-checklist-member');
    const projectId = await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: projectOwner.memberId,
      slug: 'vendor-risk',
    });
    const ownerComponentId = await createComponent(projectId, 'Owner Component');
    const adminComponentId = await createComponent(projectId, 'Admin Component');
    const projectOwnerComponentId = await createComponent(projectId, 'Project Owner Component');
    const memberComponentId = await createComponent(projectId, 'Member Component');
    const control = await createActiveControl({
      controlCode: 'AUTH-147',
      organizationId: owner.organization.id,
      title: 'Require MFA',
    });
    const templateId = await createTemplate({
      controlIds: [control.controlId],
      organizationId: owner.organization.id,
    });

    await expect(
      applyTemplate({
        body: { displayName: 'Owner Checklist', templateId },
        componentId: ownerComponentId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({ status: 201 });
    await expect(
      applyTemplate({
        body: { displayName: 'Admin Checklist', templateId },
        componentId: adminComponentId,
        headers: admin.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({ status: 201 });
    await expect(
      applyTemplate({
        body: { displayName: 'Project Owner Checklist', templateId },
        componentId: projectOwnerComponentId,
        headers: projectOwner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({ status: 201 });
    await expect(
      applyTemplate({
        body: { displayName: 'Member Checklist', templateId },
        componentId: memberComponentId,
        headers: member.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({ status: 403 });
  });

  it('lets Organization owners, admins, and the Project Owner archive and restore Project Checklists', async () => {
    const owner = await createSignedInOwner('project-checklist-lifecycle-owner');
    const admin = await addMemberToOrganization(
      owner.organization.id,
      'project-checklist-lifecycle-admin',
      'admin',
    );
    const projectOwner = await addMemberToOrganization(
      owner.organization.id,
      'project-checklist-lifecycle-project-owner',
    );
    const member = await addMemberToOrganization(
      owner.organization.id,
      'project-checklist-lifecycle-member',
    );
    const projectId = await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: projectOwner.memberId,
      slug: 'vendor-risk',
    });
    const componentId = await createComponent(projectId);
    const control = await createActiveControl({
      controlCode: 'AUTH-150',
      organizationId: owner.organization.id,
      title: 'Require MFA',
    });
    const templateId = await createTemplate({
      controlIds: [control.controlId],
      organizationId: owner.organization.id,
    });
    const checklist = (
      await applyTemplate({
        body: { templateId },
        componentId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      })
    ).body.projectChecklist as { id: string };

    await expect(
      setChecklistArchived({
        archived: true,
        checklistId: checklist.id,
        componentId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({
      body: { projectChecklist: { archivedAt: expect.any(String) } },
      status: 200,
    });
    await expect(
      setChecklistArchived({
        archived: false,
        checklistId: checklist.id,
        componentId,
        headers: admin.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({ body: { projectChecklist: { archivedAt: null } }, status: 200 });
    await expect(
      setChecklistArchived({
        archived: true,
        checklistId: checklist.id,
        componentId,
        headers: projectOwner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({ status: 200 });
    await expect(
      setChecklistArchived({
        archived: false,
        checklistId: checklist.id,
        componentId,
        headers: projectOwner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({ status: 200 });
    await expect(
      setChecklistArchived({
        archived: true,
        checklistId: checklist.id,
        componentId,
        headers: member.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({
      body: {
        error:
          'Only Organization owners, admins, and the Project Owner can archive Project Checklists.',
      },
      status: 403,
    });
  });

  it('creates a Project Checklist, generated items, and unchecked verification records using latest Control Versions', async () => {
    const owner = await createSignedInOwner('project-checklist-side-effects');
    const projectId = await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'vendor-risk',
    });
    const componentId = await createComponent(projectId);
    const firstControl = await createActiveControl({
      controlCode: 'AUTH-247',
      organizationId: owner.organization.id,
      title: 'Require MFA',
    });
    const secondControl = await createActiveControl({
      controlCode: 'LOG-247',
      organizationId: owner.organization.id,
      title: 'Require logging',
    });
    const latestVersionId = await addLatestControlVersion(
      firstControl.controlId,
      'AUTH-247',
      'Require phishing-resistant MFA',
    );
    const templateId = await createTemplate({
      controlIds: [firstControl.controlId, secondControl.controlId],
      name: 'Production Readiness',
      organizationId: owner.organization.id,
    });

    const response = await applyTemplate({
      body: { templateId },
      componentId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
      projectSlug: 'vendor-risk',
    });

    expect(response.status).toBe(201);
    expect(response.body.projectChecklist).toMatchObject({
      componentId,
      displayName: 'Production Readiness',
      items: [
        {
          control: { controlCode: 'AUTH-247', id: firstControl.controlId },
          controlVersion: { id: latestVersionId, versionNumber: 2 },
          displayOrder: 0,
          verificationRecord: { status: 'unchecked' },
        },
        {
          control: { controlCode: 'LOG-247', id: secondControl.controlId },
          controlVersion: { id: secondControl.versionId, versionNumber: 1 },
          displayOrder: 1,
          verificationRecord: { status: 'unchecked' },
        },
      ],
      templateId,
    });

    const checklists = await db
      .select()
      .from(projectChecklists)
      .where(eq(projectChecklists.componentId, componentId));
    const items = await db.select().from(projectChecklistItems);
    const verificationRecords = await db.select().from(projectChecklistVerificationRecords);

    expect(checklists).toHaveLength(1);
    expect(items).toHaveLength(2);
    expect(verificationRecords).toHaveLength(2);
    expect(items.map(({ templateItemId }) => templateItemId).sort()).toEqual(
      (await db.select({ id: checklistTemplateItems.id }).from(checklistTemplateItems))
        .map(({ id }) => id)
        .sort(),
    );
  });

  it('propagates active Checklist Template item add, remove, and re-add without duplicating Project Checklist Items', async () => {
    const owner = await createSignedInOwner('project-checklist-template-propagation');
    const projectId = await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'vendor-risk',
    });
    const firstComponentId = await createComponent(projectId, 'API');
    const secondComponentId = await createComponent(projectId, 'Worker');
    const existingControl = await createActiveControl({
      controlCode: 'AUTH-351',
      organizationId: owner.organization.id,
      title: 'Require MFA',
    });
    const propagatedControl = await createActiveControl({
      controlCode: 'LOG-351',
      organizationId: owner.organization.id,
      title: 'Require logging',
    });
    const templateId = await createTemplate({
      controlIds: [existingControl.controlId],
      organizationId: owner.organization.id,
    });
    const firstApplyResponse = await applyTemplate({
      body: { templateId },
      componentId: firstComponentId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
      projectSlug: 'vendor-risk',
    });
    const secondApplyResponse = await applyTemplate({
      body: { templateId },
      componentId: secondComponentId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
      projectSlug: 'vendor-risk',
    });
    const firstChecklist = firstApplyResponse.body.projectChecklist as { id: string };
    const secondChecklist = secondApplyResponse.body.projectChecklist as { id: string };

    await expect(
      addChecklistTemplateItem({
        controlId: propagatedControl.controlId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        templateId,
      }),
    ).resolves.toMatchObject({ status: 201 });

    const firstAfterAdd = await openChecklist({
      checklistId: firstChecklist.id,
      componentId: firstComponentId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
      projectSlug: 'vendor-risk',
    });
    const propagatedTemplateItem = await db
      .select({ id: checklistTemplateItems.id })
      .from(checklistTemplateItems)
      .where(
        and(
          eq(checklistTemplateItems.templateId, templateId),
          eq(checklistTemplateItems.controlId, propagatedControl.controlId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]!);
    const firstPropagatedItem = (
      firstAfterAdd.body.projectChecklist as {
        items: Array<{
          control: { id: string };
          id: string;
          verificationRecord: { status: string };
        }>;
      }
    ).items.find(({ control }) => control.id === propagatedControl.controlId)!;

    expect(firstAfterAdd.body.projectChecklist).toMatchObject({
      completion: { completedItems: 0, totalItems: 2 },
      items: [
        { control: { controlCode: 'AUTH-351' } },
        { control: { controlCode: 'LOG-351' }, verificationRecord: { status: 'unchecked' } },
      ],
    });
    await expect(
      openChecklist({
        checklistId: secondChecklist.id,
        componentId: secondComponentId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({
      body: { projectChecklist: { completion: { completedItems: 0, totalItems: 2 } } },
      status: 200,
    });

    await expect(
      updateChecklistItemVerification({
        body: { status: 'checked' },
        checklistId: firstChecklist.id,
        componentId: firstComponentId,
        headers: owner.headers,
        itemId: firstPropagatedItem.id,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({ status: 200 });
    await expect(
      removeChecklistTemplateItem({
        headers: owner.headers,
        itemId: propagatedTemplateItem.id,
        organizationSlug: owner.organization.slug,
        templateId,
      }),
    ).resolves.toMatchObject({ status: 200 });

    const firstAfterRemove = await openChecklist({
      checklistId: firstChecklist.id,
      componentId: firstComponentId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
      projectSlug: 'vendor-risk',
    });
    const firstWithRemoved = await openChecklist({
      checklistId: firstChecklist.id,
      componentId: firstComponentId,
      headers: owner.headers,
      includeRemovedFromTemplate: true,
      organizationSlug: owner.organization.slug,
      projectSlug: 'vendor-risk',
    });
    const removedItem = (
      firstWithRemoved.body.projectChecklist as {
        items: Array<{
          control: { id: string };
          id: string;
          removedFromTemplateAt: string | null;
          verificationRecord: { history: unknown[]; status: string };
        }>;
      }
    ).items.find(({ control }) => control.id === propagatedControl.controlId)!;

    expect(firstAfterRemove.body.projectChecklist).toMatchObject({
      completion: { completedItems: 0, totalItems: 1 },
      items: [{ control: { controlCode: 'AUTH-351' } }],
    });
    expect(removedItem).toMatchObject({
      id: firstPropagatedItem.id,
      verificationRecord: { status: 'checked' },
    });
    expect(removedItem.removedFromTemplateAt).toEqual(expect.any(String));
    expect(removedItem.verificationRecord.history).toHaveLength(1);

    await expect(
      addChecklistTemplateItem({
        controlId: propagatedControl.controlId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        templateId,
      }),
    ).resolves.toMatchObject({ status: 201 });

    const firstAfterReadd = await openChecklist({
      checklistId: firstChecklist.id,
      componentId: firstComponentId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
      projectSlug: 'vendor-risk',
    });
    const projectChecklistItemsForTemplate = await db
      .select({ id: projectChecklistItems.id })
      .from(projectChecklistItems)
      .where(eq(projectChecklistItems.templateItemId, propagatedTemplateItem.id));

    expect(firstAfterReadd.body.projectChecklist).toMatchObject({
      completion: { completedItems: 1, totalItems: 2 },
      items: [
        { control: { controlCode: 'AUTH-351' } },
        {
          control: { controlCode: 'LOG-351' },
          id: firstPropagatedItem.id,
          removedFromTemplateAt: null,
          verificationRecord: { status: 'checked' },
        },
      ],
    });
    expect(projectChecklistItemsForTemplate).toHaveLength(2);
  });

  it('lets Organization members open Project Checklists with Control Versions, Release Impact, grouping, and completion', async () => {
    const owner = await createSignedInOwner('project-checklist-read-owner');
    const member = await addMemberToOrganization(owner.organization.id, 'project-checklist-reader');
    const outsider = await createSignedInOwner('project-checklist-outsider');
    const projectId = await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'vendor-risk',
    });
    const componentId = await createComponent(projectId);
    const accessControl = await createActiveControl({
      controlCode: 'AUTH-548',
      organizationId: owner.organization.id,
      releaseImpact: 'blocking',
      title: 'Require MFA',
    });
    const loggingControl = await createActiveControl({
      controlCode: 'LOG-548',
      organizationId: owner.organization.id,
      releaseImpact: 'needs review',
      title: 'Require logging',
    });
    const advisoryControl = await createActiveControl({
      controlCode: 'DOC-548',
      organizationId: owner.organization.id,
      releaseImpact: 'advisory',
      title: 'Document runbooks',
    });
    const latestAccessVersionId = await addLatestControlVersion(
      accessControl.controlId,
      'AUTH-548',
      'Require phishing-resistant MFA',
    );
    const templateId = await createTemplate({
      controlIds: [accessControl.controlId, loggingControl.controlId, advisoryControl.controlId],
      organizationId: owner.organization.id,
    });
    const now = new Date();
    const accessSectionId = crypto.randomUUID();
    const operationsSectionId = crypto.randomUUID();

    await db.insert(checklistTemplateSections).values([
      {
        createdAt: now,
        displayOrder: 1,
        id: operationsSectionId,
        name: 'Operations',
        normalizedName: 'operations',
        templateId,
        updatedAt: now,
      },
      {
        createdAt: now,
        displayOrder: 0,
        id: accessSectionId,
        name: 'Access',
        normalizedName: 'access',
        templateId,
        updatedAt: now,
      },
    ]);
    await db
      .update(checklistTemplateItems)
      .set({ displayOrder: 0, sectionId: accessSectionId })
      .where(
        and(
          eq(checklistTemplateItems.templateId, templateId),
          eq(checklistTemplateItems.controlId, accessControl.controlId),
        ),
      );
    await db
      .update(checklistTemplateItems)
      .set({ displayOrder: 0, sectionId: operationsSectionId })
      .where(
        and(
          eq(checklistTemplateItems.templateId, templateId),
          eq(checklistTemplateItems.controlId, loggingControl.controlId),
        ),
      );

    const applyResponse = await applyTemplate({
      body: { templateId },
      componentId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
      projectSlug: 'vendor-risk',
    });
    const projectChecklist = applyResponse.body.projectChecklist as { id: string };
    const records = await db
      .select({
        controlId: projectChecklistItems.controlId,
        id: projectChecklistVerificationRecords.id,
      })
      .from(projectChecklistItems)
      .innerJoin(
        projectChecklistVerificationRecords,
        eq(projectChecklistItems.verificationRecordId, projectChecklistVerificationRecords.id),
      )
      .where(eq(projectChecklistItems.projectChecklistId, projectChecklist.id));

    await db
      .update(projectChecklistVerificationRecords)
      .set({ status: 'checked' })
      .where(
        eq(
          projectChecklistVerificationRecords.id,
          records.find(({ controlId }) => controlId === accessControl.controlId)!.id,
        ),
      );
    await db
      .update(projectChecklistVerificationRecords)
      .set({ status: 'not-applicable' })
      .where(
        eq(
          projectChecklistVerificationRecords.id,
          records.find(({ controlId }) => controlId === loggingControl.controlId)!.id,
        ),
      );

    const response = await openChecklist({
      checklistId: projectChecklist.id,
      componentId,
      headers: member.headers,
      organizationSlug: owner.organization.slug,
      projectSlug: 'vendor-risk',
    });

    expect(response.status).toBe(200);
    expect(response.body.projectChecklist).toMatchObject({
      completion: { completedItems: 2, totalItems: 3 },
      items: [
        {
          control: { controlCode: 'DOC-548', releaseImpact: 'advisory' },
          sectionId: null,
          verificationRecord: { status: 'unchecked' },
        },
        {
          control: { controlCode: 'AUTH-548', releaseImpact: 'needs review' },
          controlVersion: { id: latestAccessVersionId, versionNumber: 2 },
          sectionId: accessSectionId,
          verificationRecord: { status: 'checked' },
        },
        {
          control: { controlCode: 'LOG-548', releaseImpact: 'needs review' },
          controlVersion: { id: loggingControl.versionId, versionNumber: 1 },
          sectionId: operationsSectionId,
          verificationRecord: { status: 'not-applicable' },
        },
      ],
      sections: [
        {
          displayOrder: 0,
          id: accessSectionId,
          items: [{ control: { controlCode: 'AUTH-548' } }],
          name: 'Access',
        },
        {
          displayOrder: 1,
          id: operationsSectionId,
          items: [{ control: { controlCode: 'LOG-548' } }],
          name: 'Operations',
        },
      ],
      unsectionedItems: [{ control: { controlCode: 'DOC-548' } }],
    });
    await expect(
      openChecklist({
        checklistId: projectChecklist.id,
        componentId,
        headers: outsider.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({ status: 404 });
  });

  it('hides removed-from-template items by default and excludes them from completion', async () => {
    const owner = await createSignedInOwner('project-checklist-removed');
    const projectId = await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'vendor-risk',
    });
    const componentId = await createComponent(projectId);
    const visibleControl = await createActiveControl({
      controlCode: 'AUTH-648',
      organizationId: owner.organization.id,
      title: 'Require MFA',
    });
    const removedControl = await createActiveControl({
      controlCode: 'LOG-648',
      organizationId: owner.organization.id,
      title: 'Require logging',
    });
    const otherControl = await createActiveControl({
      controlCode: 'NET-648',
      organizationId: owner.organization.id,
      title: 'Segment networks',
    });
    const templateId = await createTemplate({
      controlIds: [visibleControl.controlId, removedControl.controlId],
      organizationId: owner.organization.id,
    });
    const otherTemplateId = await createTemplate({
      controlIds: [otherControl.controlId],
      name: 'Other Readiness',
      organizationId: owner.organization.id,
    });

    const applyResponse = await applyTemplate({
      body: { templateId },
      componentId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
      projectSlug: 'vendor-risk',
    });
    const projectChecklist = applyResponse.body.projectChecklist as { id: string };
    const removedTemplateItem = await db
      .select({ id: checklistTemplateItems.id })
      .from(checklistTemplateItems)
      .where(
        and(
          eq(checklistTemplateItems.templateId, templateId),
          eq(checklistTemplateItems.controlId, removedControl.controlId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]!);
    const replacementTemplateItem = await db
      .select({ id: checklistTemplateItems.id })
      .from(checklistTemplateItems)
      .where(eq(checklistTemplateItems.templateId, otherTemplateId))
      .limit(1)
      .then((rows) => rows[0]!);
    const removedChecklistItem = await db
      .select({ verificationRecordId: projectChecklistItems.verificationRecordId })
      .from(projectChecklistItems)
      .where(eq(projectChecklistItems.templateItemId, removedTemplateItem.id))
      .limit(1)
      .then((rows) => rows[0]!);

    await db
      .update(projectChecklistItems)
      .set({ templateItemId: replacementTemplateItem.id })
      .where(eq(projectChecklistItems.templateItemId, removedTemplateItem.id));
    await db
      .update(projectChecklistVerificationRecords)
      .set({ status: 'checked' })
      .where(eq(projectChecklistVerificationRecords.id, removedChecklistItem.verificationRecordId));

    const response = await openChecklist({
      checklistId: projectChecklist.id,
      componentId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
      projectSlug: 'vendor-risk',
    });

    expect(response.status).toBe(200);
    expect(response.body.projectChecklist).toMatchObject({
      completion: { completedItems: 0, totalItems: 1 },
      items: [{ control: { controlCode: 'AUTH-648' } }],
    });
  });

  it('keeps archived Project Checklist completion readable with current non-removed items', async () => {
    const owner = await createSignedInOwner('project-checklist-archived-read');
    const projectId = await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'vendor-risk',
    });
    const componentId = await createComponent(projectId);
    const control = await createActiveControl({
      controlCode: 'AUTH-748',
      organizationId: owner.organization.id,
      title: 'Require MFA',
    });
    const templateId = await createTemplate({
      controlIds: [control.controlId],
      organizationId: owner.organization.id,
    });
    const applyResponse = await applyTemplate({
      body: { templateId },
      componentId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
      projectSlug: 'vendor-risk',
    });
    const projectChecklist = applyResponse.body.projectChecklist as { id: string };
    const checklistItem = await db
      .select({ verificationRecordId: projectChecklistItems.verificationRecordId })
      .from(projectChecklistItems)
      .where(eq(projectChecklistItems.projectChecklistId, projectChecklist.id))
      .limit(1)
      .then((rows) => rows[0]!);

    await db
      .update(projectChecklistVerificationRecords)
      .set({ status: 'checked' })
      .where(eq(projectChecklistVerificationRecords.id, checklistItem.verificationRecordId));
    await db
      .update(projectChecklists)
      .set({ archivedAt: new Date() })
      .where(eq(projectChecklists.id, projectChecklist.id));

    const response = await openChecklist({
      checklistId: projectChecklist.id,
      componentId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
      projectSlug: 'vendor-risk',
    });

    expect(response.status).toBe(200);
    expect(response.body.projectChecklist).toMatchObject({
      archivedAt: expect.any(String),
      completion: { completedItems: 1, totalItems: 1 },
      items: [{ control: { controlCode: 'AUTH-748' }, verificationRecord: { status: 'checked' } }],
    });
  });

  it('lets active Organization members change checklist item verification and inspect Control Version history', async () => {
    const owner = await createSignedInOwner('project-checklist-verify-owner');
    const member = await addMemberToOrganization(
      owner.organization.id,
      'project-checklist-verify-member',
    );
    const projectId = await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'vendor-risk',
    });
    const componentId = await createComponent(projectId);
    const control = await createActiveControl({
      controlCode: 'AUTH-849',
      organizationId: owner.organization.id,
      title: 'Require MFA',
    });
    const templateId = await createTemplate({
      controlIds: [control.controlId],
      organizationId: owner.organization.id,
    });
    const applyResponse = await applyTemplate({
      body: { templateId },
      componentId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
      projectSlug: 'vendor-risk',
    });
    const projectChecklist = applyResponse.body.projectChecklist as {
      id: string;
      items: [{ id: string }];
    };
    const itemId = projectChecklist.items[0].id;

    await addLatestControlVersion(control.controlId, 'AUTH-849', 'Require phishing-resistant MFA');

    await expect(
      updateChecklistItemVerification({
        body: {
          status: 'not-applicable',
          notApplicableExplanation: 'Compensating control applies.',
        },
        checklistId: projectChecklist.id,
        componentId,
        headers: member.headers,
        itemId,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({
      body: {
        projectChecklist: {
          completion: { completedItems: 1, totalItems: 1 },
          items: [
            {
              controlVersion: { id: control.versionId, isLatest: false, versionNumber: 1 },
              verificationRecord: {
                history: [
                  {
                    actorMemberId: member.memberId,
                    controlVersion: { id: control.versionId, versionNumber: 1 },
                    createdAt: expect.any(String),
                    notApplicableExplanation: 'Compensating control applies.',
                    status: 'not-applicable',
                  },
                ],
                notApplicableExplanation: 'Compensating control applies.',
                status: 'not-applicable',
              },
            },
          ],
        },
      },
      status: 200,
    });
    await expect(
      updateChecklistItemVerification({
        body: { status: 'checked' },
        checklistId: projectChecklist.id,
        componentId,
        headers: member.headers,
        itemId,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({
      body: {
        projectChecklist: {
          items: [
            {
              verificationRecord: {
                history: [
                  { notApplicableExplanation: null, status: 'checked' },
                  {
                    notApplicableExplanation: 'Compensating control applies.',
                    status: 'not-applicable',
                  },
                ],
                notApplicableExplanation: null,
                status: 'checked',
              },
            },
          ],
        },
      },
      status: 200,
    });
    await expect(
      updateChecklistItemVerification({
        body: { status: 'unchecked' },
        checklistId: projectChecklist.id,
        componentId,
        headers: member.headers,
        itemId,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({
      body: {
        projectChecklist: {
          completion: { completedItems: 0, totalItems: 1 },
          items: [{ verificationRecord: { notApplicableExplanation: null, status: 'unchecked' } }],
        },
      },
      status: 200,
    });

    const historyRows = await db
      .select()
      .from(projectChecklistVerificationHistory)
      .where(eq(projectChecklistVerificationHistory.projectChecklistItemId, itemId));

    expect(historyRows).toHaveLength(3);
    expect(historyRows.map(({ controlVersionId }) => controlVersionId)).toEqual([
      control.versionId,
      control.versionId,
      control.versionId,
    ]);
  });

  it('propagates new Control Versions only to active Project Checklist Items and keeps old verification visible', async () => {
    const owner = await createSignedInOwner('project-checklist-version-propagation');
    const control = await createActiveControl({
      controlCode: 'AUTH-852',
      organizationId: owner.organization.id,
      title: 'Require MFA before propagation',
    });
    const templateId = await createTemplate({
      controlIds: [control.controlId],
      organizationId: owner.organization.id,
    });
    const activeProjectId = await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'active-vendor-risk',
    });
    const archivedProjectId = await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'archived-vendor-risk',
    });
    const archivedComponentProjectId = await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'component-archived-risk',
    });
    const archivedChecklistProjectId = await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'checklist-archived-risk',
    });
    const activeComponentId = await createComponent(activeProjectId, 'Active Component');
    const archivedProjectComponentId = await createComponent(
      archivedProjectId,
      'Archived Project Component',
    );
    const archivedComponentId = await createComponent(
      archivedComponentProjectId,
      'Archived Component',
    );
    const archivedChecklistComponentId = await createComponent(
      archivedChecklistProjectId,
      'Archived Checklist Component',
    );

    const activeApplyResponse = await applyTemplate({
      body: { templateId },
      componentId: activeComponentId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
      projectSlug: 'active-vendor-risk',
    });
    const archivedProjectApplyResponse = await applyTemplate({
      body: { templateId },
      componentId: archivedProjectComponentId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
      projectSlug: 'archived-vendor-risk',
    });
    const archivedComponentApplyResponse = await applyTemplate({
      body: { templateId },
      componentId: archivedComponentId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
      projectSlug: 'component-archived-risk',
    });
    const archivedChecklistApplyResponse = await applyTemplate({
      body: { templateId },
      componentId: archivedChecklistComponentId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
      projectSlug: 'checklist-archived-risk',
    });
    const activeChecklist = activeApplyResponse.body.projectChecklist as {
      id: string;
      items: [{ id: string; verificationRecord: { id: string } }];
    };
    const archivedProjectChecklist = archivedProjectApplyResponse.body.projectChecklist as {
      id: string;
    };
    const archivedComponentChecklist = archivedComponentApplyResponse.body.projectChecklist as {
      id: string;
    };
    const archivedChecklist = archivedChecklistApplyResponse.body.projectChecklist as {
      id: string;
    };
    const activeItemId = activeChecklist.items[0].id;
    const activeOldRecordId = activeChecklist.items[0].verificationRecord.id;

    await updateChecklistItemVerification({
      body: { status: 'checked' },
      checklistId: activeChecklist.id,
      componentId: activeComponentId,
      headers: owner.headers,
      itemId: activeItemId,
      organizationSlug: owner.organization.slug,
      projectSlug: 'active-vendor-risk',
    });
    await db
      .update(projects)
      .set({ archivedAt: new Date() })
      .where(eq(projects.id, archivedProjectId));
    await db
      .update(projectComponents)
      .set({ archivedAt: new Date() })
      .where(eq(projectComponents.id, archivedComponentId));
    await db
      .update(projectChecklists)
      .set({ archivedAt: new Date() })
      .where(eq(projectChecklists.id, archivedChecklist.id));

    const proposedResponse = await createControlProposedUpdate({
      body: {
        acceptedEvidenceTypes: ['document'],
        applicabilityConditions: 'Applies to active matching Project Checklist Items.',
        businessMeaning: 'Updated Control meaning requires explicit re-verification.',
        controlCode: 'AUTH-852',
        externalStandardsMappings: [],
        releaseImpact: 'blocking',
        title: 'Require phishing-resistant MFA after propagation',
        verificationMethod: 'Review updated MFA evidence.',
      },
      controlId: control.controlId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
    });
    const proposedUpdate = proposedResponse.body.proposedUpdate as { id: string };
    const publishResponse = await publishControlProposedUpdate({
      controlId: control.controlId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
      proposedUpdateId: proposedUpdate.id,
    });
    const publishedControl = publishResponse.body.control as {
      currentVersion: { id: string; versionNumber: number };
    };

    expect(publishResponse.status).toBe(201);
    expect(publishedControl.currentVersion.versionNumber).toBe(2);

    const checklistItems = await db.select().from(projectChecklistItems);
    const activeItem = checklistItems.find(({ id }) => id === activeItemId)!;
    const archivedItems = checklistItems.filter(({ projectChecklistId }) =>
      [archivedProjectChecklist.id, archivedComponentChecklist.id, archivedChecklist.id].includes(
        projectChecklistId,
      ),
    );
    const verificationRecords = await db.select().from(projectChecklistVerificationRecords);

    expect(activeItem.controlVersionId).toBe(publishedControl.currentVersion.id);
    expect(activeItem.verificationRecordId).not.toBe(activeOldRecordId);
    expect(archivedItems.map(({ controlVersionId }) => controlVersionId)).toEqual([
      control.versionId,
      control.versionId,
      control.versionId,
    ]);
    expect(verificationRecords).toHaveLength(5);
    expect(verificationRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          controlVersionId: control.versionId,
          id: activeOldRecordId,
          status: 'checked',
        }),
        expect.objectContaining({
          controlVersionId: publishedControl.currentVersion.id,
          id: activeItem.verificationRecordId,
          status: 'unchecked',
        }),
      ]),
    );

    await expect(
      openChecklist({
        checklistId: activeChecklist.id,
        componentId: activeComponentId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'active-vendor-risk',
      }),
    ).resolves.toMatchObject({
      body: {
        projectChecklist: {
          completion: { completedItems: 0, totalItems: 1 },
          items: [
            {
              controlVersion: { id: publishedControl.currentVersion.id, versionNumber: 2 },
              verificationRecord: {
                history: [
                  {
                    controlVersion: { id: control.versionId, versionNumber: 1 },
                    status: 'checked',
                  },
                ],
                status: 'unchecked',
              },
            },
          ],
        },
      },
      status: 200,
    });
  });

  it('catches up restored active-work containers without duplicating verification records', async () => {
    const owner = await createSignedInOwner('project-checklist-restore-catch-up');
    const staleControl = await createActiveControl({
      controlCode: 'AUTH-853',
      organizationId: owner.organization.id,
      title: 'Require MFA before restore',
    });
    const missedControl = await createActiveControl({
      controlCode: 'LOG-853',
      organizationId: owner.organization.id,
      title: 'Require logging before restore',
    });
    const templateId = await createTemplate({
      controlIds: [staleControl.controlId],
      organizationId: owner.organization.id,
    });
    const projectArchivedProjectId = await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'restore-project-risk',
    });
    const componentArchivedProjectId = await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'restore-component-risk',
    });
    const checklistArchivedProjectId = await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'restore-checklist-risk',
    });
    const projectArchivedComponentId = await createComponent(
      projectArchivedProjectId,
      'Project Archived Component',
    );
    const componentArchivedComponentId = await createComponent(
      componentArchivedProjectId,
      'Component Archived Component',
    );
    const checklistArchivedComponentId = await createComponent(
      checklistArchivedProjectId,
      'Checklist Archived Component',
    );
    const projectArchivedApplyResponse = await applyTemplate({
      body: { templateId },
      componentId: projectArchivedComponentId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
      projectSlug: 'restore-project-risk',
    });
    const componentArchivedApplyResponse = await applyTemplate({
      body: { templateId },
      componentId: componentArchivedComponentId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
      projectSlug: 'restore-component-risk',
    });
    const checklistArchivedApplyResponse = await applyTemplate({
      body: { templateId },
      componentId: checklistArchivedComponentId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
      projectSlug: 'restore-checklist-risk',
    });
    const projectArchivedChecklist = projectArchivedApplyResponse.body.projectChecklist as {
      id: string;
      items: [{ id: string; verificationRecord: { id: string } }];
    };
    const componentArchivedChecklist = componentArchivedApplyResponse.body.projectChecklist as {
      id: string;
      items: [{ id: string; verificationRecord: { id: string } }];
    };
    const checklistArchivedChecklist = checklistArchivedApplyResponse.body.projectChecklist as {
      id: string;
      items: [{ id: string; verificationRecord: { id: string } }];
    };
    const originalRecordIds = [
      projectArchivedChecklist.items[0].verificationRecord.id,
      componentArchivedChecklist.items[0].verificationRecord.id,
      checklistArchivedChecklist.items[0].verificationRecord.id,
    ];

    await updateChecklistItemVerification({
      body: { status: 'checked' },
      checklistId: projectArchivedChecklist.id,
      componentId: projectArchivedComponentId,
      headers: owner.headers,
      itemId: projectArchivedChecklist.items[0].id,
      organizationSlug: owner.organization.slug,
      projectSlug: 'restore-project-risk',
    });
    await expect(
      setProjectArchived({
        archived: true,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'restore-project-risk',
      }),
    ).resolves.toMatchObject({ status: 200 });
    await expect(
      setComponentArchived({
        archived: true,
        componentId: componentArchivedComponentId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'restore-component-risk',
      }),
    ).resolves.toMatchObject({ status: 200 });
    await expect(
      setChecklistArchived({
        archived: true,
        checklistId: checklistArchivedChecklist.id,
        componentId: checklistArchivedComponentId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'restore-checklist-risk',
      }),
    ).resolves.toMatchObject({ status: 200 });

    await expect(
      addChecklistTemplateItem({
        controlId: missedControl.controlId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        templateId,
      }),
    ).resolves.toMatchObject({ status: 201 });

    const proposedResponse = await createControlProposedUpdate({
      body: {
        acceptedEvidenceTypes: ['document'],
        applicabilityConditions: 'Applies after restore.',
        businessMeaning: 'Restored work must use current assurance requirements.',
        controlCode: 'AUTH-853',
        externalStandardsMappings: [],
        releaseImpact: 'blocking',
        title: 'Require MFA after restore',
        verificationMethod: 'Review restored evidence.',
      },
      controlId: staleControl.controlId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
    });
    const proposedUpdate = proposedResponse.body.proposedUpdate as { id: string };
    const publishResponse = await publishControlProposedUpdate({
      controlId: staleControl.controlId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
      proposedUpdateId: proposedUpdate.id,
    });
    const publishedControl = publishResponse.body.control as {
      currentVersion: { id: string; versionNumber: number };
    };

    expect(publishResponse.status).toBe(201);

    const inactiveItems = await db
      .select()
      .from(projectChecklistItems)
      .where(
        inArray(projectChecklistItems.projectChecklistId, [
          projectArchivedChecklist.id,
          componentArchivedChecklist.id,
          checklistArchivedChecklist.id,
        ]),
      );

    expect(inactiveItems).toHaveLength(3);
    expect(inactiveItems.map(({ controlVersionId }) => controlVersionId)).toEqual([
      staleControl.versionId,
      staleControl.versionId,
      staleControl.versionId,
    ]);

    await expect(
      setProjectArchived({
        archived: false,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'restore-project-risk',
      }),
    ).resolves.toMatchObject({ status: 200 });
    await expect(
      setComponentArchived({
        archived: false,
        componentId: componentArchivedComponentId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'restore-component-risk',
      }),
    ).resolves.toMatchObject({ status: 200 });
    await expect(
      setChecklistArchived({
        archived: false,
        checklistId: checklistArchivedChecklist.id,
        componentId: checklistArchivedComponentId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'restore-checklist-risk',
      }),
    ).resolves.toMatchObject({ status: 200 });

    await setProjectArchived({
      archived: false,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
      projectSlug: 'restore-project-risk',
    });
    await setComponentArchived({
      archived: false,
      componentId: componentArchivedComponentId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
      projectSlug: 'restore-component-risk',
    });
    await setChecklistArchived({
      archived: false,
      checklistId: checklistArchivedChecklist.id,
      componentId: checklistArchivedComponentId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
      projectSlug: 'restore-checklist-risk',
    });

    const restoredItems = await db
      .select()
      .from(projectChecklistItems)
      .where(
        inArray(projectChecklistItems.projectChecklistId, [
          projectArchivedChecklist.id,
          componentArchivedChecklist.id,
          checklistArchivedChecklist.id,
        ]),
      );
    const restoredRecords = await db
      .select()
      .from(projectChecklistVerificationRecords)
      .where(
        inArray(
          projectChecklistVerificationRecords.id,
          restoredItems.map(({ verificationRecordId }) => verificationRecordId),
        ),
      );
    const preservedRecords = await db
      .select()
      .from(projectChecklistVerificationRecords)
      .where(inArray(projectChecklistVerificationRecords.id, originalRecordIds));

    expect(restoredItems).toHaveLength(6);
    expect(restoredRecords).toHaveLength(6);
    expect(preservedRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          controlVersionId: staleControl.versionId,
          id: originalRecordIds[0],
          status: 'checked',
        }),
      ]),
    );
    expect(restoredItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ controlVersionId: publishedControl.currentVersion.id }),
        expect.objectContaining({ controlVersionId: missedControl.versionId }),
      ]),
    );

    await expect(
      openChecklist({
        checklistId: projectArchivedChecklist.id,
        componentId: projectArchivedComponentId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'restore-project-risk',
      }),
    ).resolves.toMatchObject({
      body: {
        projectChecklist: {
          completion: { completedItems: 0, totalItems: 2 },
          items: [
            {
              control: { controlCode: 'AUTH-853' },
              controlVersion: { id: publishedControl.currentVersion.id, versionNumber: 2 },
              verificationRecord: {
                history: [{ controlVersion: { id: staleControl.versionId }, status: 'checked' }],
                status: 'unchecked',
              },
            },
            {
              control: { controlCode: 'LOG-853' },
              controlVersion: { id: missedControl.versionId, versionNumber: 1 },
              verificationRecord: { status: 'unchecked' },
            },
          ],
        },
      },
      status: 200,
    });
  });

  it('rejects missing not applicable explanations and keeps checked or unchecked evidence-free', async () => {
    const owner = await createSignedInOwner('project-checklist-verify-validation');
    const projectId = await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'vendor-risk',
    });
    const componentId = await createComponent(projectId);
    const control = await createActiveControl({
      controlCode: 'AUTH-949',
      organizationId: owner.organization.id,
      title: 'Require MFA',
    });
    const templateId = await createTemplate({
      controlIds: [control.controlId],
      organizationId: owner.organization.id,
    });
    const applyResponse = await applyTemplate({
      body: { templateId },
      componentId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
      projectSlug: 'vendor-risk',
    });
    const projectChecklist = applyResponse.body.projectChecklist as {
      id: string;
      items: [{ id: string }];
    };

    await expect(
      updateChecklistItemVerification({
        body: { status: 'not-applicable', notApplicableExplanation: '   ' },
        checklistId: projectChecklist.id,
        componentId,
        headers: owner.headers,
        itemId: projectChecklist.items[0].id,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({
      body: { error: 'Not applicable verification requires an explanation.' },
      status: 400,
    });
    await expect(
      updateChecklistItemVerification({
        body: { status: 'checked' },
        checklistId: projectChecklist.id,
        componentId,
        headers: owner.headers,
        itemId: projectChecklist.items[0].id,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({ status: 200 });
    await expect(
      updateChecklistItemVerification({
        body: { status: 'unchecked' },
        checklistId: projectChecklist.id,
        componentId,
        headers: owner.headers,
        itemId: projectChecklist.items[0].id,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({ status: 200 });
  });

  it('retains items and verification history when Project Checklists are archived and restored', async () => {
    const owner = await createSignedInOwner('project-checklist-lifecycle-history');
    const projectId = await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'vendor-risk',
    });
    const componentId = await createComponent(projectId);
    const control = await createActiveControl({
      controlCode: 'AUTH-1050',
      organizationId: owner.organization.id,
      title: 'Require MFA',
    });
    const templateId = await createTemplate({
      controlIds: [control.controlId],
      organizationId: owner.organization.id,
    });
    const checklist = (
      await applyTemplate({
        body: { templateId },
        componentId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      })
    ).body.projectChecklist as { id: string; items: [{ id: string }] };

    await updateChecklistItemVerification({
      body: { status: 'checked' },
      checklistId: checklist.id,
      componentId,
      headers: owner.headers,
      itemId: checklist.items[0].id,
      organizationSlug: owner.organization.slug,
      projectSlug: 'vendor-risk',
    });
    await setChecklistArchived({
      archived: true,
      checklistId: checklist.id,
      componentId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
      projectSlug: 'vendor-risk',
    });

    await expect(
      openChecklist({
        checklistId: checklist.id,
        componentId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({
      body: {
        projectChecklist: {
          archivedAt: expect.any(String),
          items: [
            {
              id: checklist.items[0].id,
              verificationRecord: {
                history: [{ status: 'checked' }],
                status: 'checked',
              },
            },
          ],
        },
      },
      status: 200,
    });
    await expect(
      updateChecklistItemVerification({
        body: { status: 'unchecked' },
        checklistId: checklist.id,
        componentId,
        headers: owner.headers,
        itemId: checklist.items[0].id,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({
      body: { error: 'Archived Project Checklist containers are read-only.' },
      status: 400,
    });
    await setChecklistArchived({
      archived: false,
      checklistId: checklist.id,
      componentId,
      headers: owner.headers,
      organizationSlug: owner.organization.slug,
      projectSlug: 'vendor-risk',
    });

    const [items, history] = await Promise.all([
      db
        .select()
        .from(projectChecklistItems)
        .where(eq(projectChecklistItems.projectChecklistId, checklist.id)),
      db
        .select()
        .from(projectChecklistVerificationHistory)
        .where(
          eq(projectChecklistVerificationHistory.projectChecklistItemId, checklist.items[0].id),
        ),
    ]);

    expect(items).toHaveLength(1);
    expect(history).toHaveLength(1);
    expect(history[0]!.status).toBe('checked');
  });

  it('keeps archived Projects, Project Components, and Project Checklists read-only for verification', async () => {
    const owner = await createSignedInOwner('project-checklist-verify-archived');
    const projectId = await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'vendor-risk',
    });
    const checklistArchivedComponentId = await createComponent(projectId, 'Checklist Archived');
    const componentArchivedComponentId = await createComponent(projectId, 'Component Archived');
    const projectArchivedComponentId = await createComponent(projectId, 'Project Archived');
    const control = await createActiveControl({
      controlCode: 'AUTH-1049',
      organizationId: owner.organization.id,
      title: 'Require MFA',
    });
    const checklistArchivedTemplateId = await createTemplate({
      controlIds: [control.controlId],
      name: 'Checklist Archived Readiness',
      organizationId: owner.organization.id,
    });
    const componentArchivedTemplateId = await createTemplate({
      controlIds: [control.controlId],
      name: 'Component Archived Readiness',
      organizationId: owner.organization.id,
    });
    const projectArchivedTemplateId = await createTemplate({
      controlIds: [control.controlId],
      name: 'Project Archived Readiness',
      organizationId: owner.organization.id,
    });
    const checklistArchivedChecklist = (
      await applyTemplate({
        body: { templateId: checklistArchivedTemplateId },
        componentId: checklistArchivedComponentId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      })
    ).body.projectChecklist as { id: string; items: [{ id: string }] };
    const componentArchivedChecklist = (
      await applyTemplate({
        body: { templateId: componentArchivedTemplateId },
        componentId: componentArchivedComponentId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      })
    ).body.projectChecklist as { id: string; items: [{ id: string }] };
    const projectArchivedChecklist = (
      await applyTemplate({
        body: { templateId: projectArchivedTemplateId },
        componentId: projectArchivedComponentId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      })
    ).body.projectChecklist as { id: string; items: [{ id: string }] };

    await db
      .update(projectChecklists)
      .set({ archivedAt: new Date() })
      .where(eq(projectChecklists.id, checklistArchivedChecklist.id));
    await db
      .update(projectComponents)
      .set({ archivedAt: new Date() })
      .where(eq(projectComponents.id, componentArchivedComponentId));

    await expect(
      updateChecklistItemVerification({
        body: { status: 'checked' },
        checklistId: checklistArchivedChecklist.id,
        componentId: checklistArchivedComponentId,
        headers: owner.headers,
        itemId: checklistArchivedChecklist.items[0].id,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({
      body: { error: 'Archived Project Checklist containers are read-only.' },
      status: 400,
    });
    await expect(
      updateChecklistItemVerification({
        body: { status: 'checked' },
        checklistId: componentArchivedChecklist.id,
        componentId: componentArchivedComponentId,
        headers: owner.headers,
        itemId: componentArchivedChecklist.items[0].id,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({
      body: { error: 'Archived Project Checklist containers are read-only.' },
      status: 400,
    });
    await db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.id, projectId));

    await expect(
      updateChecklistItemVerification({
        body: { status: 'checked' },
        checklistId: projectArchivedChecklist.id,
        componentId: projectArchivedComponentId,
        headers: owner.headers,
        itemId: projectArchivedChecklist.items[0].id,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({
      body: { error: 'Archived Project Checklist containers are read-only.' },
      status: 400,
    });
  });

  it('enforces one active Project Checklist per template and unique display names per component', async () => {
    const owner = await createSignedInOwner('project-checklist-unique');
    const projectId = await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'vendor-risk',
    });
    const componentId = await createComponent(projectId);
    const control = await createActiveControl({
      controlCode: 'AUTH-347',
      organizationId: owner.organization.id,
      title: 'Require MFA',
    });
    const firstTemplateId = await createTemplate({
      controlIds: [control.controlId],
      name: 'Release Readiness',
      organizationId: owner.organization.id,
    });
    const secondTemplateId = await createTemplate({
      controlIds: [control.controlId],
      name: 'Operational Readiness',
      organizationId: owner.organization.id,
    });

    const firstChecklist = (
      await applyTemplate({
        body: { displayName: 'Custom Checklist', templateId: firstTemplateId },
        componentId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      })
    ).body.projectChecklist as { id: string };

    await expect(
      applyTemplate({
        body: { displayName: 'Another Checklist', templateId: firstTemplateId },
        componentId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({
      body: {
        error:
          'Project Component already has an active Project Checklist for this Checklist Template.',
      },
      status: 400,
    });
    await expect(
      applyTemplate({
        body: { displayName: ' custom   checklist ', templateId: secondTemplateId },
        componentId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({
      body: { error: 'Project Checklist display name is already used for this Project Component.' },
      status: 400,
    });

    await expect(
      setChecklistArchived({
        archived: true,
        checklistId: firstChecklist.id,
        componentId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({ status: 200 });
    await expect(
      applyTemplate({
        body: { displayName: 'Custom Checklist', templateId: firstTemplateId },
        componentId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({ status: 201 });
    await expect(
      setChecklistArchived({
        archived: false,
        checklistId: firstChecklist.id,
        componentId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({
      body: {
        error:
          'Project Component already has an active Project Checklist for this Checklist Template.',
      },
      status: 400,
    });
  });

  it('rejects inactive templates, archived Projects, archived Project Components, and archived Controls', async () => {
    const owner = await createSignedInOwner('project-checklist-inactive');
    const activeProjectId = await createProject({
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'vendor-risk',
    });
    const archivedProjectId = await createProject({
      archived: true,
      organizationId: owner.organization.id,
      projectOwnerMemberId: null,
      slug: 'legacy-risk',
    });
    const activeComponentId = await createComponent(activeProjectId, 'Active Component');
    const archivedComponentId = await createComponent(activeProjectId, 'Archived Component', true);
    const archivedProjectComponentId = await createComponent(archivedProjectId, 'Legacy Component');
    const control = await createActiveControl({
      controlCode: 'AUTH-447',
      organizationId: owner.organization.id,
      title: 'Require MFA',
    });
    const inactiveTemplateId = await createTemplate({
      controlIds: [control.controlId],
      organizationId: owner.organization.id,
      status: 'draft',
    });
    const archivedControlTemplateId = await createTemplate({
      controlIds: [control.controlId],
      name: 'Archived Control Template',
      organizationId: owner.organization.id,
    });

    await db
      .update(controls)
      .set({ archivedAt: new Date() })
      .where(eq(controls.id, control.controlId));

    await expect(
      applyTemplate({
        body: { templateId: inactiveTemplateId },
        componentId: activeComponentId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({
      body: { error: 'Only active Checklist Templates can be applied.' },
      status: 400,
    });
    await expect(
      applyTemplate({
        body: { templateId: archivedControlTemplateId },
        componentId: activeComponentId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({
      body: { error: 'Checklist Template contains Controls that are no longer active.' },
      status: 400,
    });
    await expect(
      applyTemplate({
        body: { templateId: archivedControlTemplateId },
        componentId: archivedComponentId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'vendor-risk',
      }),
    ).resolves.toMatchObject({ status: 404 });
    await expect(
      applyTemplate({
        body: { templateId: archivedControlTemplateId },
        componentId: archivedProjectComponentId,
        headers: owner.headers,
        organizationSlug: owner.organization.slug,
        projectSlug: 'legacy-risk',
      }),
    ).resolves.toMatchObject({ status: 404 });
  });
});
