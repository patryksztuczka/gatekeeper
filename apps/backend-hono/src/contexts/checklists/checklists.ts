import { and, asc, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  auditEvents,
  checklistItems,
  checklistTemplateControls,
  checklistTemplates,
  controls,
  controlVersions,
  projectChecklists,
  projects,
} from '../../db/schema';
import type { AuthorizedOrganizationMember } from '../../types/organization-types';
import { buildOrganizationMemberAuditEvent } from '../audit-log/audit-events';
import type { OrganizationAuthorizationPolicy } from '../identity-organization/organization-authorization';

type CreateProjectChecklistInput = {
  checklistTemplateId?: string;
  controlIds?: string[];
  name: string;
  projectSlug: string;
};

type CreateChecklistTemplateInput = {
  controlIds: string[];
  name: string;
};

export type ChecklistArchiveStatus = 'active' | 'archived';

const checklistManagerRoles = ['owner', 'admin'] as const;

export const checklistAuthorizationActions = {
  createTemplate: {
    allowedRoles: checklistManagerRoles,
    deniedMessage: 'Only Organization owners and admins can create Checklist Templates.',
  },
  createProjectChecklist: {
    allowedRoles: checklistManagerRoles,
    deniedMessage: 'Only Organization owners and admins can create Project Checklists.',
  },
  listProjectChecklists: {
    allowedRoles: 'any-member',
    deniedMessage: 'Only Organization members can view Project Checklists.',
  },
  listTemplates: {
    allowedRoles: checklistManagerRoles,
    deniedMessage: 'Only Organization owners and admins can view Checklist Templates.',
  },
  renameTemplate: {
    allowedRoles: checklistManagerRoles,
    deniedMessage: 'Only Organization owners and admins can rename Checklist Templates.',
  },
  archiveTemplate: {
    allowedRoles: checklistManagerRoles,
    deniedMessage: 'Only Organization owners and admins can archive Checklist Templates.',
  },
  restoreTemplate: {
    allowedRoles: checklistManagerRoles,
    deniedMessage: 'Only Organization owners and admins can restore Checklist Templates.',
  },
  refreshChecklistItem: {
    allowedRoles: checklistManagerRoles,
    deniedMessage: 'Only Organization owners and admins can refresh Checklist Items.',
  },
  removeChecklistItem: {
    allowedRoles: checklistManagerRoles,
    deniedMessage: 'Only Organization owners and admins can remove Checklist Items.',
  },
  addChecklistItem: {
    allowedRoles: checklistManagerRoles,
    deniedMessage: 'Only Organization owners and admins can add Checklist Items.',
  },
  enforceArchivedControl: {
    allowedRoles: checklistManagerRoles,
    deniedMessage: 'Only Organization owners and admins can enforce Archived Controls.',
  },
  renameProjectChecklist: {
    allowedRoles: checklistManagerRoles,
    deniedMessage: 'Only Organization owners and admins can rename Project Checklists.',
  },
  archiveProjectChecklist: {
    allowedRoles: checklistManagerRoles,
    deniedMessage: 'Only Organization owners and admins can archive Project Checklists.',
  },
  restoreProjectChecklist: {
    allowedRoles: checklistManagerRoles,
    deniedMessage: 'Only Organization owners and admins can restore Project Checklists.',
  },
  setChecklistItemChecked: {
    allowedRoles: 'any-member',
    deniedMessage: 'Only Organization members can update Checklist Items.',
  },
} satisfies Record<string, OrganizationAuthorizationPolicy>;

export class ChecklistInputError extends Error {}
export class ChecklistPermissionError extends Error {}

