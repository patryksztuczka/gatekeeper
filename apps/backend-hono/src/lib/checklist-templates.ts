import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { checklistTemplates, members, users } from '../db/schema';
import type { OrganizationMembership } from './projects';

export type ChecklistTemplateListItem = {
  author: {
    email: string;
    id: string;
    name: string;
  };
  createdAt: string;
  id: string;
  name: string;
  publishedAt: string | null;
  status: ChecklistTemplateStatus;
};

export type ChecklistTemplateListFilters = {
  search: string;
  status: ChecklistTemplateStatus | 'all';
};

type ChecklistTemplateStatus = 'active' | 'draft';

type CreateChecklistTemplateInput = {
  name: string;
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

  return rows
    .map(({ authorEmail, authorId, authorName, createdAt, publishedAt, status, ...template }) => ({
      ...template,
      author: {
        email: authorEmail,
        id: authorId,
        name: authorName,
      },
      createdAt: createdAt.toISOString(),
      publishedAt: publishedAt?.toISOString() ?? null,
      status: status as ChecklistTemplateStatus,
    }))
    .filter((template) => isChecklistTemplateVisible(template, membership))
    .filter((template) => matchesChecklistTemplateFilters(template, filters));
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

export function normalizeChecklistTemplateCreateBody(body: unknown): CreateChecklistTemplateInput {
  const value = typeof body === 'object' && body !== null ? body : {};
  const record = value as Record<string, unknown>;

  return { name: typeof record.name === 'string' ? record.name : '' };
}

export function normalizeChecklistTemplateListFilters(
  query: Record<string, string | string[] | undefined>,
): ChecklistTemplateListFilters {
  const status = firstQueryValue(query.status);

  return {
    search: firstQueryValue(query.q).trim(),
    status: status === 'active' || status === 'draft' ? status : 'all',
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

function firstQueryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}
