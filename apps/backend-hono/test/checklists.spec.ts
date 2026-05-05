import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '../src/db/client';
import { checklistItems, members, users } from '../src/db/schema';
import { createChecklistTemplateForMember } from '../src/contexts/checklists/checklists';
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

  const membership = await db
    .select({ id: members.id })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(
      and(eq(members.organizationId, input.organizationId), eq(users.email, credentials.email)),
    )
    .limit(1)
    .then((rows) => rows[0]);

  expect(membership?.id).toBeTruthy();

  if (!membership?.id) {
    throw new Error('Expected invited Organization membership.');
  }

  return { credentials, headers, membership };
}

async function getFirstMembership(organizationId: string) {
  const membership = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.organizationId, organizationId))
    .limit(1)
    .then((rows) => rows[0]);

  expect(membership?.id).toBeTruthy();

  if (!membership?.id) {
    throw new Error('Expected an Organization membership.');
  }

  return membership;
}

async function createProject(input: {
  headers: Headers;
  organizationSlug: string;
  projectOwnerMemberId?: string | null;
}) {
  const projectToken = crypto.randomUUID().slice(0, 8);
  const response = await callTRPC(
    input.headers,
    (caller) =>
      caller.projects.create({
        description: 'Checklist readiness work for this Organization.',
        name: `Checklist Readiness ${projectToken}`,
        organizationSlug: input.organizationSlug,
        projectOwnerMemberId: input.projectOwnerMemberId ?? null,
        slug: `checklist-readiness-${projectToken}`,
      }),
    201,
  );

  expect(response.status).toBe(201);

  return response.body.project;
}

async function createProjectAssignment(input: {
  headers: Headers;
  organizationMemberId: string;
  organizationSlug: string;
  projectSlug: string;
  role: 'project_contributor' | 'project_owner';
}) {
  return callTRPC(
    input.headers,
    (caller) =>
      caller.projects.createAssignment({
        organizationMemberId: input.organizationMemberId,
        organizationSlug: input.organizationSlug,
        projectSlug: input.projectSlug,
        role: input.role,
      }),
    201,
  );
}

async function archiveProject(input: {
  headers: Headers;
  organizationSlug: string;
  projectSlug: string;
}) {
  return callTRPC(input.headers, (caller) =>
    caller.projects.archive({
      organizationSlug: input.organizationSlug,
      projectSlug: input.projectSlug,
    }),
  );
}

async function createActiveControl(input: {
  headers: Headers;
  organizationSlug: string;
  title: string;
}) {
  const draftResponse = await callTRPC(
    input.headers,
    (caller) =>
      caller.controls.createDraft({
        organizationSlug: input.organizationSlug,
        title: input.title,
      }),
    201,
  );

  expect(draftResponse.status).toBe(201);

  const publishResponse = await callTRPC(
    input.headers,
    (caller) =>
      caller.controls.publishDraft({
        businessMeaning: 'Release teams must verify this requirement before completion.',
        draftControlId: draftResponse.body.draftControl.id,
        organizationSlug: input.organizationSlug,
      }),
    201,
  );

  expect(publishResponse.status).toBe(201);

  return publishResponse.body.control;
}

async function publishControlUpdate(input: {
  businessMeaning: string;
  controlId: string;
  headers: Headers;
  organizationSlug: string;
  title: string;
}) {
  const proposedUpdateResponse = await callTRPC(
    input.headers,
    (caller) =>
      caller.controls.createProposedUpdate({
        businessMeaning: input.businessMeaning,
        controlId: input.controlId,
        organizationSlug: input.organizationSlug,
        title: input.title,
      }),
    201,
  );

  expect(proposedUpdateResponse.status).toBe(201);

  const publishResponse = await callTRPC(
    input.headers,
    (caller) =>
      caller.controls.publishProposedUpdate({
        controlId: input.controlId,
        organizationSlug: input.organizationSlug,
        proposedUpdateId: proposedUpdateResponse.body.proposedUpdate.id,
      }),
    201,
  );

  expect(publishResponse.status).toBe(201);

  return publishResponse.body.control;
}

async function archiveControl(input: {
  controlId: string;
  headers: Headers;
  organizationSlug: string;
}) {
  return callTRPC(input.headers, (caller) =>
    caller.controls.archive({
      controlId: input.controlId,
      organizationSlug: input.organizationSlug,
    }),
  );
}

async function createProjectChecklist(input: {
  checklistTemplateId?: string;
  controlIds?: string[];
  headers: Headers;
  name: string;
  organizationSlug: string;
  projectSlug: string;
}) {
  return callTRPC(
    input.headers,
    (caller) =>
      caller.checklists.createProjectChecklist({
        checklistTemplateId: input.checklistTemplateId,
        controlIds: input.controlIds,
        name: input.name,
        organizationSlug: input.organizationSlug,
        projectSlug: input.projectSlug,
      } as never),
    201,
  );
}

async function listProjectChecklists(input: {
  headers: Headers;
  organizationSlug: string;
  projectSlug: string;
  status?: 'active' | 'archived';
}) {
  return callTRPC(input.headers, (caller) =>
    caller.checklists.listProjectChecklists({
      organizationSlug: input.organizationSlug,
      projectSlug: input.projectSlug,
      status: input.status,
    } as never),
  );
}

