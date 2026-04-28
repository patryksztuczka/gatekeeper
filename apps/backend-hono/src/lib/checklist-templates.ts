import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import {
  checklistTemplateItems,
  checklistTemplateSections,
  checklistTemplates,
  controls,
  controlVersions,
  members,
  projectChecklistItems,
  projectChecklists,
  projectChecklistVerificationRecords,
  projectComponents,
  projects,
  users,
} from '../db/schema';
import type { OrganizationMembership } from './projects';

export type ChecklistTemplateItem = {
  control: {
    archivedAt: string | null;
    controlCode: string;
    id: string;
    title: string;
  };
  createdAt: string;
  displayOrder: number;
  id: string;
  requiresAdminAttention: boolean;
  sectionId: string | null;
};

export type ChecklistTemplateSection = {
  displayOrder: number;
  id: string;
  items: ChecklistTemplateItem[];
  name: string;
};

export type ChecklistTemplateListItem = {
  author: {
    email: string;
    id: string;
    name: string;
  };
  createdAt: string;
  id: string;
  items: ChecklistTemplateItem[];
  name: string;
  publishedAt: string | null;
  sections: ChecklistTemplateSection[];
  status: ChecklistTemplateStatus;
  unsectionedItems: ChecklistTemplateItem[];
};

export type ChecklistTemplateListFilters = {
  search: string;
  status: ChecklistTemplateStatus | 'all';
};

type ChecklistTemplateStatus = 'active' | 'archived' | 'draft';

type CreateChecklistTemplateInput = {
  name: string;
};

type AddChecklistTemplateItemInput = {
  controlId: string;
  sectionId: string | null;
};

type CreateChecklistTemplateSectionInput = {
  name: string;
};

type ReorderChecklistTemplateSectionsInput = {
  sectionIds: string[];
};

type ReorderChecklistTemplateItemsInput = {
  items: Array<{
    id: string;
    sectionId: string | null;
  }>;
};

const manageChecklistTemplateRoles = new Set(['owner', 'admin']);

export class ChecklistTemplateInputError extends Error {}

export function canManageChecklistTemplates(role: string): boolean {
  return manageChecklistTemplateRoles.has(role);
}

export async function listChecklistTemplates(
  membership: OrganizationMembership,
  filters: ChecklistTemplateListFilters = defaultChecklistTemplateListFilters,
): Promise<ChecklistTemplateListItem[]> {
  const rows = await db
    .select({
      authorEmail: users.email,
      authorId: members.id,
      authorName: users.name,
      createdAt: checklistTemplates.createdAt,
      id: checklistTemplates.id,
      name: checklistTemplates.name,
      publishedAt: checklistTemplates.publishedAt,
      status: checklistTemplates.status,
    })
    .from(checklistTemplates)
    .innerJoin(members, eq(checklistTemplates.authorMemberId, members.id))
    .innerJoin(users, eq(members.userId, users.id))
    .where(eq(checklistTemplates.organizationId, membership.organizationId))
    .orderBy(asc(checklistTemplates.createdAt), asc(checklistTemplates.name));

  const templates = rows
    .map(({ authorEmail, authorId, authorName, createdAt, publishedAt, status, ...template }) => ({
      ...template,
      author: {
        email: authorEmail,
        id: authorId,
        name: authorName,
      },
      createdAt: createdAt.toISOString(),
      items: [] as ChecklistTemplateItem[],
      publishedAt: publishedAt?.toISOString() ?? null,
      sections: [] as ChecklistTemplateSection[],
      status: status as ChecklistTemplateStatus,
      unsectionedItems: [] as ChecklistTemplateItem[],
    }))
    .filter((template) => isChecklistTemplateVisible(template, membership))
    .filter((template) => matchesChecklistTemplateFilters(template, filters));

  const itemsByTemplateId = await listChecklistTemplateItems(
    membership.organizationId,
    templates.map(({ id }) => id),
  );
  const sectionsByTemplateId = await listChecklistTemplateSections(
    membership.organizationId,
    templates.map(({ id }) => id),
    itemsByTemplateId,
  );

  return templates.map((template) => ({
    ...template,
    items: itemsByTemplateId.get(template.id) ?? [],
    sections: sectionsByTemplateId.get(template.id) ?? [],
    unsectionedItems: (itemsByTemplateId.get(template.id) ?? []).filter(
      ({ sectionId }) => !sectionId,
    ),
  }));
}

