import { and, asc, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { db } from '../db/client';
import {
  checklistTemplateItems,
  checklistTemplateSections,
  checklistTemplates,
  controls,
  controlVersions,
  projectChecklistItems,
  projectChecklists,
  projectChecklistVerificationHistory,
  projectChecklistVerificationRecords,
  projectComponents,
  projects,
} from '../db/schema';
import { canManageProjects, type OrganizationMembership } from './projects';
import { catchUpActiveProjectChecklists } from './project-checklist-catch-up';

export type ProjectChecklistResponse = {
  archivedAt: string | null;
  componentId: string;
  createdAt: string;
  displayName: string;
  completion: {
    completedItems: number;
    totalItems: number;
  };
  id: string;
  items: ProjectChecklistItemResponse[];
  sections: ProjectChecklistSectionResponse[];
  templateId: string;
  unsectionedItems: ProjectChecklistItemResponse[];
  updatedAt: string;
};

export type ProjectChecklistItemResponse = {
  control: {
    controlCode: string;
    id: string;
    releaseImpact: string;
    title: string;
  };
  controlVersion: {
    id: string;
    isLatest: boolean;
    versionNumber: number;
  };
  displayOrder: number;
  id: string;
  removedFromTemplateAt: string | null;
  sectionId: string | null;
  templateItemId: string;
  verificationRecord: {
    history: ProjectChecklistVerificationHistoryResponse[];
    id: string;
    notApplicableExplanation: string | null;
    status: string;
  };
};

export type ProjectChecklistVerificationHistoryResponse = {
  actorMemberId: string;
  controlVersion: {
    id: string;
    versionNumber: number;
  };
  createdAt: string;
  id: string;
  notApplicableExplanation: string | null;
  status: string;
};

export type ProjectChecklistSectionResponse = {
  displayOrder: number;
  id: string;
  items: ProjectChecklistItemResponse[];
  name: string;
};

export type UncheckedCurrentRequirementReportItem = {
  control: {
    controlCode: string;
    id: string;
    releaseImpact: string;
    title: string;
  };
  controlVersion: {
    id: string;
    versionNumber: number;
  };
  project: {
    id: string;
    name: string;
    slug: string;
  };
  projectChecklist: {
    displayName: string;
    id: string;
  };
  projectChecklistItem: {
    id: string;
  };
  projectComponent: {
    id: string;
    name: string;
  };
  uncheckedReason: 'new-control-version' | 'never-verified';
  verificationRecord: {
    id: string;
    status: string;
  };
};

type ApplyChecklistTemplateInput = {
  displayName: string | null;
  templateId: string;
};

type VerificationStatus = 'checked' | 'unchecked' | 'not-applicable';

type UpdateChecklistItemVerificationInput = {
  notApplicableExplanation: string | null;
  status: VerificationStatus | null;
};

export class ProjectChecklistInputError extends Error {}

export async function canApplyProjectChecklists(input: {
  membership: OrganizationMembership;
  projectSlug: string;
}): Promise<boolean> {
  if (canManageProjects(input.membership.role)) {
    return true;
  }

  const project = await getProjectForMembership(input.membership, input.projectSlug);

  return project?.projectOwnerMemberId === input.membership.id;
}

export async function applyChecklistTemplateToProjectComponent(input: {
  componentId: string;
  membership: OrganizationMembership;
  projectSlug: string;
  values: ApplyChecklistTemplateInput;
}): Promise<ProjectChecklistResponse | null> {
  const project = await getProjectForMembership(input.membership, input.projectSlug);

  if (!project || project.archivedAt) {
    return null;
  }

  const component = await db
    .select({ archivedAt: projectComponents.archivedAt, id: projectComponents.id })
    .from(projectComponents)
    .where(
      and(eq(projectComponents.id, input.componentId), eq(projectComponents.projectId, project.id)),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!component || component.archivedAt) {
    return null;
  }

  const template = await db
    .select({ id: checklistTemplates.id, name: checklistTemplates.name })
    .from(checklistTemplates)
    .where(
      and(
        eq(checklistTemplates.id, input.values.templateId),
        eq(checklistTemplates.organizationId, input.membership.organizationId),
        eq(checklistTemplates.status, 'active'),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!template) {
    throw new ProjectChecklistInputError('Only active Checklist Templates can be applied.');
  }

  const displayName = (input.values.displayName ?? template.name).trim();

  if (!displayName) {
    throw new ProjectChecklistInputError('Project Checklist display name is required.');
  }

  const normalizedDisplayName = normalizeProjectChecklistDisplayName(displayName);

  await assertProjectChecklistIsUnique({
    componentId: component.id,
    normalizedDisplayName,
    templateId: template.id,
  });

  const templateItems = await db
    .select({
      controlId: controls.id,
      controlVersionId: controls.currentVersionId,
      displayOrder: checklistTemplateItems.displayOrder,
      templateItemId: checklistTemplateItems.id,
    })
    .from(checklistTemplateItems)
    .innerJoin(controls, eq(checklistTemplateItems.controlId, controls.id))
    .where(
      and(
        eq(checklistTemplateItems.templateId, template.id),
        isNull(checklistTemplateItems.removedAt),
        eq(controls.organizationId, input.membership.organizationId),
        isNull(controls.archivedAt),
      ),
    )
    .orderBy(
      asc(checklistTemplateItems.sectionId),
      asc(checklistTemplateItems.displayOrder),
      asc(checklistTemplateItems.createdAt),
    );

  const allTemplateItemIds = await db
    .select({ id: checklistTemplateItems.id })
    .from(checklistTemplateItems)
    .where(
      and(
        eq(checklistTemplateItems.templateId, template.id),
        isNull(checklistTemplateItems.removedAt),
      ),
    );

  if (templateItems.length !== allTemplateItemIds.length) {
    throw new ProjectChecklistInputError(
      'Checklist Template contains Controls that are no longer active.',
    );
  }

  if (templateItems.some((item) => !item.controlVersionId)) {
    throw new ProjectChecklistInputError(
      'Checklist Template contains Controls that are no longer active.',
    );
  }

  const checklistId = crypto.randomUUID();
  const now = new Date();

  await db.insert(projectChecklists).values({
    archivedAt: null,
    componentId: component.id,
    createdAt: now,
    displayName,
    id: checklistId,
    normalizedDisplayName,
    templateId: template.id,
    updatedAt: now,
  });

  for (const [displayOrder, item] of templateItems.entries()) {
    const controlVersionId = item.controlVersionId!;
    const verificationRecordId = crypto.randomUUID();

    await db.insert(projectChecklistVerificationRecords).values({
      controlVersionId,
      createdAt: now,
      id: verificationRecordId,
      status: 'unchecked',
      updatedAt: now,
    });
    await db.insert(projectChecklistItems).values({
      controlId: item.controlId,
      controlVersionId,
      createdAt: now,
      displayOrder,
      id: crypto.randomUUID(),
      projectChecklistId: checklistId,
      removedFromTemplateAt: null,
      templateItemId: item.templateItemId,
      verificationRecordId,
    });
  }

  return getProjectChecklistForMembership({ checklistId, membership: input.membership });
}

export function normalizeApplyChecklistTemplateBody(body: unknown): ApplyChecklistTemplateInput {
  const value = typeof body === 'object' && body !== null ? body : {};
  const record = value as Record<string, unknown>;

  return {
    displayName: typeof record.displayName === 'string' ? record.displayName : null,
    templateId: typeof record.templateId === 'string' ? record.templateId : '',
  };
}

export function normalizeChecklistItemVerificationBody(
  body: unknown,
): UpdateChecklistItemVerificationInput {
  const value = typeof body === 'object' && body !== null ? body : {};
  const record = value as Record<string, unknown>;
  const status = typeof record.status === 'string' ? record.status : null;

  return {
    notApplicableExplanation:
      typeof record.notApplicableExplanation === 'string' ? record.notApplicableExplanation : null,
    status: isVerificationStatus(status) ? status : null,
  };
}

export async function updateProjectChecklistItemVerification(input: {
  checklistId: string;
  componentId: string;
  itemId: string;
  membership: OrganizationMembership;
  projectSlug: string;
  values: UpdateChecklistItemVerificationInput;
}): Promise<ProjectChecklistResponse | null> {
  if (!input.values.status) {
    throw new ProjectChecklistInputError(
      'Verification status must be checked, unchecked, or not applicable.',
    );
  }

  const notApplicableExplanation = input.values.notApplicableExplanation?.trim() ?? '';

  if (input.values.status === 'not-applicable' && !notApplicableExplanation) {
    throw new ProjectChecklistInputError('Not applicable verification requires an explanation.');
  }

  const checklistItem = await db
    .select({
      componentArchivedAt: projectComponents.archivedAt,
      controlVersionId: projectChecklistItems.controlVersionId,
      itemId: projectChecklistItems.id,
      projectArchivedAt: projects.archivedAt,
      projectChecklistArchivedAt: projectChecklists.archivedAt,
      verificationRecordId: projectChecklistItems.verificationRecordId,
    })
    .from(projectChecklistItems)
    .innerJoin(
      projectChecklists,
      eq(projectChecklistItems.projectChecklistId, projectChecklists.id),
    )
    .innerJoin(projectComponents, eq(projectChecklists.componentId, projectComponents.id))
    .innerJoin(projects, eq(projectComponents.projectId, projects.id))
    .where(
      and(
        eq(projectChecklistItems.id, input.itemId),
        eq(projectChecklistItems.projectChecklistId, input.checklistId),
        eq(projectChecklists.componentId, input.componentId),
        eq(projects.organizationId, input.membership.organizationId),
        eq(projects.slug, input.projectSlug),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!checklistItem) {
    return null;
  }

  if (
    checklistItem.projectArchivedAt ||
    checklistItem.componentArchivedAt ||
    checklistItem.projectChecklistArchivedAt
  ) {
    throw new ProjectChecklistInputError('Archived Project Checklist containers are read-only.');
  }

  const now = new Date();
  const storedExplanation =
    input.values.status === 'not-applicable' ? notApplicableExplanation : null;

  await db
    .update(projectChecklistVerificationRecords)
    .set({
      notApplicableExplanation: storedExplanation,
      status: input.values.status,
      updatedAt: now,
    })
    .where(eq(projectChecklistVerificationRecords.id, checklistItem.verificationRecordId));

  await db.insert(projectChecklistVerificationHistory).values({
    actorMemberId: input.membership.id,
    controlVersionId: checklistItem.controlVersionId,
    createdAt: now,
    id: crypto.randomUUID(),
    notApplicableExplanation: storedExplanation,
    projectChecklistItemId: checklistItem.itemId,
    status: input.values.status,
  });

  return getProjectChecklistForMembership({
    checklistId: input.checklistId,
    componentId: input.componentId,
    membership: input.membership,
    projectSlug: input.projectSlug,
  });
}

export async function setProjectChecklistArchivedForMembership(input: {
  archived: boolean;
  checklistId: string;
  componentId: string;
  membership: OrganizationMembership;
  projectSlug: string;
}): Promise<ProjectChecklistResponse | null> {
  const checklist = await db
    .select({
      componentArchivedAt: projectComponents.archivedAt,
      componentId: projectChecklists.componentId,
      displayName: projectChecklists.displayName,
      id: projectChecklists.id,
      normalizedDisplayName: projectChecklists.normalizedDisplayName,
      projectArchivedAt: projects.archivedAt,
      templateId: projectChecklists.templateId,
    })
    .from(projectChecklists)
    .innerJoin(projectComponents, eq(projectChecklists.componentId, projectComponents.id))
    .innerJoin(projects, eq(projectComponents.projectId, projects.id))
    .where(
      and(
        eq(projectChecklists.id, input.checklistId),
        eq(projectChecklists.componentId, input.componentId),
        eq(projects.organizationId, input.membership.organizationId),
        eq(projects.slug, input.projectSlug),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!checklist) {
    return null;
  }

  if (!input.archived) {
    if (checklist.projectArchivedAt || checklist.componentArchivedAt) {
      throw new ProjectChecklistInputError(
        'Archived Project Checklist containers must be restored before restoring Project Checklists.',
      );
    }

    await assertProjectChecklistIsUnique({
      componentId: checklist.componentId,
      excludeChecklistId: checklist.id,
      normalizedDisplayName: checklist.normalizedDisplayName,
      templateId: checklist.templateId,
    });
  }

  await db
    .update(projectChecklists)
    .set({
      archivedAt: input.archived ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(projectChecklists.id, checklist.id));

  if (!input.archived) {
    await catchUpActiveProjectChecklists({ checklistId: checklist.id });
  }

  return getProjectChecklistForMembership({
    checklistId: checklist.id,
    componentId: input.componentId,
    membership: input.membership,
    projectSlug: input.projectSlug,
  });
}

export async function getProjectChecklistForMembership(input: {
  checklistId: string;
  componentId?: string;
  includeRemovedFromTemplate?: boolean;
  membership: OrganizationMembership;
  projectSlug?: string;
}): Promise<ProjectChecklistResponse | null> {
  const checklist = await db
    .select({
      archivedAt: projectChecklists.archivedAt,
      componentId: projectChecklists.componentId,
      createdAt: projectChecklists.createdAt,
      displayName: projectChecklists.displayName,
      id: projectChecklists.id,
      templateId: projectChecklists.templateId,
      updatedAt: projectChecklists.updatedAt,
    })
    .from(projectChecklists)
    .innerJoin(projectComponents, eq(projectChecklists.componentId, projectComponents.id))
    .innerJoin(projects, eq(projectComponents.projectId, projects.id))
    .where(
      and(
        eq(projectChecklists.id, input.checklistId),
        eq(projects.organizationId, input.membership.organizationId),
        input.componentId ? eq(projectChecklists.componentId, input.componentId) : undefined,
        input.projectSlug ? eq(projects.slug, input.projectSlug) : undefined,
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!checklist) {
    return null;
  }

  const itemRows = await db
    .select({
      controlCode: controlVersions.controlCode,
      controlId: projectChecklistItems.controlId,
      currentVersionId: controls.currentVersionId,
      controlVersionId: projectChecklistItems.controlVersionId,
      displayOrder: projectChecklistItems.displayOrder,
      id: projectChecklistItems.id,
      releaseImpact: controlVersions.releaseImpact,
      removedFromTemplateAt: projectChecklistItems.removedFromTemplateAt,
      sectionDisplayOrder: checklistTemplateSections.displayOrder,
      sectionId: checklistTemplateItems.sectionId,
      sectionName: checklistTemplateSections.name,
      notApplicableExplanation: projectChecklistVerificationRecords.notApplicableExplanation,
      status: projectChecklistVerificationRecords.status,
      templateItemId: projectChecklistItems.templateItemId,
      title: controlVersions.title,
      verificationRecordId: projectChecklistItems.verificationRecordId,
      versionNumber: controlVersions.versionNumber,
    })
    .from(projectChecklistItems)
    .innerJoin(
      checklistTemplateItems,
      and(
        eq(projectChecklistItems.templateItemId, checklistTemplateItems.id),
        eq(checklistTemplateItems.templateId, checklist.templateId),
      ),
    )
    .leftJoin(
      checklistTemplateSections,
      eq(checklistTemplateItems.sectionId, checklistTemplateSections.id),
    )
    .innerJoin(controlVersions, eq(projectChecklistItems.controlVersionId, controlVersions.id))
    .innerJoin(controls, eq(projectChecklistItems.controlId, controls.id))
    .innerJoin(
      projectChecklistVerificationRecords,
      eq(projectChecklistItems.verificationRecordId, projectChecklistVerificationRecords.id),
    )
    .where(
      and(
        eq(projectChecklistItems.projectChecklistId, checklist.id),
        input.includeRemovedFromTemplate
          ? undefined
          : isNull(projectChecklistItems.removedFromTemplateAt),
      ),
    )
    .orderBy(
      asc(checklistTemplateSections.displayOrder),
      asc(checklistTemplateItems.sectionId),
      asc(projectChecklistItems.displayOrder),
      asc(projectChecklistItems.createdAt),
    );

  const histories = itemRows.length
    ? await db
        .select({
          actorMemberId: projectChecklistVerificationHistory.actorMemberId,
          controlVersionId: projectChecklistVerificationHistory.controlVersionId,
          createdAt: projectChecklistVerificationHistory.createdAt,
          id: projectChecklistVerificationHistory.id,
          notApplicableExplanation: projectChecklistVerificationHistory.notApplicableExplanation,
          projectChecklistItemId: projectChecklistVerificationHistory.projectChecklistItemId,
          status: projectChecklistVerificationHistory.status,
          versionNumber: controlVersions.versionNumber,
        })
        .from(projectChecklistVerificationHistory)
        .innerJoin(
          controlVersions,
          eq(projectChecklistVerificationHistory.controlVersionId, controlVersions.id),
        )
        .where(
          inArray(
            projectChecklistVerificationHistory.projectChecklistItemId,
            itemRows.map(({ id }) => id),
          ),
        )
        .orderBy(desc(projectChecklistVerificationHistory.createdAt))
    : [];

  const items = itemRows.map((item) => ({
    control: {
      controlCode: item.controlCode,
      id: item.controlId,
      releaseImpact: item.releaseImpact,
      title: item.title,
    },
    controlVersion: {
      id: item.controlVersionId,
      isLatest: item.controlVersionId === item.currentVersionId,
      versionNumber: item.versionNumber,
    },
    displayOrder: item.displayOrder,
    id: item.id,
    removedFromTemplateAt: item.removedFromTemplateAt?.toISOString() ?? null,
    sectionId: item.sectionId,
    templateItemId: item.templateItemId,
    verificationRecord: {
      history: histories
        .filter((history) => history.projectChecklistItemId === item.id)
        .map((history) => ({
          actorMemberId: history.actorMemberId,
          controlVersion: {
            id: history.controlVersionId,
            versionNumber: history.versionNumber,
          },
          createdAt: history.createdAt.toISOString(),
          id: history.id,
          notApplicableExplanation: history.notApplicableExplanation,
          status: history.status,
        })),
      id: item.verificationRecordId,
      notApplicableExplanation: item.notApplicableExplanation,
      status: item.status,
    },
  }));
  const completionItems = items.filter((item) => !item.removedFromTemplateAt);
  const completedItems = completionItems.filter((item) =>
    isCompleteVerificationStatus(item.verificationRecord.status),
  ).length;
  const sections = itemRows.reduce<ProjectChecklistSectionResponse[]>((result, row) => {
    if (!row.sectionId || !row.sectionName || row.sectionDisplayOrder === null) {
      return result;
    }

    let section = result.find(({ id }) => id === row.sectionId);

    if (!section) {
      section = {
        displayOrder: row.sectionDisplayOrder,
        id: row.sectionId,
        items: [],
        name: row.sectionName,
      };
      result.push(section);
    }

    const item = items.find(({ templateItemId }) => templateItemId === row.templateItemId);

    if (item) {
      section.items.push(item);
    }

    return result;
  }, []);

  return {
    ...checklist,
    archivedAt: checklist.archivedAt?.toISOString() ?? null,
    completion: {
      completedItems,
      totalItems: completionItems.length,
    },
    createdAt: checklist.createdAt.toISOString(),
    items,
    sections,
    unsectionedItems: items.filter(({ sectionId }) => !sectionId),
    updatedAt: checklist.updatedAt.toISOString(),
  };
}

export async function listUncheckedCurrentRequirementsForMembership(
  membership: OrganizationMembership,
): Promise<UncheckedCurrentRequirementReportItem[]> {
  const rows = await db
    .select({
      componentId: projectComponents.id,
      componentName: projectComponents.name,
      controlCode: controlVersions.controlCode,
      controlId: projectChecklistItems.controlId,
      controlVersionId: projectChecklistItems.controlVersionId,
      displayOrder: projectChecklistItems.displayOrder,
      itemId: projectChecklistItems.id,
      projectChecklistDisplayName: projectChecklists.displayName,
      projectChecklistId: projectChecklists.id,
      projectId: projects.id,
      projectName: projects.name,
      projectSlug: projects.slug,
      releaseImpact: controlVersions.releaseImpact,
      title: controlVersions.title,
      verificationRecordId: projectChecklistVerificationRecords.id,
      verificationStatus: projectChecklistVerificationRecords.status,
      versionNumber: controlVersions.versionNumber,
    })
    .from(projectChecklistItems)
    .innerJoin(
      projectChecklists,
      eq(projectChecklistItems.projectChecklistId, projectChecklists.id),
    )
    .innerJoin(projectComponents, eq(projectChecklists.componentId, projectComponents.id))
    .innerJoin(projects, eq(projectComponents.projectId, projects.id))
    .innerJoin(controls, eq(projectChecklistItems.controlId, controls.id))
    .innerJoin(controlVersions, eq(projectChecklistItems.controlVersionId, controlVersions.id))
    .innerJoin(
      projectChecklistVerificationRecords,
      eq(projectChecklistItems.verificationRecordId, projectChecklistVerificationRecords.id),
    )
    .where(
      and(
        eq(projects.organizationId, membership.organizationId),
        isNull(projects.archivedAt),
        isNull(projectComponents.archivedAt),
        isNull(projectChecklists.archivedAt),
        isNull(projectChecklistItems.removedFromTemplateAt),
        isNull(controls.archivedAt),
        eq(projectChecklistItems.controlVersionId, controls.currentVersionId),
        eq(projectChecklistVerificationRecords.status, 'unchecked'),
      ),
    )
    .orderBy(
      asc(projects.name),
      asc(projectComponents.name),
      asc(projectChecklists.displayName),
      asc(projectChecklistItems.displayOrder),
      asc(controlVersions.controlCode),
    );

  const histories = rows.length
    ? await db
        .select({
          controlVersionId: projectChecklistVerificationHistory.controlVersionId,
          projectChecklistItemId: projectChecklistVerificationHistory.projectChecklistItemId,
        })
        .from(projectChecklistVerificationHistory)
        .where(
          inArray(
            projectChecklistVerificationHistory.projectChecklistItemId,
            rows.map(({ itemId }) => itemId),
          ),
        )
    : [];
  const currentVersionByItemId = new Map(
    rows.map(({ controlVersionId, itemId }) => [itemId, controlVersionId]),
  );
  const itemsWithPriorVersionHistory = new Set(
    histories
      .filter(
        ({ controlVersionId, projectChecklistItemId }) =>
          currentVersionByItemId.get(projectChecklistItemId) !== controlVersionId,
      )
      .map(({ projectChecklistItemId }) => projectChecklistItemId),
  );

  return rows.map((row) => ({
    control: {
      controlCode: row.controlCode,
      id: row.controlId,
      releaseImpact: row.releaseImpact,
      title: row.title,
    },
    controlVersion: {
      id: row.controlVersionId,
      versionNumber: row.versionNumber,
    },
    project: {
      id: row.projectId,
      name: row.projectName,
      slug: row.projectSlug,
    },
    projectChecklist: {
      displayName: row.projectChecklistDisplayName,
      id: row.projectChecklistId,
    },
    projectChecklistItem: {
      id: row.itemId,
    },
    projectComponent: {
      id: row.componentId,
      name: row.componentName,
    },
    uncheckedReason: itemsWithPriorVersionHistory.has(row.itemId)
      ? 'new-control-version'
      : 'never-verified',
    verificationRecord: {
      id: row.verificationRecordId,
      status: row.verificationStatus,
    },
  }));
}

function isCompleteVerificationStatus(status: string): boolean {
  return status === 'checked' || status === 'not-applicable' || status === 'not_applicable';
}

function isVerificationStatus(status: string | null): status is VerificationStatus {
  return status === 'checked' || status === 'unchecked' || status === 'not-applicable';
}

async function assertProjectChecklistIsUnique(input: {
  componentId: string;
  excludeChecklistId?: string;
  normalizedDisplayName: string;
  templateId: string;
}) {
  const existingForTemplate = await db
    .select({ id: projectChecklists.id })
    .from(projectChecklists)
    .where(
      and(
        eq(projectChecklists.componentId, input.componentId),
        eq(projectChecklists.templateId, input.templateId),
        isNull(projectChecklists.archivedAt),
        input.excludeChecklistId ? ne(projectChecklists.id, input.excludeChecklistId) : undefined,
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (existingForTemplate) {
    throw new ProjectChecklistInputError(
      'Project Component already has an active Project Checklist for this Checklist Template.',
    );
  }

  const existingForName = await db
    .select({ id: projectChecklists.id })
    .from(projectChecklists)
    .where(
      and(
        eq(projectChecklists.componentId, input.componentId),
        eq(projectChecklists.normalizedDisplayName, input.normalizedDisplayName),
        isNull(projectChecklists.archivedAt),
        input.excludeChecklistId ? ne(projectChecklists.id, input.excludeChecklistId) : undefined,
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (existingForName) {
    throw new ProjectChecklistInputError(
      'Project Checklist display name is already used for this Project Component.',
    );
  }
}

async function getProjectForMembership(membership: OrganizationMembership, projectSlug: string) {
  return db
    .select({
      archivedAt: projects.archivedAt,
      id: projects.id,
      projectOwnerMemberId: projects.projectOwnerMemberId,
    })
    .from(projects)
    .where(
      and(eq(projects.organizationId, membership.organizationId), eq(projects.slug, projectSlug)),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

function normalizeProjectChecklistDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}
