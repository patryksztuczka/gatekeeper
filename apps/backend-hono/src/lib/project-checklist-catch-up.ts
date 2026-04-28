import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import {
  checklistTemplateItems,
  controls,
  projectChecklistItems,
  projectChecklists,
  projectChecklistVerificationRecords,
  projectComponents,
  projects,
} from '../db/schema';

type CatchUpProjectChecklistsInput = {
  checklistId?: string;
  componentId?: string;
  projectId?: string;
};

export async function catchUpActiveProjectChecklists(input: CatchUpProjectChecklistsInput) {
  const checklists = await db
    .select({ id: projectChecklists.id, templateId: projectChecklists.templateId })
    .from(projectChecklists)
    .innerJoin(projectComponents, eq(projectChecklists.componentId, projectComponents.id))
    .innerJoin(projects, eq(projectComponents.projectId, projects.id))
    .where(
      and(
        input.checklistId ? eq(projectChecklists.id, input.checklistId) : undefined,
        input.componentId ? eq(projectComponents.id, input.componentId) : undefined,
        input.projectId ? eq(projects.id, input.projectId) : undefined,
        isNull(projectChecklists.archivedAt),
        isNull(projectComponents.archivedAt),
        isNull(projects.archivedAt),
      ),
    );

  for (const checklist of checklists) {
    await catchUpActiveProjectChecklist(checklist);
  }
}

async function catchUpActiveProjectChecklist(checklist: { id: string; templateId: string }) {
  const activeTemplateItems = await db
    .select({
      controlId: checklistTemplateItems.controlId,
      controlVersionId: controls.currentVersionId,
      displayOrder: checklistTemplateItems.displayOrder,
      templateItemId: checklistTemplateItems.id,
    })
    .from(checklistTemplateItems)
    .innerJoin(controls, eq(checklistTemplateItems.controlId, controls.id))
    .where(
      and(
        eq(checklistTemplateItems.templateId, checklist.templateId),
        isNull(checklistTemplateItems.removedAt),
        isNull(controls.archivedAt),
      ),
    );
  const existingItems = await db
    .select({
      controlVersionId: projectChecklistItems.controlVersionId,
      id: projectChecklistItems.id,
      removedFromTemplateAt: projectChecklistItems.removedFromTemplateAt,
      templateItemId: projectChecklistItems.templateItemId,
    })
    .from(projectChecklistItems)
    .where(eq(projectChecklistItems.projectChecklistId, checklist.id));
  const activeTemplateItemIds = new Set(
    activeTemplateItems.map(({ templateItemId }) => templateItemId),
  );
  const now = new Date();

  for (const item of existingItems) {
    if (!activeTemplateItemIds.has(item.templateItemId) && !item.removedFromTemplateAt) {
      await db
        .update(projectChecklistItems)
        .set({ removedFromTemplateAt: now })
        .where(eq(projectChecklistItems.id, item.id));
    }
  }

  for (const templateItem of activeTemplateItems) {
    if (!templateItem.controlVersionId) {
      continue;
    }

    const existingItem = existingItems.find(
      (item) => item.templateItemId === templateItem.templateItemId,
    );

    if (!existingItem) {
      const verificationRecordId = crypto.randomUUID();

      await db.insert(projectChecklistVerificationRecords).values({
        controlVersionId: templateItem.controlVersionId,
        createdAt: now,
        id: verificationRecordId,
        status: 'unchecked',
        updatedAt: now,
      });
      await db.insert(projectChecklistItems).values({
        controlId: templateItem.controlId,
        controlVersionId: templateItem.controlVersionId,
        createdAt: now,
        displayOrder: templateItem.displayOrder,
        id: crypto.randomUUID(),
        projectChecklistId: checklist.id,
        removedFromTemplateAt: null,
        templateItemId: templateItem.templateItemId,
        verificationRecordId,
      });
      continue;
    }

    if (existingItem.controlVersionId === templateItem.controlVersionId) {
      await db
        .update(projectChecklistItems)
        .set({ displayOrder: templateItem.displayOrder, removedFromTemplateAt: null })
        .where(eq(projectChecklistItems.id, existingItem.id));
      continue;
    }

    const verificationRecordId = crypto.randomUUID();

    await db.insert(projectChecklistVerificationRecords).values({
      controlVersionId: templateItem.controlVersionId,
      createdAt: now,
      id: verificationRecordId,
      status: 'unchecked',
      updatedAt: now,
    });
    await db
      .update(projectChecklistItems)
      .set({
        controlVersionId: templateItem.controlVersionId,
        displayOrder: templateItem.displayOrder,
        removedFromTemplateAt: null,
        verificationRecordId,
      })
      .where(eq(projectChecklistItems.id, existingItem.id));
  }
}