export async function createChecklistTemplate(
  membership: OrganizationMembership,
  input: CreateChecklistTemplateInput,
): Promise<ChecklistTemplateListItem> {
  if (!canManageChecklistTemplates(membership.role)) {
    throw new ChecklistTemplateInputError(
      'Only Organization owners and admins can create Checklist Templates.',
    );
  }

  validateChecklistTemplateInput(input);

  const normalizedName = normalizeChecklistTemplateName(input.name);
  const existingTemplate = await db
    .select({ id: checklistTemplates.id })
    .from(checklistTemplates)
    .where(
      and(
        eq(checklistTemplates.organizationId, membership.organizationId),
        eq(checklistTemplates.normalizedName, normalizedName),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (existingTemplate) {
    throw new ChecklistTemplateInputError(
      'Checklist Template name is already used in this Organization.',
    );
  }

  const now = new Date();
  const template = {
    authorMemberId: membership.id,
    createdAt: now,
    id: crypto.randomUUID(),
    name: input.name.trim(),
    normalizedName,
    organizationId: membership.organizationId,
    status: 'draft',
    updatedAt: now,
  };

  await db.insert(checklistTemplates).values(template);

  return (await listChecklistTemplates(membership)).find(({ id }) => id === template.id)!;
}

export async function publishChecklistTemplate(
  membership: OrganizationMembership,
  templateId: string,
): Promise<ChecklistTemplateListItem | null> {
  if (!canManageChecklistTemplates(membership.role)) {
    return null;
  }

  const template = await db
    .select({ id: checklistTemplates.id })
    .from(checklistTemplates)
    .where(
      and(
        eq(checklistTemplates.id, templateId),
        eq(checklistTemplates.organizationId, membership.organizationId),
        eq(checklistTemplates.status, 'draft'),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!template) {
    return null;
  }

  const now = new Date();

  await db
    .update(checklistTemplates)
    .set({ publishedAt: now, status: 'active', updatedAt: now })
    .where(eq(checklistTemplates.id, template.id));

  return (await listChecklistTemplates(membership, { search: '', status: 'active' })).find(
    ({ id }) => id === template.id,
  )!;
}

export async function setChecklistTemplateArchivedForMembership(input: {
  archived: boolean;
  membership: OrganizationMembership;
  templateId: string;
}): Promise<ChecklistTemplateListItem | null> {
  if (!canManageChecklistTemplates(input.membership.role)) {
    return null;
  }

  const template = await db
    .select({ id: checklistTemplates.id })
    .from(checklistTemplates)
    .where(
      and(
        eq(checklistTemplates.id, input.templateId),
        eq(checklistTemplates.organizationId, input.membership.organizationId),
        eq(checklistTemplates.status, input.archived ? 'active' : 'archived'),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!template) {
    return null;
  }

  await db
    .update(checklistTemplates)
    .set({ status: input.archived ? 'archived' : 'active', updatedAt: new Date() })
    .where(eq(checklistTemplates.id, template.id));

  return (await listChecklistTemplates(input.membership)).find(({ id }) => id === template.id)!;
}

export async function addChecklistTemplateItem(
  membership: OrganizationMembership,
  templateId: string,
  input: AddChecklistTemplateItemInput,
): Promise<ChecklistTemplateListItem | null> {
  if (!canManageChecklistTemplates(membership.role)) {
    return null;
  }

  const template = await db
    .select({ id: checklistTemplates.id, status: checklistTemplates.status })
    .from(checklistTemplates)
    .where(
      and(
        eq(checklistTemplates.id, templateId),
        eq(checklistTemplates.organizationId, membership.organizationId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!template) {
    return null;
  }

  const sectionId = await validateChecklistTemplateItemSection(template.id, input.sectionId);

  const control = await db
    .select({ currentVersionId: controls.currentVersionId, id: controls.id })
    .from(controls)
    .where(
      and(
        eq(controls.id, input.controlId),
        eq(controls.organizationId, membership.organizationId),
        isNull(controls.archivedAt),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!control) {
    throw new ChecklistTemplateInputError(
      'Only active, non-archived Controls can be added to Checklist Templates.',
    );
  }

  if (!control.currentVersionId) {
    throw new ChecklistTemplateInputError(
      'Only active, non-archived Controls can be added to Checklist Templates.',
    );
  }

  const existingItem = await db
    .select({ id: checklistTemplateItems.id, removedAt: checklistTemplateItems.removedAt })
    .from(checklistTemplateItems)
    .where(
      and(
        eq(checklistTemplateItems.templateId, template.id),
        eq(checklistTemplateItems.controlId, control.id),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (existingItem && !existingItem.removedAt) {
    throw new ChecklistTemplateInputError(
      'Control is already included in this Checklist Template.',
    );
  }

  const now = new Date();
  const displayOrder = await nextChecklistTemplateItemDisplayOrder(template.id, sectionId);
  const itemId = existingItem?.id ?? crypto.randomUUID();

  if (existingItem) {
    await db
      .update(checklistTemplateItems)
      .set({ displayOrder, removedAt: null, sectionId })
      .where(eq(checklistTemplateItems.id, existingItem.id));
  } else {
    await db.insert(checklistTemplateItems).values({
      controlId: control.id,
      createdAt: now,
      displayOrder,
      id: itemId,
      removedAt: null,
      sectionId,
      templateId: template.id,
    });
  }

  if (template.status === 'active') {
    await propagateChecklistTemplateItemAdded({
      controlId: control.id,
      controlVersionId: control.currentVersionId,
      displayOrder,
      templateId: template.id,
      templateItemId: itemId,
    });
  }

  return (await listChecklistTemplates(membership)).find(({ id }) => id === template.id)!;
}

export async function createChecklistTemplateSection(
  membership: OrganizationMembership,
  templateId: string,
  input: CreateChecklistTemplateSectionInput,
): Promise<ChecklistTemplateListItem | null> {
  if (!canManageChecklistTemplates(membership.role)) {
    return null;
  }

  validateChecklistTemplateSectionInput(input);

  const template = await findManageableChecklistTemplate(membership.organizationId, templateId);

  if (!template) {
    return null;
  }

  const normalizedName = normalizeChecklistTemplateName(input.name);
  const existingSection = await db
    .select({ id: checklistTemplateSections.id })
    .from(checklistTemplateSections)
    .where(
      and(
        eq(checklistTemplateSections.templateId, template.id),
        eq(checklistTemplateSections.normalizedName, normalizedName),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (existingSection) {
    throw new ChecklistTemplateInputError(
      'Checklist Template Section name is already used in this Checklist Template.',
    );
  }

  const now = new Date();

  await db.insert(checklistTemplateSections).values({
    createdAt: now,
    displayOrder: await nextChecklistTemplateSectionDisplayOrder(template.id),
    id: crypto.randomUUID(),
    name: input.name.trim(),
    normalizedName,
    templateId: template.id,
    updatedAt: now,
  });

  return (await listChecklistTemplates(membership)).find(({ id }) => id === template.id)!;
}

export async function renameChecklistTemplateSection(
  membership: OrganizationMembership,
  templateId: string,
  sectionId: string,
  input: CreateChecklistTemplateSectionInput,
): Promise<ChecklistTemplateListItem | null> {
  if (!canManageChecklistTemplates(membership.role)) {
    return null;
  }

  validateChecklistTemplateSectionInput(input);

  const template = await findManageableChecklistTemplate(membership.organizationId, templateId);

  if (!template) {
    return null;
  }

  const section = await findChecklistTemplateSection(template.id, sectionId);

  if (!section) {
    return null;
  }

  const normalizedName = normalizeChecklistTemplateName(input.name);
  const existingSection = await db
    .select({ id: checklistTemplateSections.id })
    .from(checklistTemplateSections)
    .where(
      and(
        eq(checklistTemplateSections.templateId, template.id),
        eq(checklistTemplateSections.normalizedName, normalizedName),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (existingSection && existingSection.id !== section.id) {
    throw new ChecklistTemplateInputError(
      'Checklist Template Section name is already used in this Checklist Template.',
    );
  }

  await db
    .update(checklistTemplateSections)
    .set({ name: input.name.trim(), normalizedName, updatedAt: new Date() })
    .where(eq(checklistTemplateSections.id, section.id));

  return (await listChecklistTemplates(membership)).find(({ id }) => id === template.id)!;
}

export async function reorderChecklistTemplateSections(
  membership: OrganizationMembership,
  templateId: string,
  input: ReorderChecklistTemplateSectionsInput,
): Promise<ChecklistTemplateListItem | null> {
  if (!canManageChecklistTemplates(membership.role)) {
    return null;
  }

  const template = await findManageableChecklistTemplate(membership.organizationId, templateId);

  if (!template) {
    return null;
  }

  const sections = await listSectionIds(template.id);

  validateCompleteIdSet(
    input.sectionIds,
    sections,
    'Section order must include each Section once.',
  );

  await Promise.all(
    input.sectionIds.map((id, displayOrder) =>
      db
        .update(checklistTemplateSections)
        .set({ displayOrder, updatedAt: new Date() })
        .where(eq(checklistTemplateSections.id, id)),
    ),
  );

  return (await listChecklistTemplates(membership)).find(({ id }) => id === template.id)!;
}

export async function reorderChecklistTemplateItems(
  membership: OrganizationMembership,
  templateId: string,
  input: ReorderChecklistTemplateItemsInput,
): Promise<ChecklistTemplateListItem | null> {
  if (!canManageChecklistTemplates(membership.role)) {
    return null;
  }

  const template = await findManageableChecklistTemplate(membership.organizationId, templateId);

  if (!template) {
    return null;
  }

  const existingItemIds = await listItemIds(template.id);
  const requestedItemIds = input.items.map(({ id }) => id);

  validateCompleteIdSet(
    requestedItemIds,
    existingItemIds,
    'Item order must include each item once.',
  );

  const sectionIds = new Set(await listSectionIds(template.id));
  const displayOrderBySectionId = new Map<string, number>();

  for (const item of input.items) {
    if (item.sectionId && !sectionIds.has(item.sectionId)) {
      throw new ChecklistTemplateInputError('Checklist Template Section is unavailable.');
    }

    const key = item.sectionId ?? '';
    const displayOrder = displayOrderBySectionId.get(key) ?? 0;
    displayOrderBySectionId.set(key, displayOrder + 1);

    await db
      .update(checklistTemplateItems)
      .set({ displayOrder, sectionId: item.sectionId })
      .where(eq(checklistTemplateItems.id, item.id));
  }

  return (await listChecklistTemplates(membership)).find(({ id }) => id === template.id)!;
}

export async function removeChecklistTemplateItem(
  membership: OrganizationMembership,
  templateId: string,
  itemId: string,
): Promise<ChecklistTemplateListItem | null> {
  if (!canManageChecklistTemplates(membership.role)) {
    return null;
  }

  const item = await db
    .select({ id: checklistTemplateItems.id, templateStatus: checklistTemplates.status })
    .from(checklistTemplateItems)
    .innerJoin(checklistTemplates, eq(checklistTemplateItems.templateId, checklistTemplates.id))
    .where(
      and(
        eq(checklistTemplates.id, templateId),
        eq(checklistTemplates.organizationId, membership.organizationId),
        eq(checklistTemplateItems.id, itemId),
        isNull(checklistTemplateItems.removedAt),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!item) {
    return null;
  }

  const now = new Date();

  await db
    .update(checklistTemplateItems)
    .set({ removedAt: now })
    .where(eq(checklistTemplateItems.id, item.id));

  if (item.templateStatus === 'active') {
    await propagateChecklistTemplateItemRemoved({
      removedAt: now,
      templateId,
      templateItemId: item.id,
    });
  }

  return (await listChecklistTemplates(membership)).find(({ id }) => id === templateId)!;
}

export function normalizeChecklistTemplateCreateBody(body: unknown): CreateChecklistTemplateInput {
  const value = typeof body === 'object' && body !== null ? body : {};
  const record = value as Record<string, unknown>;

  return { name: typeof record.name === 'string' ? record.name : '' };
}

export function normalizeChecklistTemplateItemBody(body: unknown): AddChecklistTemplateItemInput {
  const value = typeof body === 'object' && body !== null ? body : {};
  const record = value as Record<string, unknown>;

  return {
    controlId: typeof record.controlId === 'string' ? record.controlId : '',
    sectionId: typeof record.sectionId === 'string' ? record.sectionId : null,
  };
}

export function normalizeChecklistTemplateSectionBody(
  body: unknown,
): CreateChecklistTemplateSectionInput {
  const value = typeof body === 'object' && body !== null ? body : {};
  const record = value as Record<string, unknown>;

  return { name: typeof record.name === 'string' ? record.name : '' };
}

export function normalizeChecklistTemplateSectionOrderBody(
  body: unknown,
): ReorderChecklistTemplateSectionsInput {
  const value = typeof body === 'object' && body !== null ? body : {};
  const record = value as Record<string, unknown>;

  return {
    sectionIds: Array.isArray(record.sectionIds)
      ? record.sectionIds.filter((sectionId): sectionId is string => typeof sectionId === 'string')
      : [],
  };
}

export function normalizeChecklistTemplateItemOrderBody(
  body: unknown,
): ReorderChecklistTemplateItemsInput {
  const value = typeof body === 'object' && body !== null ? body : {};
  const record = value as Record<string, unknown>;

  return {
    items: Array.isArray(record.items)
      ? record.items.flatMap((item) => {
          if (typeof item !== 'object' || item === null) {
            return [];
          }

          const itemRecord = item as Record<string, unknown>;

          if (typeof itemRecord.id !== 'string') {
            return [];
          }

          return [
            {
              id: itemRecord.id,
              sectionId: typeof itemRecord.sectionId === 'string' ? itemRecord.sectionId : null,
            },
          ];
        })
      : [],
  };
}

export function normalizeChecklistTemplateListFilters(
  query: Record<string, string | string[] | undefined>,
): ChecklistTemplateListFilters {
  const status = firstQueryValue(query.status);

  return {
    search: firstQueryValue(query.q).trim(),
    status: status === 'active' || status === 'archived' || status === 'draft' ? status : 'all',
  };
}

const defaultChecklistTemplateListFilters: ChecklistTemplateListFilters = {
  search: '',
  status: 'all',
};

function isChecklistTemplateVisible(
  template: ChecklistTemplateListItem,
  membership: OrganizationMembership,
): boolean {
  return (
    template.status === 'active' ||
    template.author.id === membership.id ||
    canManageChecklistTemplates(membership.role)
  );
}

function matchesChecklistTemplateFilters(
  template: ChecklistTemplateListItem,
  filters: ChecklistTemplateListFilters,
): boolean {
  if (filters.status !== 'all' && template.status !== filters.status) {
    return false;
  }

  const search = filters.search.toLowerCase();

  return search ? template.name.toLowerCase().includes(search) : true;
}

function validateChecklistTemplateInput(input: CreateChecklistTemplateInput) {
  if (!input.name.trim()) {
    throw new ChecklistTemplateInputError('Checklist Template name is required.');
  }
}

function validateChecklistTemplateSectionInput(input: CreateChecklistTemplateSectionInput) {
  if (!input.name.trim()) {
    throw new ChecklistTemplateInputError('Checklist Template Section name is required.');
  }
}

function validateCompleteIdSet(ids: string[], existingIds: string[], message: string) {
  const requestedIds = new Set(ids);
  const availableIds = new Set(existingIds);

  if (
    requestedIds.size !== ids.length ||
    requestedIds.size !== availableIds.size ||
    ids.some((id) => !availableIds.has(id))
  ) {
    throw new ChecklistTemplateInputError(message);
  }
}

function normalizeChecklistTemplateName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

async function listChecklistTemplateItems(
  organizationId: string,
  templateIds: string[],
): Promise<Map<string, ChecklistTemplateItem[]>> {
  const itemsByTemplateId = new Map<string, ChecklistTemplateItem[]>();

  if (templateIds.length === 0) {
    return itemsByTemplateId;
  }

  const rows = await db
    .select({
      archivedAt: controls.archivedAt,
      controlCode: controlVersions.controlCode,
      controlId: controls.id,
      createdAt: checklistTemplateItems.createdAt,
      displayOrder: checklistTemplateItems.displayOrder,
      id: checklistTemplateItems.id,
      sectionId: checklistTemplateItems.sectionId,
      templateId: checklistTemplateItems.templateId,
      title: controlVersions.title,
    })
    .from(checklistTemplateItems)
    .innerJoin(checklistTemplates, eq(checklistTemplateItems.templateId, checklistTemplates.id))
    .innerJoin(controls, eq(checklistTemplateItems.controlId, controls.id))
    .innerJoin(controlVersions, eq(controls.currentVersionId, controlVersions.id))
    .where(
      and(
        eq(checklistTemplates.organizationId, organizationId),
        inArray(checklistTemplateItems.templateId, templateIds),
        isNull(checklistTemplateItems.removedAt),
      ),
    )
    .orderBy(
      asc(checklistTemplateItems.sectionId),
      asc(checklistTemplateItems.displayOrder),
      asc(checklistTemplateItems.createdAt),
      asc(controlVersions.controlCode),
    );

  for (const row of rows) {
    const items = itemsByTemplateId.get(row.templateId) ?? [];

    items.push({
      control: {
        archivedAt: row.archivedAt?.toISOString() ?? null,
        controlCode: row.controlCode,
        id: row.controlId,
        title: row.title,
      },
      createdAt: row.createdAt.toISOString(),
      displayOrder: row.displayOrder,
      id: row.id,
      requiresAdminAttention: row.archivedAt !== null,
      sectionId: row.sectionId,
    });
    itemsByTemplateId.set(row.templateId, items);
  }

  return itemsByTemplateId;
}

async function listChecklistTemplateSections(
  organizationId: string,
  templateIds: string[],
  itemsByTemplateId: Map<string, ChecklistTemplateItem[]>,
): Promise<Map<string, ChecklistTemplateSection[]>> {
  const sectionsByTemplateId = new Map<string, ChecklistTemplateSection[]>();

  if (templateIds.length === 0) {
    return sectionsByTemplateId;
  }

  const rows = await db
    .select({
      displayOrder: checklistTemplateSections.displayOrder,
      id: checklistTemplateSections.id,
      name: checklistTemplateSections.name,
      templateId: checklistTemplateSections.templateId,
    })
    .from(checklistTemplateSections)
    .innerJoin(checklistTemplates, eq(checklistTemplateSections.templateId, checklistTemplates.id))
    .where(
      and(
        eq(checklistTemplates.organizationId, organizationId),
        inArray(checklistTemplateSections.templateId, templateIds),
      ),
    )
    .orderBy(asc(checklistTemplateSections.displayOrder), asc(checklistTemplateSections.createdAt));

  for (const row of rows) {
    const sections = sectionsByTemplateId.get(row.templateId) ?? [];
    const items = itemsByTemplateId.get(row.templateId) ?? [];

    sections.push({
      displayOrder: row.displayOrder,
      id: row.id,
      items: items.filter(({ sectionId }) => sectionId === row.id),
      name: row.name,
    });
    sectionsByTemplateId.set(row.templateId, sections);
  }

  return sectionsByTemplateId;
}

async function findManageableChecklistTemplate(organizationId: string, templateId: string) {
  return db
    .select({ id: checklistTemplates.id })
    .from(checklistTemplates)
    .where(
      and(
        eq(checklistTemplates.id, templateId),
        eq(checklistTemplates.organizationId, organizationId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

async function findChecklistTemplateSection(templateId: string, sectionId: string) {
  return db
    .select({ id: checklistTemplateSections.id })
    .from(checklistTemplateSections)
    .where(
      and(
        eq(checklistTemplateSections.id, sectionId),
        eq(checklistTemplateSections.templateId, templateId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

async function validateChecklistTemplateItemSection(
  templateId: string,
  sectionId: string | null,
): Promise<string | null> {
  if (!sectionId) {
    return null;
  }

  const section = await findChecklistTemplateSection(templateId, sectionId);

  if (!section) {
    throw new ChecklistTemplateInputError('Checklist Template Section is unavailable.');
  }

  return section.id;
}

async function listSectionIds(templateId: string): Promise<string[]> {
  return db
    .select({ id: checklistTemplateSections.id })
    .from(checklistTemplateSections)
    .where(eq(checklistTemplateSections.templateId, templateId))
    .then((rows) => rows.map(({ id }) => id));
}

async function listItemIds(templateId: string): Promise<string[]> {
  return db
    .select({ id: checklistTemplateItems.id })
    .from(checklistTemplateItems)
    .where(
      and(
        eq(checklistTemplateItems.templateId, templateId),
        isNull(checklistTemplateItems.removedAt),
      ),
    )
    .then((rows) => rows.map(({ id }) => id));
}

async function nextChecklistTemplateSectionDisplayOrder(templateId: string): Promise<number> {
  return (await listSectionIds(templateId)).length;
}

async function nextChecklistTemplateItemDisplayOrder(
  templateId: string,
  sectionId: string | null,
): Promise<number> {
  return db
    .select({ id: checklistTemplateItems.id })
    .from(checklistTemplateItems)
    .where(
      sectionId
        ? and(
            eq(checklistTemplateItems.templateId, templateId),
            eq(checklistTemplateItems.sectionId, sectionId),
            isNull(checklistTemplateItems.removedAt),
          )
        : and(
            eq(checklistTemplateItems.templateId, templateId),
            isNull(checklistTemplateItems.sectionId),
            isNull(checklistTemplateItems.removedAt),
          ),
    )
    .then((rows) => rows.length);
}

async function propagateChecklistTemplateItemAdded(input: {
  controlId: string;
  controlVersionId: string;
  displayOrder: number;
  templateId: string;
  templateItemId: string;
}) {
  const checklists = await listActiveProjectChecklistsForTemplate(input.templateId);

  for (const checklist of checklists) {
    const existingItem = await db
      .select({ id: projectChecklistItems.id })
      .from(projectChecklistItems)
      .where(
        and(
          eq(projectChecklistItems.projectChecklistId, checklist.id),
          eq(projectChecklistItems.templateItemId, input.templateItemId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (existingItem) {
      await db
        .update(projectChecklistItems)
        .set({ displayOrder: input.displayOrder, removedFromTemplateAt: null })
        .where(eq(projectChecklistItems.id, existingItem.id));
      continue;
    }

    const now = new Date();
    const verificationRecordId = crypto.randomUUID();

    await db.insert(projectChecklistVerificationRecords).values({
      controlVersionId: input.controlVersionId,
      createdAt: now,
      id: verificationRecordId,
      status: 'unchecked',
      updatedAt: now,
    });
    await db.insert(projectChecklistItems).values({
      controlId: input.controlId,
      controlVersionId: input.controlVersionId,
      createdAt: now,
      displayOrder: input.displayOrder,
      id: crypto.randomUUID(),
      projectChecklistId: checklist.id,
      removedFromTemplateAt: null,
      templateItemId: input.templateItemId,
      verificationRecordId,
    });
  }
}

async function propagateChecklistTemplateItemRemoved(input: {
  removedAt: Date;
  templateId: string;
  templateItemId: string;
}) {
  const checklists = await listActiveProjectChecklistsForTemplate(input.templateId);

  if (checklists.length === 0) {
    return;
  }

  await db
    .update(projectChecklistItems)
    .set({ removedFromTemplateAt: input.removedAt })
    .where(
      and(
        eq(projectChecklistItems.templateItemId, input.templateItemId),
        inArray(
          projectChecklistItems.projectChecklistId,
          checklists.map(({ id }) => id),
        ),
      ),
    );
}

async function listActiveProjectChecklistsForTemplate(templateId: string) {
  return db
    .select({ id: projectChecklists.id })
    .from(projectChecklists)
    .innerJoin(projectComponents, eq(projectChecklists.componentId, projectComponents.id))
    .innerJoin(projects, eq(projectComponents.projectId, projects.id))
    .where(
      and(
        eq(projectChecklists.templateId, templateId),
        isNull(projectChecklists.archivedAt),
        isNull(projectComponents.archivedAt),
        isNull(projects.archivedAt),
      ),
    );
}

function firstQueryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}