async function renameProjectChecklist(input: {
  headers: Headers;
  name: string;
  organizationSlug: string;
  projectChecklistId: string;
}) {
  return callTRPC(input.headers, (caller) =>
    caller.checklists.renameProjectChecklist({
      name: input.name,
      organizationSlug: input.organizationSlug,
      projectChecklistId: input.projectChecklistId,
    }),
  );
}

async function archiveProjectChecklist(input: {
  headers: Headers;
  organizationSlug: string;
  projectChecklistId: string;
}) {
  return callTRPC(input.headers, (caller) =>
    caller.checklists.archiveProjectChecklist({
      organizationSlug: input.organizationSlug,
      projectChecklistId: input.projectChecklistId,
    }),
  );
}

async function restoreProjectChecklist(input: {
  headers: Headers;
  organizationSlug: string;
  projectChecklistId: string;
}) {
  return callTRPC(input.headers, (caller) =>
    caller.checklists.restoreProjectChecklist({
      organizationSlug: input.organizationSlug,
      projectChecklistId: input.projectChecklistId,
    }),
  );
}

async function createChecklistTemplate(input: {
  controlIds: string[];
  headers: Headers;
  name: string;
  organizationSlug: string;
}) {
  return callTRPC(
    input.headers,
    (caller) =>
      caller.checklists.createTemplate({
        controlIds: input.controlIds,
        name: input.name,
        organizationSlug: input.organizationSlug,
      }),
    201,
  );
}

async function listChecklistTemplates(input: {
  headers: Headers;
  organizationSlug: string;
  status?: 'active' | 'archived';
}) {
  return callTRPC(input.headers, (caller) =>
    caller.checklists.listTemplates({
      organizationSlug: input.organizationSlug,
      status: input.status,
    } as never),
  );
}

async function renameChecklistTemplate(input: {
  checklistTemplateId: string;
  headers: Headers;
  name: string;
  organizationSlug: string;
}) {
  return callTRPC(input.headers, (caller) =>
    caller.checklists.renameTemplate({
      checklistTemplateId: input.checklistTemplateId,
      name: input.name,
      organizationSlug: input.organizationSlug,
    }),
  );
}

async function archiveChecklistTemplate(input: {
  checklistTemplateId: string;
  headers: Headers;
  organizationSlug: string;
}) {
  return callTRPC(input.headers, (caller) =>
    caller.checklists.archiveTemplate({
      checklistTemplateId: input.checklistTemplateId,
      organizationSlug: input.organizationSlug,
    }),
  );
}

async function restoreChecklistTemplate(input: {
  checklistTemplateId: string;
  headers: Headers;
  organizationSlug: string;
}) {
  return callTRPC(input.headers, (caller) =>
    caller.checklists.restoreTemplate({
      checklistTemplateId: input.checklistTemplateId,
      organizationSlug: input.organizationSlug,
    }),
  );
}

async function setChecklistItemChecked(input: {
  checked: boolean;
  checklistItemId: string;
  headers: Headers;
  organizationSlug: string;
}) {
  return callTRPC(input.headers, (caller) =>
    caller.checklists.setChecklistItemChecked({
      checked: input.checked,
      checklistItemId: input.checklistItemId,
      organizationSlug: input.organizationSlug,
    }),
  );
}

async function refreshChecklistItem(input: {
  checklistItemId: string;
  headers: Headers;
  organizationSlug: string;
}) {
  return callTRPC(input.headers, (caller) =>
    caller.checklists.refreshChecklistItem({
      checklistItemId: input.checklistItemId,
      organizationSlug: input.organizationSlug,
    }),
  );
}

async function removeChecklistItem(input: {
  checklistItemId: string;
  headers: Headers;
  organizationSlug: string;
}) {
  return callTRPC(input.headers, (caller) =>
    caller.checklists.removeChecklistItem({
      checklistItemId: input.checklistItemId,
      organizationSlug: input.organizationSlug,
    }),
  );
}

async function addChecklistItem(input: {
  controlId: string;
  headers: Headers;
  organizationSlug: string;
  projectChecklistId: string;
}) {
  return callTRPC(
    input.headers,
    (caller) =>
      caller.checklists.addChecklistItem({
        controlId: input.controlId,
        organizationSlug: input.organizationSlug,
        projectChecklistId: input.projectChecklistId,
      }),
    201,
  );
}

async function enforceArchivedControl(input: {
  controlId: string;
  headers: Headers;
  organizationSlug: string;
  projectChecklistId: string;
}) {
  return callTRPC(input.headers, (caller) =>
    caller.checklists.enforceArchivedControl({
      controlId: input.controlId,
      organizationSlug: input.organizationSlug,
      projectChecklistId: input.projectChecklistId,
    }),
  );
}