export async function createChecklistTemplateForMember(
  membership: AuthorizedOrganizationMember,
  input: CreateChecklistTemplateInput,
) {
  const body = normalizeCreateChecklistTemplateBody(input);

  validateChecklistTemplateName(body.name);
  validateChecklistTemplateControlIds(body.controlIds);
  validateUniqueControlIds(
    body.controlIds,
    'A Control can appear only once in a Checklist Template.',
  );

  const existingTemplate = await db
    .select({ id: checklistTemplates.id })
    .from(checklistTemplates)
    .where(
      and(
        eq(checklistTemplates.organizationId, membership.organizationId),
        eq(checklistTemplates.name, body.name.trim()),
        isNull(checklistTemplates.archivedAt),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (existingTemplate) {
    throw new ChecklistInputError('Checklist Template name is already used in this Organization.');
  }

  const selectedControls = await getLatestActiveControlVersions(
    membership.organizationId,
    body.controlIds,
  );

  if (selectedControls.length !== body.controlIds.length) {
    throw new ChecklistInputError('Checklist Templates can use only active Controls.');
  }

  const now = new Date();
  const checklistTemplateId = crypto.randomUUID();

  const templateName = body.name.trim();

  await db.batch([
    db.insert(checklistTemplates).values({
      createdAt: now,
      id: checklistTemplateId,
      name: templateName,
      organizationId: membership.organizationId,
      updatedAt: now,
    }),
    db.insert(checklistTemplateControls).values(
      selectedControls.map((control) => ({
        checklistTemplateId,
        controlId: control.controlId,
        createdAt: now,
        id: crypto.randomUUID(),
      })),
    ),
    db.insert(auditEvents).values(
      await buildOrganizationMemberAuditEvent({
        action: 'checklist_template.created',
        membership,
        target: {
          displayName: templateName,
          id: checklistTemplateId,
          type: 'checklist_template',
        },
      }),
    ),
  ]);

  const checklistTemplate = await getChecklistTemplateDetail(membership, checklistTemplateId);

  if (!checklistTemplate) {
    throw new ChecklistInputError('Checklist Template unavailable.');
  }

  return checklistTemplate;
}

export async function listChecklistTemplatesForMember(
  membership: AuthorizedOrganizationMember,
  status: ChecklistArchiveStatus,
) {
  const rows = await db
    .select({ id: checklistTemplates.id })
    .from(checklistTemplates)
    .where(
      and(
        eq(checklistTemplates.organizationId, membership.organizationId),
        status === 'archived'
          ? isNotNull(checklistTemplates.archivedAt)
          : isNull(checklistTemplates.archivedAt),
      ),
    )
    .orderBy(asc(checklistTemplates.createdAt), asc(checklistTemplates.name));

  const templates = await Promise.all(
    rows.map((row) => getChecklistTemplateDetail(membership, row.id)),
  );

  return templates.filter((template) => template !== null);
}

export async function renameChecklistTemplateForMember(
  membership: AuthorizedOrganizationMember,
  input: { checklistTemplateId: string; name: string },
) {
  validateChecklistTemplateName(input.name);

  const template = await getChecklistTemplateForManagement(membership, input.checklistTemplateId);

  if (!template) {
    return null;
  }

  if (template.archivedAt) {
    throw new ChecklistInputError('Only active Checklist Templates can be renamed.');
  }

  await ensureChecklistTemplateNameAvailable({
    excludeChecklistTemplateId: template.id,
    name: input.name,
    organizationId: membership.organizationId,
  });

  await db
    .update(checklistTemplates)
    .set({ name: input.name.trim(), updatedAt: new Date() })
    .where(eq(checklistTemplates.id, template.id));

  return getChecklistTemplateDetail(membership, template.id);
}

export async function archiveChecklistTemplateForMember(
  membership: AuthorizedOrganizationMember,
  checklistTemplateId: string,
) {
  return setChecklistTemplateArchivedForMember({
    archived: true,
    checklistTemplateId,
    membership,
  });
}

export async function restoreChecklistTemplateForMember(
  membership: AuthorizedOrganizationMember,
  checklistTemplateId: string,
) {
  return setChecklistTemplateArchivedForMember({
    archived: false,
    checklistTemplateId,
    membership,
  });
}

export async function createProjectChecklistForMember(
  membership: AuthorizedOrganizationMember,
  input: CreateProjectChecklistInput,
) {
  const body = normalizeCreateProjectChecklistBody(input);

  validateProjectChecklistName(body.name);

  const controlSource = await resolveProjectChecklistControlSource(membership, body);
  const uniqueControlIds = Array.from(new Set(controlSource.controlIds));

  validateUniqueControlIds(
    controlSource.controlIds,
    'A Control can appear only once in a Project Checklist.',
  );

  const project = await db
    .select({
      id: projects.id,
      slug: projects.slug,
    })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, membership.organizationId),
        eq(projects.slug, body.projectSlug),
        isNull(projects.archivedAt),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!project) {
    return null;
  }

  const existingChecklist = await db
    .select({ id: projectChecklists.id })
    .from(projectChecklists)
    .where(
      and(
        eq(projectChecklists.projectId, project.id),
        eq(projectChecklists.name, body.name.trim()),
        isNull(projectChecklists.archivedAt),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (existingChecklist) {
    throw new ChecklistInputError('Project Checklist name is already used on this Project.');
  }

  const selectedControls = await getLatestActiveControlVersions(
    membership.organizationId,
    uniqueControlIds,
  );

  if (selectedControls.length !== uniqueControlIds.length) {
    throw new ChecklistInputError('Project Checklists can use only active Controls.');
  }

  const now = new Date();
  const projectChecklistId = crypto.randomUUID();

  const projectChecklistName = body.name.trim();

  await db.batch([
    db.insert(projectChecklists).values({
      createdAt: now,
      id: projectChecklistId,
      name: projectChecklistName,
      projectId: project.id,
      sourceChecklistTemplateId: controlSource.checklistTemplateId,
      updatedAt: now,
    }),
    db.insert(checklistItems).values(
      selectedControls.map((control) => ({
        checked: false,
        controlId: control.controlId,
        controlVersionId: control.controlVersionId,
        createdAt: now,
        id: crypto.randomUUID(),
        projectChecklistId,
        status: 'active',
        updatedAt: now,
      })),
    ),
    db.insert(auditEvents).values(
      await buildOrganizationMemberAuditEvent({
        action: 'project_checklist.created',
        membership,
        target: {
          displayName: projectChecklistName,
          id: projectChecklistId,
          secondaryLabel: project.slug,
          type: 'project_checklist',
        },
      }),
    ),
  ]);

  return getProjectChecklistDetail({
    membership,
    projectChecklistId,
    projectSlug: project.slug,
  });
}

export async function listProjectChecklistsForMember(
  membership: AuthorizedOrganizationMember,
  input: { projectSlug: string; status: ChecklistArchiveStatus },
) {
  const project = await getProjectForChecklistAction(membership, input.projectSlug, {
    allowArchivedProject: true,
  });

  if (!project) {
    return null;
  }

  const rows = await db
    .select({ id: projectChecklists.id })
    .from(projectChecklists)
    .where(
      and(
        eq(projectChecklists.projectId, project.id),
        input.status === 'archived'
          ? isNotNull(projectChecklists.archivedAt)
          : isNull(projectChecklists.archivedAt),
      ),
    )
    .orderBy(asc(projectChecklists.createdAt), asc(projectChecklists.name));

  return Promise.all(
    rows.map((row) =>
      getProjectChecklistDetail({
        membership,
        projectChecklistId: row.id,
        projectSlug: project.slug,
      }),
    ),
  );
}

export async function renameProjectChecklistForMember(
  membership: AuthorizedOrganizationMember,
  input: { name: string; projectChecklistId: string },
) {
  validateProjectChecklistName(input.name);

  const projectChecklist = await getProjectChecklistForManagement(
    membership,
    input.projectChecklistId,
  );

  if (!projectChecklist) {
    return null;
  }

  if (projectChecklist.projectArchivedAt || projectChecklist.archivedAt) {
    throw new ChecklistInputError('Only active Project Checklists can be renamed.');
  }

  await ensureProjectChecklistNameAvailable({
    excludeProjectChecklistId: projectChecklist.id,
    name: input.name,
    projectId: projectChecklist.projectId,
  });

  await db
    .update(projectChecklists)
    .set({ name: input.name.trim(), updatedAt: new Date() })
    .where(eq(projectChecklists.id, projectChecklist.id));

  return getProjectChecklistDetail({
    membership,
    projectChecklistId: projectChecklist.id,
    projectSlug: projectChecklist.projectSlug,
  });
}

export async function archiveProjectChecklistForMember(
  membership: AuthorizedOrganizationMember,
  projectChecklistId: string,
) {
  return setProjectChecklistArchivedForMember({
    archived: true,
    membership,
    projectChecklistId,
  });
}

export async function restoreProjectChecklistForMember(
  membership: AuthorizedOrganizationMember,
  projectChecklistId: string,
) {
  return setProjectChecklistArchivedForMember({
    archived: false,
    membership,
    projectChecklistId,
  });
}

async function getChecklistTemplateDetail(
  membership: AuthorizedOrganizationMember,
  checklistTemplateId: string,
) {
  const template = await db
    .select({
      archivedAt: checklistTemplates.archivedAt,
      createdAt: checklistTemplates.createdAt,
      id: checklistTemplates.id,
      name: checklistTemplates.name,
    })
    .from(checklistTemplates)
    .where(
      and(
        eq(checklistTemplates.id, checklistTemplateId),
        eq(checklistTemplates.organizationId, membership.organizationId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!template) {
    return null;
  }

  const templateControls = await db
    .select({
      controlCode: controlVersions.controlCode,
      controlId: controls.id,
      controlTitle: controlVersions.title,
      currentVersionId: controlVersions.id,
      currentVersionNumber: controlVersions.versionNumber,
    })
    .from(checklistTemplateControls)
    .innerJoin(controls, eq(checklistTemplateControls.controlId, controls.id))
    .innerJoin(controlVersions, eq(controls.currentVersionId, controlVersions.id))
    .where(eq(checklistTemplateControls.checklistTemplateId, template.id))
    .orderBy(asc(checklistTemplateControls.createdAt), asc(controlVersions.controlCode));

  return {
    archivedAt: template.archivedAt?.toISOString() ?? null,
    controls: templateControls,
    createdAt: template.createdAt.toISOString(),
    id: template.id,
    name: template.name,
    status: template.archivedAt ? ('archived' as const) : ('active' as const),
  };
}

async function getChecklistTemplateForManagement(
  membership: AuthorizedOrganizationMember,
  checklistTemplateId: string,
) {
  return db
    .select({
      archivedAt: checklistTemplates.archivedAt,
      id: checklistTemplates.id,
      name: checklistTemplates.name,
    })
    .from(checklistTemplates)
    .where(
      and(
        eq(checklistTemplates.id, checklistTemplateId),
        eq(checklistTemplates.organizationId, membership.organizationId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

async function ensureChecklistTemplateNameAvailable(input: {
  excludeChecklistTemplateId?: string;
  name: string;
  organizationId: string;
}) {
  const existingTemplate = await db
    .select({ id: checklistTemplates.id })
    .from(checklistTemplates)
    .where(
      and(
        eq(checklistTemplates.organizationId, input.organizationId),
        eq(checklistTemplates.name, input.name.trim()),
        isNull(checklistTemplates.archivedAt),
        input.excludeChecklistTemplateId
          ? ne(checklistTemplates.id, input.excludeChecklistTemplateId)
          : undefined,
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (existingTemplate) {
    throw new ChecklistInputError('Checklist Template name is already used in this Organization.');
  }
}

async function setChecklistTemplateArchivedForMember(input: {
  archived: boolean;
  checklistTemplateId: string;
  membership: AuthorizedOrganizationMember;
}) {
  const template = await getChecklistTemplateForManagement(
    input.membership,
    input.checklistTemplateId,
  );

  if (!template) {
    return null;
  }

  if (!input.archived) {
    await ensureChecklistTemplateNameAvailable({
      excludeChecklistTemplateId: template.id,
      name: template.name,
      organizationId: input.membership.organizationId,
    });
  }

  await db
    .update(checklistTemplates)
    .set({
      archivedAt: input.archived ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(checklistTemplates.id, template.id));

  return getChecklistTemplateDetail(input.membership, template.id);
}

async function getProjectForChecklistAction(
  membership: AuthorizedOrganizationMember,
  projectSlug: string,
  options: { allowArchivedProject: boolean },
) {
  return db
    .select({
      archivedAt: projects.archivedAt,
      id: projects.id,
      slug: projects.slug,
    })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, membership.organizationId),
        eq(projects.slug, projectSlug),
        options.allowArchivedProject ? undefined : isNull(projects.archivedAt),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

async function getProjectChecklistForManagement(
  membership: AuthorizedOrganizationMember,
  projectChecklistId: string,
) {
  return db
    .select({
      archivedAt: projectChecklists.archivedAt,
      id: projectChecklists.id,
      projectArchivedAt: projects.archivedAt,
      projectId: projects.id,
      projectSlug: projects.slug,
    })
    .from(projectChecklists)
    .innerJoin(projects, eq(projectChecklists.projectId, projects.id))
    .where(
      and(
        eq(projectChecklists.id, projectChecklistId),
        eq(projects.organizationId, membership.organizationId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

async function ensureProjectChecklistNameAvailable(input: {
  excludeProjectChecklistId?: string;
  name: string;
  projectId: string;
}) {
  const existingChecklist = await db
    .select({ id: projectChecklists.id })
    .from(projectChecklists)
    .where(
      and(
        eq(projectChecklists.projectId, input.projectId),
        eq(projectChecklists.name, input.name.trim()),
        isNull(projectChecklists.archivedAt),
        input.excludeProjectChecklistId
          ? ne(projectChecklists.id, input.excludeProjectChecklistId)
          : undefined,
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (existingChecklist) {
    throw new ChecklistInputError('Project Checklist name is already used on this Project.');
  }
}

async function setProjectChecklistArchivedForMember(input: {
  archived: boolean;
  membership: AuthorizedOrganizationMember;
  projectChecklistId: string;
}) {
  const projectChecklist = await getProjectChecklistForManagement(
    input.membership,
    input.projectChecklistId,
  );

  if (!projectChecklist) {
    return null;
  }

  if (projectChecklist.projectArchivedAt) {
    throw new ChecklistInputError('Project Checklists on Archived Projects are read-only.');
  }

  if (!input.archived) {
    await ensureProjectChecklistNameAvailable({
      excludeProjectChecklistId: projectChecklist.id,
      name: await db
        .select({ name: projectChecklists.name })
        .from(projectChecklists)
        .where(eq(projectChecklists.id, projectChecklist.id))
        .limit(1)
        .then((rows) => rows[0]?.name ?? ''),
      projectId: projectChecklist.projectId,
    });
  }

  await db
    .update(projectChecklists)
    .set({
      archivedAt: input.archived ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(projectChecklists.id, projectChecklist.id));

  return getProjectChecklistDetail({
    membership: input.membership,
    projectChecklistId: projectChecklist.id,
    projectSlug: projectChecklist.projectSlug,
  });
}

async function resolveProjectChecklistControlSource(
  membership: AuthorizedOrganizationMember,
  input: Required<Pick<CreateProjectChecklistInput, 'name' | 'projectSlug'>> &
    Pick<CreateProjectChecklistInput, 'checklistTemplateId' | 'controlIds'>,
) {
  if (input.checklistTemplateId && input.controlIds?.length) {
    throw new ChecklistInputError(
      'Create a Project Checklist from a Checklist Template or selected Controls, not both.',
    );
  }

  if (input.checklistTemplateId) {
    const template = await db
      .select({ id: checklistTemplates.id })
      .from(checklistTemplates)
      .where(
        and(
          eq(checklistTemplates.id, input.checklistTemplateId),
          eq(checklistTemplates.organizationId, membership.organizationId),
          isNull(checklistTemplates.archivedAt),
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (!template) {
      throw new ChecklistInputError('Checklist Template unavailable.');
    }

    const templateControls = await db
      .select({ controlId: checklistTemplateControls.controlId })
      .from(checklistTemplateControls)
      .where(eq(checklistTemplateControls.checklistTemplateId, template.id));

    return {
      checklistTemplateId: template.id,
      controlIds: templateControls.map((control) => control.controlId),
    };
  }

  if (!input.controlIds?.length) {
    throw new ChecklistInputError('Project Checklist needs at least one selected Control.');
  }

  return {
    checklistTemplateId: null,
    controlIds: input.controlIds,
  };
}

export async function setChecklistItemCheckedForMember(
  membership: AuthorizedOrganizationMember,
  input: { checked: boolean; checklistItemId: string },
) {
  const checklistItem = await db
    .select({
      archivedAt: projectChecklists.archivedAt,
      checked: checklistItems.checked,
      controlCode: controlVersions.controlCode,
      controlTitle: controlVersions.title,
      itemStatus: checklistItems.status,
      projectArchivedAt: projects.archivedAt,
      projectChecklistId: projectChecklists.id,
      projectOwnerMemberId: projects.projectOwnerMemberId,
      projectSlug: projects.slug,
    })
    .from(checklistItems)
    .innerJoin(projectChecklists, eq(checklistItems.projectChecklistId, projectChecklists.id))
    .innerJoin(projects, eq(projectChecklists.projectId, projects.id))
    .innerJoin(controlVersions, eq(checklistItems.controlVersionId, controlVersions.id))
    .where(
      and(
        eq(checklistItems.id, input.checklistItemId),
        eq(projects.organizationId, membership.organizationId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!checklistItem) {
    return null;
  }

  if (checklistItem.projectOwnerMemberId !== membership.id) {
    throw new ChecklistPermissionError('Only the Project Owner can check Checklist Items.');
  }

  if (
    checklistItem.projectArchivedAt ||
    checklistItem.archivedAt ||
    checklistItem.itemStatus !== 'active'
  ) {
    throw new ChecklistInputError('Only active Checklist Items can be checked or unchecked.');
  }

  await db.batch([
    db
      .update(checklistItems)
      .set({
        checked: input.checked,
        updatedAt: new Date(),
      })
      .where(eq(checklistItems.id, input.checklistItemId)),
    db.insert(auditEvents).values(
      await buildOrganizationMemberAuditEvent({
        action: input.checked ? 'checklist_item.checked' : 'checklist_item.unchecked',
        membership,
        metadata: {
          changes: {
            checked: {
              from: checklistItem.checked,
              to: input.checked,
            },
          },
        },
        target: {
          displayName: checklistItem.controlTitle,
          id: input.checklistItemId,
          secondaryLabel: checklistItem.controlCode,
          type: 'checklist_item',
        },
      }),
    ),
  ]);

  return getProjectChecklistDetail({
    membership,
    projectChecklistId: checklistItem.projectChecklistId,
    projectSlug: checklistItem.projectSlug,
  });
}

export async function removeChecklistItemForMember(
  membership: AuthorizedOrganizationMember,
  input: { checklistItemId: string },
) {
  const checklistItem = await db
    .select({
      archivedAt: projectChecklists.archivedAt,
      itemStatus: checklistItems.status,
      projectArchivedAt: projects.archivedAt,
      projectChecklistId: projectChecklists.id,
      projectSlug: projects.slug,
    })
    .from(checklistItems)
    .innerJoin(projectChecklists, eq(checklistItems.projectChecklistId, projectChecklists.id))
    .innerJoin(projects, eq(projectChecklists.projectId, projects.id))
    .where(
      and(
        eq(checklistItems.id, input.checklistItemId),
        eq(projects.organizationId, membership.organizationId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!checklistItem) {
    return null;
  }

  if (
    checklistItem.projectArchivedAt ||
    checklistItem.archivedAt ||
    checklistItem.itemStatus !== 'active'
  ) {
    throw new ChecklistInputError('Only active Checklist Items can be removed.');
  }

  await db
    .update(checklistItems)
    .set({
      status: 'removed',
      updatedAt: new Date(),
    })
    .where(eq(checklistItems.id, input.checklistItemId));

  return getProjectChecklistDetail({
    membership,
    projectChecklistId: checklistItem.projectChecklistId,
    projectSlug: checklistItem.projectSlug,
  });
}

export async function addChecklistItemForMember(
  membership: AuthorizedOrganizationMember,
  input: { controlId: string; projectChecklistId: string },
) {
  const projectChecklist = await getProjectChecklistForManagement(
    membership,
    input.projectChecklistId,
  );

  if (!projectChecklist) {
    return null;
  }

  if (projectChecklist.projectArchivedAt || projectChecklist.archivedAt) {
    throw new ChecklistInputError(
      'Only active Project Checklists can receive new Checklist Items.',
    );
  }

  const activeExistingItem = await db
    .select({ id: checklistItems.id })
    .from(checklistItems)
    .where(
      and(
        eq(checklistItems.projectChecklistId, projectChecklist.id),
        eq(checklistItems.controlId, input.controlId),
        eq(checklistItems.status, 'active'),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (activeExistingItem) {
    throw new ChecklistInputError('A Control can appear only once in a Project Checklist.');
  }

  const selectedControl = await getLatestActiveControlVersions(membership.organizationId, [
    input.controlId,
  ]).then((rows) => rows[0] ?? null);

  if (!selectedControl) {
    throw new ChecklistInputError('Project Checklists can use only active Controls.');
  }

  const now = new Date();

  await db.insert(checklistItems).values({
    checked: false,
    controlId: selectedControl.controlId,
    controlVersionId: selectedControl.controlVersionId,
    createdAt: now,
    id: crypto.randomUUID(),
    projectChecklistId: projectChecklist.id,
    status: 'active',
    updatedAt: now,
  });

  return getProjectChecklistDetail({
    membership,
    projectChecklistId: projectChecklist.id,
    projectSlug: projectChecklist.projectSlug,
  });
}

export async function enforceArchivedControlForMember(
  membership: AuthorizedOrganizationMember,
  input: { controlId: string; projectChecklistId: string },
) {
  const projectChecklist = await getProjectChecklistForManagement(
    membership,
    input.projectChecklistId,
  );

  if (!projectChecklist) {
    return null;
  }

  if (projectChecklist.projectArchivedAt || projectChecklist.archivedAt) {
    throw new ChecklistInputError('Only active Project Checklists can enforce Archived Controls.');
  }

  const archivedControl = await db
    .select({ id: controls.id })
    .from(controls)
    .where(
      and(
        eq(controls.id, input.controlId),
        eq(controls.organizationId, membership.organizationId),
        isNotNull(controls.archivedAt),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!archivedControl) {
    throw new ChecklistInputError('Archived Control unavailable.');
  }

  await db
    .update(checklistItems)
    .set({ status: 'removed', updatedAt: new Date() })
    .where(
      and(
        eq(checklistItems.projectChecklistId, projectChecklist.id),
        eq(checklistItems.controlId, archivedControl.id),
        eq(checklistItems.status, 'active'),
      ),
    );

  return getProjectChecklistDetail({
    membership,
    projectChecklistId: projectChecklist.id,
    projectSlug: projectChecklist.projectSlug,
  });
}

export async function refreshChecklistItemForMember(
  membership: AuthorizedOrganizationMember,
  input: { checklistItemId: string },
) {
  const checklistItem = await db
    .select({
      archivedAt: projectChecklists.archivedAt,
      controlId: checklistItems.controlId,
      controlVersionId: checklistItems.controlVersionId,
      itemStatus: checklistItems.status,
      projectArchivedAt: projects.archivedAt,
      projectChecklistId: projectChecklists.id,
      projectSlug: projects.slug,
    })
    .from(checklistItems)
    .innerJoin(projectChecklists, eq(checklistItems.projectChecklistId, projectChecklists.id))
    .innerJoin(projects, eq(projectChecklists.projectId, projects.id))
    .where(
      and(
        eq(checklistItems.id, input.checklistItemId),
        eq(projects.organizationId, membership.organizationId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!checklistItem) {
    return null;
  }

  if (
    checklistItem.projectArchivedAt ||
    checklistItem.archivedAt ||
    checklistItem.itemStatus !== 'active'
  ) {
    throw new ChecklistInputError('Only active Checklist Items can be refreshed.');
  }

  const latestControlVersion = await db
    .select({
      controlVersionId: controlVersions.id,
    })
    .from(controls)
    .innerJoin(controlVersions, eq(controls.currentVersionId, controlVersions.id))
    .where(
      and(
        eq(controls.id, checklistItem.controlId),
        eq(controls.organizationId, membership.organizationId),
        isNull(controls.archivedAt),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!latestControlVersion) {
    throw new ChecklistInputError('Checklist Items can be refreshed only from active Controls.');
  }

  if (latestControlVersion.controlVersionId === checklistItem.controlVersionId) {
    throw new ChecklistInputError('Checklist Item already uses the latest Control Version.');
  }

  const now = new Date();

  await db
    .update(checklistItems)
    .set({
      status: 'superseded',
      updatedAt: now,
    })
    .where(eq(checklistItems.id, input.checklistItemId));

  await db.insert(checklistItems).values({
    checked: false,
    controlId: checklistItem.controlId,
    controlVersionId: latestControlVersion.controlVersionId,
    createdAt: now,
    id: crypto.randomUUID(),
    projectChecklistId: checklistItem.projectChecklistId,
    status: 'active',
    updatedAt: now,
  });

  return getProjectChecklistDetail({
    membership,
    projectChecklistId: checklistItem.projectChecklistId,
    projectSlug: checklistItem.projectSlug,
  });
}

async function getProjectChecklistDetail(input: {
  membership: AuthorizedOrganizationMember;
  projectChecklistId: string;
  projectSlug: string;
}) {
  const projectChecklist = await db
    .select({
      archivedAt: projectChecklists.archivedAt,
      createdAt: projectChecklists.createdAt,
      id: projectChecklists.id,
      name: projectChecklists.name,
      sourceChecklistTemplateId: projectChecklists.sourceChecklistTemplateId,
    })
    .from(projectChecklists)
    .innerJoin(projects, eq(projectChecklists.projectId, projects.id))
    .where(
      and(
        eq(projectChecklists.id, input.projectChecklistId),
        eq(projects.organizationId, input.membership.organizationId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!projectChecklist) {
    return null;
  }

  const items = await getProjectChecklistItems(projectChecklist.id);
  const activeItems = items.filter((item) => item.itemStatus === 'active');

  return {
    archivedAt: projectChecklist.archivedAt?.toISOString() ?? null,
    createdAt: projectChecklist.createdAt.toISOString(),
    id: projectChecklist.id,
    isComplete: activeItems.length > 0 && activeItems.every((item) => item.checked),
    items,
    name: projectChecklist.name,
    projectSlug: input.projectSlug,
    sourceChecklistTemplateId: projectChecklist.sourceChecklistTemplateId,
    status: projectChecklist.archivedAt ? ('archived' as const) : ('active' as const),
  };
}

async function getProjectChecklistItems(projectChecklistId: string) {
  const rows = await db
    .select({
      checked: checklistItems.checked,
      controlCode: controlVersions.controlCode,
      controlId: checklistItems.controlId,
      controlTitle: controlVersions.title,
      controlVersionId: checklistItems.controlVersionId,
      controlVersionNumber: controlVersions.versionNumber,
      createdAt: checklistItems.createdAt,
      id: checklistItems.id,
      status: checklistItems.status,
    })
    .from(checklistItems)
    .innerJoin(controlVersions, eq(checklistItems.controlVersionId, controlVersions.id))
    .where(eq(checklistItems.projectChecklistId, projectChecklistId))
    .orderBy(asc(checklistItems.createdAt), asc(controlVersions.controlCode));

  return rows.map((row) => ({
    checked: row.checked,
    controlCode: row.controlCode,
    controlId: row.controlId,
    controlTitle: row.controlTitle,
    controlVersionId: row.controlVersionId,
    controlVersionNumber: row.controlVersionNumber,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    itemStatus: row.status,
  }));
}

async function getLatestActiveControlVersions(organizationId: string, controlIds: string[]) {
  if (controlIds.length === 0) {
    return [];
  }

  return db
    .select({
      controlId: controls.id,
      controlVersionId: controlVersions.id,
    })
    .from(controls)
    .innerJoin(controlVersions, eq(controls.currentVersionId, controlVersions.id))
    .where(
      and(
        eq(controls.organizationId, organizationId),
        isNull(controls.archivedAt),
        inArray(controls.id, controlIds),
      ),
    );
}

function normalizeCreateProjectChecklistBody(body: CreateProjectChecklistInput) {
  return {
    checklistTemplateId: body.checklistTemplateId,
    controlIds: body.controlIds,
    name: body.name,
    projectSlug: body.projectSlug,
  };
}

function normalizeCreateChecklistTemplateBody(body: CreateChecklistTemplateInput) {
  return {
    controlIds: body.controlIds,
    name: body.name,
  };
}

function validateProjectChecklistName(name: string) {
  if (!name.trim()) {
    throw new ChecklistInputError('Project Checklist name is required.');
  }
}

function validateChecklistTemplateName(name: string) {
  if (!name.trim()) {
    throw new ChecklistInputError('Checklist Template name is required.');
  }
}

function validateChecklistTemplateControlIds(controlIds: string[]) {
  if (controlIds.length === 0) {
    throw new ChecklistInputError('Checklist Template needs at least one selected Control.');
  }
}

function validateUniqueControlIds(controlIds: string[], message: string) {
  const uniqueControlIds = new Set(controlIds);

  if (uniqueControlIds.size !== controlIds.length) {
    throw new ChecklistInputError(message);
  }
}
