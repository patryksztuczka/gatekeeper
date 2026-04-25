import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { draftControls, members, users } from '../db/schema';
import type { OrganizationMembership } from './projects';

export type DraftControlListItem = {
  author: {
    email: string;
    id: string;
    name: string;
  };
  controlCode: string;
  createdAt: string;
  id: string;
  title: string;
};

type CreateDraftControlInput = {
  controlCode: string;
  title: string;
};

const draftReviewerRoles = new Set(['owner', 'admin']);

export class DraftControlInputError extends Error {}

export async function listDraftControls(
  membership: OrganizationMembership,
): Promise<DraftControlListItem[]> {
  const rows = await db
    .select({
      authorEmail: users.email,
      authorId: members.id,
      authorName: users.name,
      controlCode: draftControls.controlCode,
      createdAt: draftControls.createdAt,
      id: draftControls.id,
      title: draftControls.title,
    })
    .from(draftControls)
    .innerJoin(members, eq(draftControls.authorMemberId, members.id))
    .innerJoin(users, eq(members.userId, users.id))
    .where(
      draftReviewerRoles.has(membership.role)
        ? eq(draftControls.organizationId, membership.organizationId)
        : and(
            eq(draftControls.organizationId, membership.organizationId),
            eq(draftControls.authorMemberId, membership.id),
          ),
    )
    .orderBy(asc(draftControls.createdAt), asc(draftControls.controlCode));

  return rows.map(({ authorEmail, authorId, authorName, createdAt, ...draft }) => ({
    ...draft,
    author: {
      email: authorEmail,
      id: authorId,
      name: authorName,
    },
    createdAt: createdAt.toISOString(),
  }));
}

export async function createDraftControl(
  membership: OrganizationMembership,
  input: CreateDraftControlInput,
): Promise<DraftControlListItem> {
  validateDraftControlInput(input);

  const existingDraft = await db
    .select({ id: draftControls.id })
    .from(draftControls)
    .where(
      and(
        eq(draftControls.organizationId, membership.organizationId),
        eq(draftControls.controlCode, input.controlCode.trim()),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (existingDraft) {
    throw new DraftControlInputError('Control Code is already used in this Organization.');
  }

  const now = new Date();
  const draft = {
    authorMemberId: membership.id,
    controlCode: input.controlCode.trim(),
    createdAt: now,
    id: crypto.randomUUID(),
    organizationId: membership.organizationId,
    title: input.title.trim(),
    updatedAt: now,
  };

  await db.insert(draftControls).values(draft);

  return (await listDraftControls(membership)).find(({ id }) => id === draft.id)!;
}

export function normalizeDraftControlCreateBody(body: unknown): CreateDraftControlInput {
  const value = typeof body === 'object' && body !== null ? body : {};
  const record = value as Record<string, unknown>;

  return {
    controlCode: typeof record.controlCode === 'string' ? record.controlCode : '',
    title: typeof record.title === 'string' ? record.title : '',
  };
}

function validateDraftControlInput(input: CreateDraftControlInput) {
  if (!input.controlCode.trim()) {
    throw new DraftControlInputError('Control Code is required.');
  }

  if (!input.title.trim()) {
    throw new DraftControlInputError('Control title is required.');
  }
}