async function listAuditEvents(organizationSlug: string, headers: Headers) {
  return callTRPC(headers, (caller) => caller.auditLog.list({ organizationSlug }));
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

describe('Project Checklists', () => {
  it('lets Organization owners create a Project Checklist from active Controls', async () => {
    const { headers, organization } = await createSignedInOwner('checklist-owner');
    const ownerMembership = await getFirstMembership(organization.id);
    const project = await createProject({
      headers,
      organizationSlug: organization.slug,
      projectOwnerMemberId: ownerMembership.id,
    });
    const control = await createActiveControl({
      headers,
      organizationSlug: organization.slug,
      title: 'Verify access review',
    });

    const response = await createProjectChecklist({
      controlIds: [control.id],
      headers,
      name: 'Release readiness',
      organizationSlug: organization.slug,
      projectSlug: project.slug,
    });

    expect(response.status).toBe(201);
    expect(response.body.projectChecklist).toMatchObject({
      isComplete: false,
      name: 'Release readiness',
      projectSlug: project.slug,
      status: 'active',
    });
    expect(response.body.projectChecklist.items).toEqual([
      expect.objectContaining({
        checked: false,
        controlCode: control.controlCode,
        controlId: control.id,
        controlTitle: control.title,
        controlVersionId: control.currentVersion.id,
        controlVersionNumber: 1,
        itemStatus: 'active',
      }),
    ]);
  });

  it('rejects empty Checklist Templates at the domain service boundary', async () => {
    const { organization } = await createSignedInOwner('checklist-empty-template-owner');
    const ownerMembership = await getFirstMembership(organization.id);

    await expect(
      createChecklistTemplateForMember(
        {
          id: ownerMembership.id,
          organizationId: organization.id,
          organizationSlug: organization.slug,
          role: 'owner',
        },
        {
          controlIds: [],
          name: 'Empty template',
        },
      ),
    ).rejects.toThrow('Checklist Template needs at least one selected Control.');
  });

  it('rejects Checklist Items whose Control Version belongs to another Control', async () => {
    const { headers, organization } = await createSignedInOwner('checklist-version-link-owner');
    const ownerMembership = await getFirstMembership(organization.id);
    const project = await createProject({
      headers,
      organizationSlug: organization.slug,
      projectOwnerMemberId: ownerMembership.id,
    });
    const firstControl = await createActiveControl({
      headers,
      organizationSlug: organization.slug,
      title: 'Verify production access',
    });
    const secondControl = await createActiveControl({
      headers,
      organizationSlug: organization.slug,
      title: 'Verify change approval',
    });
    const checklistResponse = await createProjectChecklist({
      controlIds: [firstControl.id],
      headers,
      name: 'Version integrity',
      organizationSlug: organization.slug,
      projectSlug: project.slug,
    });
    const projectChecklist = checklistResponse.body.projectChecklist;

    await expect(
      db.insert(checklistItems).values({
        checked: false,
        controlId: firstControl.id,
        controlVersionId: secondControl.currentVersion.id,
        id: crypto.randomUUID(),
        projectChecklistId: projectChecklist.id,
        status: 'removed',
      }),
    ).rejects.toThrow();
  });

  it('lets only the Project Owner check and uncheck Checklist Items', async () => {
    const { headers: ownerHeaders, organization } =
      await createSignedInOwner('checklist-state-owner');
    const projectOwner = await createSignedInMember({
      organizationId: organization.id,
      ownerHeaders,
      prefix: 'checklist-project-owner',
      role: 'member',
    });
    const project = await createProject({
      headers: ownerHeaders,
      organizationSlug: organization.slug,
      projectOwnerMemberId: projectOwner.membership.id,
    });
    const control = await createActiveControl({
      headers: ownerHeaders,
      organizationSlug: organization.slug,
      title: 'Verify deployment approval',
    });
    const checklistResponse = await createProjectChecklist({
      controlIds: [control.id],
      headers: ownerHeaders,
      name: 'Owner completion',
      organizationSlug: organization.slug,
      projectSlug: project.slug,
    });
    const checklistItemId = checklistResponse.body.projectChecklist.items[0]?.id;

    expect(checklistItemId).toBeTruthy();

    if (!checklistItemId) {
      throw new Error('Expected a Checklist Item.');
    }

    const forbiddenOwnerResponse = await setChecklistItemChecked({
      checked: true,
      checklistItemId,
      headers: ownerHeaders,
      organizationSlug: organization.slug,
    });
    const checkedResponse = await setChecklistItemChecked({
      checked: true,
      checklistItemId,
      headers: projectOwner.headers,
      organizationSlug: organization.slug,
    });
    const uncheckedResponse = await setChecklistItemChecked({
      checked: false,
      checklistItemId,
      headers: projectOwner.headers,
      organizationSlug: organization.slug,
    });

    expect(forbiddenOwnerResponse.status).toBe(403);
    expect(checkedResponse.status).toBe(200);
    expect(checkedResponse.body.projectChecklist).toMatchObject({
      isComplete: true,
      items: [expect.objectContaining({ checked: true, id: checklistItemId })],
    });
    expect(uncheckedResponse.status).toBe(200);
    expect(uncheckedResponse.body.projectChecklist).toMatchObject({
      isComplete: false,
      items: [expect.objectContaining({ checked: false, id: checklistItemId })],
    });
  });

  it('uses Project Assignments for Project Checklist visibility and checking', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner(
      'checklist-assignment-owner',
    );
    const projectOwner = await createSignedInMember({
      organizationId: organization.id,
      ownerHeaders,
      prefix: 'checklist-assignment-project-owner',
      role: 'member',
    });
    const contributor = await createSignedInMember({
      organizationId: organization.id,
      ownerHeaders,
      prefix: 'checklist-assignment-contributor',
      role: 'member',
    });
    const unassigned = await createSignedInMember({
      organizationId: organization.id,
      ownerHeaders,
      prefix: 'checklist-assignment-unassigned',
      role: 'member',
    });
    const project = await createProject({
      headers: ownerHeaders,
      organizationSlug: organization.slug,
      projectOwnerMemberId: projectOwner.membership.id,
    });

    await createProjectAssignment({
      headers: ownerHeaders,
      organizationMemberId: contributor.membership.id,
      organizationSlug: organization.slug,
      projectSlug: project.slug,
      role: 'project_contributor',
    });

    const control = await createActiveControl({
      headers: ownerHeaders,
      organizationSlug: organization.slug,
      title: 'Verify assignment-scoped checklist access',
    });
    const checklistResponse = await createProjectChecklist({
      controlIds: [control.id],
      headers: ownerHeaders,
      name: 'Assignment-scoped checklist',
      organizationSlug: organization.slug,
      projectSlug: project.slug,
    });
    const checklistItemId = checklistResponse.body.projectChecklist.items[0]?.id;

    expect(checklistItemId).toBeTruthy();

    if (!checklistItemId) {
      throw new Error('Expected a Checklist Item.');
    }

    await expect(
      listProjectChecklists({
        headers: contributor.headers,
        organizationSlug: organization.slug,
        projectSlug: project.slug,
      }),
    ).resolves.toMatchObject({
      body: { projectChecklists: [{ name: 'Assignment-scoped checklist' }] },
      status: 200,
    });
    await expect(
      listProjectChecklists({
        headers: unassigned.headers,
        organizationSlug: organization.slug,
        projectSlug: project.slug,
      }),
    ).resolves.toMatchObject({ body: { error: 'Project unavailable' }, status: 404 });
    await expect(
      setChecklistItemChecked({
        checked: true,
        checklistItemId,
        headers: contributor.headers,
        organizationSlug: organization.slug,
      }),
    ).resolves.toMatchObject({
      body: { error: 'Only the Project Owner can check Checklist Items.' },
      status: 403,
    });
    await expect(
      setChecklistItemChecked({
        checked: true,
        checklistItemId,
        headers: ownerHeaders,
        organizationSlug: organization.slug,
      }),
    ).resolves.toMatchObject({
      body: { error: 'Only the Project Owner can check Checklist Items.' },
      status: 403,
    });

    const checkedResponse = await setChecklistItemChecked({
      checked: true,
      checklistItemId,
      headers: projectOwner.headers,
      organizationSlug: organization.slug,
    });

    expect(checkedResponse.status).toBe(200);
    expect(checkedResponse.body.projectChecklist).toMatchObject({
      items: [expect.objectContaining({ checked: true, id: checklistItemId })],
    });
  });

  it('blocks Checklist Item checking on ownerless Projects', async () => {
    const { headers, organization } = await createSignedInOwner('checklist-ownerless-owner');
    const project = await createProject({
      headers,
      organizationSlug: organization.slug,
      projectOwnerMemberId: null,
    });
    const control = await createActiveControl({
      headers,
      organizationSlug: organization.slug,
      title: 'Verify ownerless checklist completion',
    });
    const checklistResponse = await createProjectChecklist({
      controlIds: [control.id],
      headers,
      name: 'Ownerless checklist',
      organizationSlug: organization.slug,
      projectSlug: project.slug,
    });
    const checklistItemId = checklistResponse.body.projectChecklist.items[0]?.id;

    expect(checklistItemId).toBeTruthy();

    if (!checklistItemId) {
      throw new Error('Expected a Checklist Item.');
    }

    await expect(
      setChecklistItemChecked({
        checked: true,
        checklistItemId,
        headers,
        organizationSlug: organization.slug,
      }),
    ).resolves.toMatchObject({
      body: { error: 'Only the Project Owner can check Checklist Items.' },
      status: 403,
    });
  });

  it('records Audit Events for Checklist creation and Checklist Item state changes', async () => {
    const { headers: ownerHeaders, organization } =
      await createSignedInOwner('checklist-audit-owner');
    const projectOwner = await createSignedInMember({
      organizationId: organization.id,
      ownerHeaders,
      prefix: 'checklist-audit-project-owner',
      role: 'member',
    });
    const project = await createProject({
      headers: ownerHeaders,
      organizationSlug: organization.slug,
      projectOwnerMemberId: projectOwner.membership.id,
    });
    const control = await createActiveControl({
      headers: ownerHeaders,
      organizationSlug: organization.slug,
      title: 'Verify audited checklist state',
    });

    const templateResponse = await createChecklistTemplate({
      controlIds: [control.id],
      headers: ownerHeaders,
      name: 'Audited checklist template',
      organizationSlug: organization.slug,
    });
    const checklistTemplate = templateResponse.body.checklistTemplate;
    const checklistResponse = await createProjectChecklist({
      checklistTemplateId: checklistTemplate.id,
      headers: ownerHeaders,
      name: 'Audited project checklist',
      organizationSlug: organization.slug,
      projectSlug: project.slug,
    });
    const projectChecklist = checklistResponse.body.projectChecklist;
    const checklistItem = projectChecklist.items[0];

    expect(checklistItem?.id).toBeTruthy();

    if (!checklistItem?.id) {
      throw new Error('Expected a Checklist Item.');
    }

    await setChecklistItemChecked({
      checked: true,
      checklistItemId: checklistItem.id,
      headers: projectOwner.headers,
      organizationSlug: organization.slug,
    });
    await setChecklistItemChecked({
      checked: false,
      checklistItemId: checklistItem.id,
      headers: projectOwner.headers,
      organizationSlug: organization.slug,
    });

    await expect(listAuditEvents(organization.slug, ownerHeaders)).resolves.toMatchObject({
      body: {
        auditEvents: expect.arrayContaining([
          expect.objectContaining({
            action: 'checklist_template.created',
            targetDisplayName: 'Audited checklist template',
            targetId: checklistTemplate.id,
            targetType: 'checklist_template',
          }),
          expect.objectContaining({
            action: 'project_checklist.created',
            targetDisplayName: 'Audited project checklist',
            targetId: projectChecklist.id,
            targetSecondaryLabel: project.slug,
            targetType: 'project_checklist',
          }),
          expect.objectContaining({
            action: 'checklist_item.checked',
            targetDisplayName: 'Verify audited checklist state',
            targetId: checklistItem.id,
            targetSecondaryLabel: control.controlCode,
            targetType: 'checklist_item',
          }),
          expect.objectContaining({
            action: 'checklist_item.unchecked',
            targetDisplayName: 'Verify audited checklist state',
            targetId: checklistItem.id,
            targetSecondaryLabel: control.controlCode,
            targetType: 'checklist_item',
          }),
        ]),
      },
      status: 200,
    });
  });

  it('keeps Checklist Templates visible and manageable only by owners and admins', async () => {
    const { headers: ownerHeaders, organization } = await createSignedInOwner(
      'checklist-template-owner',
    );
    const member = await createSignedInMember({
      organizationId: organization.id,
      ownerHeaders,
      prefix: 'checklist-template-member',
      role: 'member',
    });
    const ownerMembership = await getFirstMembership(organization.id);
    const project = await createProject({
      headers: ownerHeaders,
      organizationSlug: organization.slug,
      projectOwnerMemberId: ownerMembership.id,
    });
    const control = await createActiveControl({
      headers: ownerHeaders,
      organizationSlug: organization.slug,
      title: 'Verify template control',
    });

    const forbiddenCreateResponse = await createChecklistTemplate({
      controlIds: [control.id],
      headers: member.headers,
      name: 'Member template',
      organizationSlug: organization.slug,
    });
    const createTemplateResponse = await createChecklistTemplate({
      controlIds: [control.id],
      headers: ownerHeaders,
      name: 'Release template',
      organizationSlug: organization.slug,
    });
    const forbiddenListResponse = await listChecklistTemplates({
      headers: member.headers,
      organizationSlug: organization.slug,
    });
    const listResponse = await listChecklistTemplates({
      headers: ownerHeaders,
      organizationSlug: organization.slug,
    });
    const createChecklistResponse = await createProjectChecklist({
      checklistTemplateId: createTemplateResponse.body.checklistTemplate.id,
      headers: ownerHeaders,
      name: 'Template-created checklist',
      organizationSlug: organization.slug,
      projectSlug: project.slug,
    });

    expect(forbiddenCreateResponse.status).toBe(403);
    expect(createTemplateResponse.status).toBe(201);
    expect(createTemplateResponse.body.checklistTemplate).toMatchObject({
      name: 'Release template',
      status: 'active',
      controls: [expect.objectContaining({ controlId: control.id })],
    });
    expect(forbiddenListResponse.status).toBe(403);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.checklistTemplates).toEqual([
      expect.objectContaining({
        id: createTemplateResponse.body.checklistTemplate.id,
        name: 'Release template',
      }),
    ]);
    expect(createChecklistResponse.status).toBe(201);
    expect(createChecklistResponse.body.projectChecklist).toMatchObject({
      sourceChecklistTemplateId: createTemplateResponse.body.checklistTemplate.id,
      items: [
        expect.objectContaining({
          controlId: control.id,
          controlVersionId: control.currentVersion.id,
        }),
      ],
    });
  });

  it('refreshes old-version Checklist Items into new unchecked active items', async () => {
    const { headers, organization } = await createSignedInOwner('checklist-refresh-owner');
    const ownerMembership = await getFirstMembership(organization.id);
    const project = await createProject({
      headers,
      organizationSlug: organization.slug,
      projectOwnerMemberId: ownerMembership.id,
    });
    const control = await createActiveControl({
      headers,
      organizationSlug: organization.slug,
      title: 'Verify rollback plan',
    });
    const checklistResponse = await createProjectChecklist({
      controlIds: [control.id],
      headers,
      name: 'Refresh checklist',
      organizationSlug: organization.slug,
      projectSlug: project.slug,
    });
    const originalItemId = checklistResponse.body.projectChecklist.items[0]?.id;

    expect(originalItemId).toBeTruthy();

    if (!originalItemId) {
      throw new Error('Expected a Checklist Item.');
    }

    const checkedResponse = await setChecklistItemChecked({
      checked: true,
      checklistItemId: originalItemId,
      headers,
      organizationSlug: organization.slug,
    });
    const updatedControl = await publishControlUpdate({
      businessMeaning: 'Release teams must verify rollback ownership before completion.',
      controlId: control.id,
      headers,
      organizationSlug: organization.slug,
      title: 'Verify rollback ownership',
    });
    const refreshResponse = await refreshChecklistItem({
      checklistItemId: originalItemId,
      headers,
      organizationSlug: organization.slug,
    });

    expect(checkedResponse.body.projectChecklist).toMatchObject({ isComplete: true });
    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.body.projectChecklist).toMatchObject({ isComplete: false });
    expect(refreshResponse.body.projectChecklist.items).toEqual([
      expect.objectContaining({
        checked: true,
        controlVersionId: control.currentVersion.id,
        id: originalItemId,
        itemStatus: 'superseded',
      }),
      expect.objectContaining({
        checked: false,
        controlTitle: 'Verify rollback ownership',
        controlVersionId: updatedControl.currentVersion.id,
        controlVersionNumber: 2,
        itemStatus: 'active',
      }),
    ]);
    await expect(listAuditEvents(organization.slug, headers)).resolves.toMatchObject({
      body: {
        auditEvents: expect.arrayContaining([
          expect.objectContaining({
            action: 'checklist_item.refreshed',
            targetDisplayName: 'Verify rollback ownership',
            targetId: originalItemId,
            targetSecondaryLabel: control.controlCode,
            targetType: 'checklist_item',
          }),
        ]),
      },
      status: 200,
    });
  });

  it('retains removed Checklist Items and excludes them from completion', async () => {
    const { headers, organization } = await createSignedInOwner('checklist-remove-owner');
    const ownerMembership = await getFirstMembership(organization.id);
    const project = await createProject({
      headers,
      organizationSlug: organization.slug,
      projectOwnerMemberId: ownerMembership.id,
    });
    const checkedControl = await createActiveControl({
      headers,
      organizationSlug: organization.slug,
      title: 'Verify checked requirement',
    });
    const removedControl = await createActiveControl({
      headers,
      organizationSlug: organization.slug,
      title: 'Verify removed requirement',
    });
    const checklistResponse = await createProjectChecklist({
      controlIds: [checkedControl.id, removedControl.id],
      headers,
      name: 'Removal checklist',
      organizationSlug: organization.slug,
      projectSlug: project.slug,
    });
    const checkedItemId = checklistResponse.body.projectChecklist.items.find(
      (item) => item.controlId === checkedControl.id,
    )?.id;
    const removedItemId = checklistResponse.body.projectChecklist.items.find(
      (item) => item.controlId === removedControl.id,
    )?.id;

    expect(checkedItemId).toBeTruthy();
    expect(removedItemId).toBeTruthy();

    if (!checkedItemId || !removedItemId) {
      throw new Error('Expected Checklist Items.');
    }

    await setChecklistItemChecked({
      checked: true,
      checklistItemId: checkedItemId,
      headers,
      organizationSlug: organization.slug,
    });

    const removeResponse = await removeChecklistItem({
      checklistItemId: removedItemId,
      headers,
      organizationSlug: organization.slug,
    });
    const checkRemovedResponse = await setChecklistItemChecked({
      checked: true,
      checklistItemId: removedItemId,
      headers,
      organizationSlug: organization.slug,
    });

    expect(removeResponse.status).toBe(200);
    expect(removeResponse.body.projectChecklist).toMatchObject({ isComplete: true });
    expect(removeResponse.body.projectChecklist.items).toEqual([
      expect.objectContaining({
        checked: true,
        controlId: checkedControl.id,
        itemStatus: 'active',
      }),
      expect.objectContaining({
        checked: false,
        controlId: removedControl.id,
        id: removedItemId,
        itemStatus: 'removed',
      }),
    ]);
    expect(checkRemovedResponse.status).toBe(400);
  });

  it('lists, renames, archives, and restores Project Checklists', async () => {
    const { headers, organization } = await createSignedInOwner('checklist-lifecycle-owner');
    const ownerMembership = await getFirstMembership(organization.id);
    const project = await createProject({
      headers,
      organizationSlug: organization.slug,
      projectOwnerMemberId: ownerMembership.id,
    });
    const control = await createActiveControl({
      headers,
      organizationSlug: organization.slug,
      title: 'Verify lifecycle control',
    });
    const createResponse = await createProjectChecklist({
      controlIds: [control.id],
      headers,
      name: 'Lifecycle checklist',
      organizationSlug: organization.slug,
      projectSlug: project.slug,
    });
    const projectChecklistId = createResponse.body.projectChecklist.id;
    const itemId = createResponse.body.projectChecklist.items[0]?.id;

    expect(itemId).toBeTruthy();

    if (!itemId) {
      throw new Error('Expected a Checklist Item.');
    }

    const listResponse = await listProjectChecklists({
      headers,
      organizationSlug: organization.slug,
      projectSlug: project.slug,
    });
    const renameResponse = await renameProjectChecklist({
      headers,
      name: 'Renamed lifecycle checklist',
      organizationSlug: organization.slug,
      projectChecklistId,
    });
    const archiveResponse = await archiveProjectChecklist({
      headers,
      organizationSlug: organization.slug,
      projectChecklistId,
    });
    const archivedListResponse = await listProjectChecklists({
      headers,
      organizationSlug: organization.slug,
      projectSlug: project.slug,
      status: 'archived',
    });
    const checkedArchivedResponse = await setChecklistItemChecked({
      checked: true,
      checklistItemId: itemId,
      headers,
      organizationSlug: organization.slug,
    });
    const restoreResponse = await restoreProjectChecklist({
      headers,
      organizationSlug: organization.slug,
      projectChecklistId,
    });

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.projectChecklists).toEqual([
      expect.objectContaining({
        id: projectChecklistId,
        name: 'Lifecycle checklist',
        status: 'active',
      }),
    ]);
    expect(renameResponse.status).toBe(200);
    expect(renameResponse.body.projectChecklist).toMatchObject({
      id: projectChecklistId,
      name: 'Renamed lifecycle checklist',
      status: 'active',
    });
    expect(archiveResponse.status).toBe(200);
    expect(archiveResponse.body.projectChecklist).toMatchObject({
      id: projectChecklistId,
      status: 'archived',
    });
    expect(archivedListResponse.status).toBe(200);
    expect(archivedListResponse.body.projectChecklists).toEqual([
      expect.objectContaining({
        id: projectChecklistId,
        name: 'Renamed lifecycle checklist',
        status: 'archived',
      }),
    ]);
    expect(checkedArchivedResponse.status).toBe(400);
    expect(restoreResponse.status).toBe(200);
    expect(restoreResponse.body.projectChecklist).toMatchObject({
      id: projectChecklistId,
      status: 'active',
    });
    await expect(listAuditEvents(organization.slug, headers)).resolves.toMatchObject({
      body: {
        auditEvents: expect.arrayContaining([
          expect.objectContaining({
            action: 'project_checklist.renamed',
            metadata: {
              changes: {
                name: {
                  from: 'Lifecycle checklist',
                  to: 'Renamed lifecycle checklist',
                },
              },
            },
            targetDisplayName: 'Renamed lifecycle checklist',
            targetId: projectChecklistId,
            targetType: 'project_checklist',
          }),
          expect.objectContaining({
            action: 'project_checklist.archived',
            targetDisplayName: 'Renamed lifecycle checklist',
            targetId: projectChecklistId,
            targetType: 'project_checklist',
          }),
          expect.objectContaining({
            action: 'project_checklist.restored',
            targetDisplayName: 'Renamed lifecycle checklist',
            targetId: projectChecklistId,
            targetType: 'project_checklist',
          }),
        ]),
      },
      status: 200,
    });
  });

  it('renames, archives, lists, and restores Checklist Templates', async () => {
    const { headers, organization } = await createSignedInOwner('checklist-template-lifecycle');
    const control = await createActiveControl({
      headers,
      organizationSlug: organization.slug,
      title: 'Verify template lifecycle',
    });
    const createResponse = await createChecklistTemplate({
      controlIds: [control.id],
      headers,
      name: 'Template lifecycle',
      organizationSlug: organization.slug,
    });
    const checklistTemplateId = createResponse.body.checklistTemplate.id;

    const renameResponse = await renameChecklistTemplate({
      checklistTemplateId,
      headers,
      name: 'Renamed template lifecycle',
      organizationSlug: organization.slug,
    });
    const archiveResponse = await archiveChecklistTemplate({
      checklistTemplateId,
      headers,
      organizationSlug: organization.slug,
    });
    const archivedListResponse = await listChecklistTemplates({
      headers,
      organizationSlug: organization.slug,
      status: 'archived',
    });
    const reusedNameResponse = await createChecklistTemplate({
      controlIds: [control.id],
      headers,
      name: 'Renamed template lifecycle',
      organizationSlug: organization.slug,
    });
    const conflictingRestoreResponse = await restoreChecklistTemplate({
      checklistTemplateId,
      headers,
      organizationSlug: organization.slug,
    });

    expect(renameResponse.status).toBe(200);
    expect(renameResponse.body.checklistTemplate).toMatchObject({
      id: checklistTemplateId,
      name: 'Renamed template lifecycle',
      status: 'active',
    });
    expect(archiveResponse.status).toBe(200);
    expect(archiveResponse.body.checklistTemplate).toMatchObject({
      id: checklistTemplateId,
      status: 'archived',
    });
    expect(archivedListResponse.status).toBe(200);
    expect(archivedListResponse.body.checklistTemplates).toEqual([
      expect.objectContaining({
        id: checklistTemplateId,
        name: 'Renamed template lifecycle',
        status: 'archived',
      }),
    ]);
    expect(reusedNameResponse.status).toBe(201);
    expect(conflictingRestoreResponse.status).toBe(400);
    await expect(listAuditEvents(organization.slug, headers)).resolves.toMatchObject({
      body: {
        auditEvents: expect.arrayContaining([
          expect.objectContaining({
            action: 'checklist_template.renamed',
            metadata: {
              changes: {
                name: {
                  from: 'Template lifecycle',
                  to: 'Renamed template lifecycle',
                },
              },
            },
            targetDisplayName: 'Renamed template lifecycle',
            targetId: checklistTemplateId,
            targetType: 'checklist_template',
          }),
          expect.objectContaining({
            action: 'checklist_template.archived',
            targetDisplayName: 'Renamed template lifecycle',
            targetId: checklistTemplateId,
            targetType: 'checklist_template',
          }),
        ]),
      },
      status: 200,
    });
  });

  it('adds active Controls and enforces Archived Control removal per Project Checklist', async () => {
    const { headers, organization } = await createSignedInOwner('checklist-add-item-owner');
    const ownerMembership = await getFirstMembership(organization.id);
    const project = await createProject({
      headers,
      organizationSlug: organization.slug,
      projectOwnerMemberId: ownerMembership.id,
    });
    const firstControl = await createActiveControl({
      headers,
      organizationSlug: organization.slug,
      title: 'Verify first add item control',
    });
    const secondControl = await createActiveControl({
      headers,
      organizationSlug: organization.slug,
      title: 'Verify second add item control',
    });
    const createResponse = await createProjectChecklist({
      controlIds: [firstControl.id],
      headers,
      name: 'Add item checklist',
      organizationSlug: organization.slug,
      projectSlug: project.slug,
    });
    const projectChecklistId = createResponse.body.projectChecklist.id;

    const addResponse = await addChecklistItem({
      controlId: secondControl.id,
      headers,
      organizationSlug: organization.slug,
      projectChecklistId,
    });
    const duplicateAddResponse = await addChecklistItem({
      controlId: secondControl.id,
      headers,
      organizationSlug: organization.slug,
      projectChecklistId,
    });
    const archiveControlResponse = await archiveControl({
      controlId: secondControl.id,
      headers,
      organizationSlug: organization.slug,
    });
    const archivedAddResponse = await addChecklistItem({
      controlId: secondControl.id,
      headers,
      organizationSlug: organization.slug,
      projectChecklistId,
    });
    const enforceResponse = await enforceArchivedControl({
      controlId: secondControl.id,
      headers,
      organizationSlug: organization.slug,
      projectChecklistId,
    });

    expect(addResponse.status).toBe(201);
    expect(addResponse.body.projectChecklist.items).toEqual([
      expect.objectContaining({ controlId: firstControl.id, itemStatus: 'active' }),
      expect.objectContaining({
        checked: false,
        controlId: secondControl.id,
        controlVersionId: secondControl.currentVersion.id,
        itemStatus: 'active',
      }),
    ]);
    expect(duplicateAddResponse.status).toBe(400);
    expect(archiveControlResponse.status).toBe(200);
    expect(archivedAddResponse.status).toBe(400);
    expect(enforceResponse.status).toBe(200);
    expect(enforceResponse.body.projectChecklist.items).toEqual([
      expect.objectContaining({ controlId: firstControl.id, itemStatus: 'active' }),
      expect.objectContaining({ controlId: secondControl.id, itemStatus: 'removed' }),
    ]);
    await expect(listAuditEvents(organization.slug, headers)).resolves.toMatchObject({
      body: {
        auditEvents: expect.arrayContaining([
          expect.objectContaining({
            action: 'checklist_item.added',
            targetDisplayName: 'Verify second add item control',
            targetSecondaryLabel: secondControl.controlCode,
            targetType: 'checklist_item',
          }),
          expect.objectContaining({
            action: 'checklist_item.removed',
            targetDisplayName: 'Verify second add item control',
            targetSecondaryLabel: secondControl.controlCode,
            targetType: 'checklist_item',
          }),
        ]),
      },
      status: 200,
    });
  });

  it('keeps Project Checklists on Archived Projects read-only', async () => {
    const { headers, organization } = await createSignedInOwner('checklist-archived-project');
    const ownerMembership = await getFirstMembership(organization.id);
    const project = await createProject({
      headers,
      organizationSlug: organization.slug,
      projectOwnerMemberId: ownerMembership.id,
    });
    const control = await createActiveControl({
      headers,
      organizationSlug: organization.slug,
      title: 'Verify archived project control',
    });
    const extraControl = await createActiveControl({
      headers,
      organizationSlug: organization.slug,
      title: 'Verify archived project extra control',
    });
    const createResponse = await createProjectChecklist({
      controlIds: [control.id],
      headers,
      name: 'Archived project checklist',
      organizationSlug: organization.slug,
      projectSlug: project.slug,
    });
    const projectChecklistId = createResponse.body.projectChecklist.id;
    const checklistItemId = createResponse.body.projectChecklist.items[0]?.id;

    expect(checklistItemId).toBeTruthy();

    if (!checklistItemId) {
      throw new Error('Expected a Checklist Item.');
    }

    const archiveProjectResponse = await archiveProject({
      headers,
      organizationSlug: organization.slug,
      projectSlug: project.slug,
    });
    const listResponse = await listProjectChecklists({
      headers,
      organizationSlug: organization.slug,
      projectSlug: project.slug,
    });
    const createOnArchivedProjectResponse = await createProjectChecklist({
      controlIds: [extraControl.id],
      headers,
      name: 'Blocked archived project checklist',
      organizationSlug: organization.slug,
      projectSlug: project.slug,
    });
    const checkResponse = await setChecklistItemChecked({
      checked: true,
      checklistItemId,
      headers,
      organizationSlug: organization.slug,
    });
    const addResponse = await addChecklistItem({
      controlId: extraControl.id,
      headers,
      organizationSlug: organization.slug,
      projectChecklistId,
    });
    const renameResponse = await renameProjectChecklist({
      headers,
      name: 'Blocked rename',
      organizationSlug: organization.slug,
      projectChecklistId,
    });
    const archiveChecklistResponse = await archiveProjectChecklist({
      headers,
      organizationSlug: organization.slug,
      projectChecklistId,
    });

    expect(archiveProjectResponse.status).toBe(200);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.projectChecklists).toEqual([
      expect.objectContaining({
        id: projectChecklistId,
        status: 'active',
      }),
    ]);
    expect(createOnArchivedProjectResponse.status).toBe(404);
    expect(checkResponse.status).toBe(400);
    expect(addResponse.status).toBe(400);
    expect(renameResponse.status).toBe(400);
    expect(archiveChecklistResponse.status).toBe(400);
  });
});
