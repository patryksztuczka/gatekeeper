import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import {
  checklistTemplateItems,
  checklistTemplates,
  controls,
  controlVersions,
  members,
  users,
} from '../db/schema';
import type { OrganizationMembership } from './projects';

export type ChecklistTemplateItem = {
  control: {
    controlCode: string;
    id: string;
    title: string;
  };
  createdAt: string;
  id: string;
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
  status: ChecklistTemplateStatus;
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
      status: status as ChecklistTemplateStatus,
    }))
    .filter((template) => isChecklistTemplateVisible(template, membership))
    .filter((template) => matchesChecklistTemplateFilters(template, filters));

  const itemsByTemplateId = await listChecklistTemplateItems(
    membership.organizationId,
    templates.map(({ id }) => id),
  );

  return templates.map((template) => ({
    ...template,
    items: itemsByTemplateId.get(template.id) ?? [],
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
    .select({ id: checklistTemplates.id })
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

  const control = await db
    .select({ id: controls.id })
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

  const existingItem = await db
    .select({ id: checklistTemplateItems.id })
    .from(checklistTemplateItems)
    .where(
      and(
        eq(checklistTemplateItems.templateId, template.id),
        eq(checklistTemplateItems.controlId, control.id),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (existingItem) {
    throw new ChecklistTemplateInputError(
      'Control is already included in this Checklist Template.',
    );
  }

  await db.insert(checklistTemplateItems).values({
    controlId: control.id,
    createdAt: new Date(),
    id: crypto.randomUUID(),
    templateId: template.id,
  });

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
    .select({ id: checklistTemplateItems.id })
    .from(checklistTemplateItems)
    .innerJoin(checklistTemplates, eq(checklistTemplateItems.templateId, checklistTemplates.id))
    .where(
      and(
        eq(checklistTemplates.id, templateId),
        eq(checklistTemplates.organizationId, membership.organizationId),
        eq(checklistTemplateItems.id, itemId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!item) {
    return null;
  }

  await db.delete(checklistTemplateItems).where(eq(checklistTemplateItems.id, item.id));

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

  return { controlId: typeof record.controlId === 'string' ? record.controlId : '' };
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
      controlCode: controlVersions.controlCode,
      controlId: controls.id,
      createdAt: checklistTemplateItems.createdAt,
      id: checklistTemplateItems.id,
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
      ),
    )
    .orderBy(asc(checklistTemplateItems.createdAt), asc(controlVersions.controlCode));

  for (const row of rows) {
    const items = itemsByTemplateId.get(row.templateId) ?? [];

    items.push({
      control: {
        controlCode: row.controlCode,
        id: row.controlId,
        title: row.title,
      },
      createdAt: row.createdAt.toISOString(),
      id: row.id,
    });
    itemsByTemplateId.set(row.templateId, items);
  }

  return itemsByTemplateId;
}

function firstQueryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}
