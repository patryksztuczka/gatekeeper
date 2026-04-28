import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import {
  checklistTemplateItems,
  checklistTemplates,
  controls,
  controlVersions,
  projectChecklistItems,
  projectChecklists,
  projectChecklistVerificationRecords,
  projectComponents,
  projects,
} from '../db/schema';
import { canManageProjects, type OrganizationMembership } from './projects';

export type ProjectChecklistResponse = {
  archivedAt: string | null;
  componentId: string;
  createdAt: string;
  displayName: string;
  id: string;
  items: ProjectChecklistItemResponse[];
  templateId: string;
  updatedAt: string;
};

export type ProjectChecklistItemResponse = {
  control: {
    controlCode: string;
    id: string;
    title: string;
  };
  controlVersion: {
    id: string;
    versionNumber: number;
  };
  displayOrder: number;
  id: string;
  templateItemId: string;
  verificationRecord: {
    id: string;
    status: string;
  };
};

type ApplyChecklistTemplateInput = {
  displayName: string | null;
  templateId: string;
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
    .where(eq(checklistTemplateItems.templateId, template.id));

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
      templateItemId: item.templateItemId,
      verificationRecordId,
    });
  }

  return getProjectChecklistForMembership(input.membership, checklistId);
}

export function normalizeApplyChecklistTemplateBody(body: unknown): ApplyChecklistTemplateInput {
  const value = typeof body === 'object' && body !== null ? body : {};
  const record = value as Record<string, unknown>;

  return {
    displayName: typeof record.displayName === 'string' ? record.displayName : null,
    templateId: typeof record.templateId === 'string' ? record.templateId : '',
  };
}

async function getProjectChecklistForMembership(
  membership: OrganizationMembership,
  checklistId: string,
): Promise<ProjectChecklistResponse | null> {
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
        eq(projectChecklists.id, checklistId),
        eq(projects.organizationId, membership.organizationId),
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
      controlVersionId: projectChecklistItems.controlVersionId,
      displayOrder: projectChecklistItems.displayOrder,
      id: projectChecklistItems.id,
      status: projectChecklistVerificationRecords.status,
      templateItemId: projectChecklistItems.templateItemId,
      title: controlVersions.title,
      verificationRecordId: projectChecklistItems.verificationRecordId,
      versionNumber: controlVersions.versionNumber,
    })
    .from(projectChecklistItems)
    .innerJoin(controlVersions, eq(projectChecklistItems.controlVersionId, controlVersions.id))
    .innerJoin(
      projectChecklistVerificationRecords,
      eq(projectChecklistItems.verificationRecordId, projectChecklistVerificationRecords.id),
    )
    .where(eq(projectChecklistItems.projectChecklistId, checklist.id))
    .orderBy(asc(projectChecklistItems.displayOrder), asc(projectChecklistItems.createdAt));

  return {
    ...checklist,
    archivedAt: checklist.archivedAt?.toISOString() ?? null,
    createdAt: checklist.createdAt.toISOString(),
    items: itemRows.map((item) => ({
      control: {
        controlCode: item.controlCode,
        id: item.controlId,
        title: item.title,
      },
      controlVersion: {
        id: item.controlVersionId,
        versionNumber: item.versionNumber,
      },
      displayOrder: item.displayOrder,
      id: item.id,
      templateItemId: item.templateItemId,
      verificationRecord: {
        id: item.verificationRecordId,
        status: item.status,
      },
    })),
    updatedAt: checklist.updatedAt.toISOString(),
  };
}

async function assertProjectChecklistIsUnique(input: {
  componentId: string;
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
