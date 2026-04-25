import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { controls, controlVersions, draftControls, members, users } from '../db/schema';
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

export type ControlVersionResponse = {
  acceptedEvidenceTypes: string[];
  applicabilityConditions: string;
  businessMeaning: string;
  controlCode: string;
  createdAt: string;
  externalStandardsMappings: ExternalStandardsMapping[];
  id: string;
  releaseImpact: ReleaseImpact;
  title: string;
  verificationMethod: string;
  versionNumber: number;
};

export type ControlListItem = {
  controlCode: string;
  createdAt: string;
  currentVersion: ControlVersionResponse;
  id: string;
  status: 'active';
  title: string;
};

export type ControlListFilters = {
  acceptedEvidenceType: string;
  releaseImpact: ReleaseImpact | '';
  search: string;
  standardsFramework: string;
  status: 'active' | 'archived';
};

export type DraftControlListFilters = {
  search: string;
};

type CreateDraftControlInput = {
  controlCode: string;
  title: string;
};

type ExternalStandardsMapping = {
  description?: string;
  framework: string;
  reference: string;
};

type ReleaseImpact = 'advisory' | 'blocking' | 'needs review';

type PublishDraftControlInput = {
  acceptedEvidenceTypes: string[];
  applicabilityConditions: string;
  businessMeaning: string;
  externalStandardsMappings: ExternalStandardsMapping[];
  releaseImpact: ReleaseImpact | '';
  verificationMethod: string;
};

const draftReviewerRoles = new Set(['owner', 'admin']);
const publishControlRoles = new Set(['owner', 'admin']);
const releaseImpacts = new Set(['advisory', 'blocking', 'needs review']);

export class DraftControlInputError extends Error {}
export class ControlPublishInputError extends Error {}

export function canPublishControls(role: string): boolean {
  return publishControlRoles.has(role);
}

export async function listControls(
  organizationId: string,
  filters: ControlListFilters = defaultControlListFilters,
): Promise<ControlListItem[]> {
  if (filters.status === 'archived') {
    return [];
  }

  const rows = await db
    .select({
      acceptedEvidenceTypes: controlVersions.acceptedEvidenceTypes,
      applicabilityConditions: controlVersions.applicabilityConditions,
      businessMeaning: controlVersions.businessMeaning,
      controlCode: controlVersions.controlCode,
      controlCreatedAt: controls.createdAt,
      controlId: controls.id,
      externalStandardsMappings: controlVersions.externalStandardsMappings,
      releaseImpact: controlVersions.releaseImpact,
      title: controlVersions.title,
      verificationMethod: controlVersions.verificationMethod,
      versionCreatedAt: controlVersions.createdAt,
      versionId: controlVersions.id,
      versionNumber: controlVersions.versionNumber,
    })
    .from(controls)
    .innerJoin(controlVersions, eq(controls.currentVersionId, controlVersions.id))
    .where(eq(controls.organizationId, organizationId))
    .orderBy(asc(controlVersions.controlCode), asc(controlVersions.title));

  return rows
    .map((row) => toControlListItem(row))
    .filter((control) => matchesControlFilters(control, filters));
}

export async function getControlDetail(
  membership: OrganizationMembership,
  controlId: string,
): Promise<ControlListItem | null> {
  const row = await db
    .select({
      acceptedEvidenceTypes: controlVersions.acceptedEvidenceTypes,
      applicabilityConditions: controlVersions.applicabilityConditions,
      businessMeaning: controlVersions.businessMeaning,
      controlCode: controlVersions.controlCode,
      controlCreatedAt: controls.createdAt,
      controlId: controls.id,
      externalStandardsMappings: controlVersions.externalStandardsMappings,
      releaseImpact: controlVersions.releaseImpact,
      title: controlVersions.title,
      verificationMethod: controlVersions.verificationMethod,
      versionCreatedAt: controlVersions.createdAt,
      versionId: controlVersions.id,
      versionNumber: controlVersions.versionNumber,
    })
    .from(controls)
    .innerJoin(controlVersions, eq(controls.currentVersionId, controlVersions.id))
    .where(and(eq(controls.organizationId, membership.organizationId), eq(controls.id, controlId)))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  return row ? toControlListItem(row) : null;
}

export async function listDraftControls(
  membership: OrganizationMembership,
  filters: DraftControlListFilters = defaultDraftControlListFilters,
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

  return rows
    .map(({ authorEmail, authorId, authorName, createdAt, ...draft }) => ({
      ...draft,
      author: {
        email: authorEmail,
        id: authorId,
        name: authorName,
      },
      createdAt: createdAt.toISOString(),
    }))
    .filter((draftControl) => matchesDraftControlFilters(draftControl, filters));
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

export async function publishDraftControl(
  membership: OrganizationMembership,
  draftControlId: string,
  input: PublishDraftControlInput,
): Promise<ControlListItem | null> {
  validatePublishInput(input);

  const draftControl = await db
    .select()
    .from(draftControls)
    .where(
      and(
        eq(draftControls.id, draftControlId),
        eq(draftControls.organizationId, membership.organizationId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!draftControl) {
    return null;
  }

  const existingControl = await db
    .select({ id: controls.id })
    .from(controls)
    .where(
      and(
        eq(controls.organizationId, membership.organizationId),
        eq(controls.currentControlCode, draftControl.controlCode),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (existingControl) {
    throw new ControlPublishInputError('Control Code is already used in this Organization.');
  }

  const now = new Date();
  const controlId = crypto.randomUUID();
  const versionId = crypto.randomUUID();

  await db.insert(controls).values({
    createdAt: now,
    currentControlCode: draftControl.controlCode,
    currentVersionId: versionId,
    id: controlId,
    organizationId: membership.organizationId,
    updatedAt: now,
  });
  await db.insert(controlVersions).values({
    acceptedEvidenceTypes: JSON.stringify(input.acceptedEvidenceTypes.map((value) => value.trim())),
    applicabilityConditions: input.applicabilityConditions.trim(),
    businessMeaning: input.businessMeaning.trim(),
    controlCode: draftControl.controlCode,
    controlId,
    createdAt: now,
    externalStandardsMappings: JSON.stringify(input.externalStandardsMappings),
    id: versionId,
    releaseImpact: input.releaseImpact,
    title: draftControl.title,
    verificationMethod: input.verificationMethod.trim(),
    versionNumber: 1,
  });
  await db.delete(draftControls).where(eq(draftControls.id, draftControl.id));

  return getControlDetail(membership, controlId);
}

export function normalizeDraftControlCreateBody(body: unknown): CreateDraftControlInput {
  const value = typeof body === 'object' && body !== null ? body : {};
  const record = value as Record<string, unknown>;

  return {
    controlCode: typeof record.controlCode === 'string' ? record.controlCode : '',
    title: typeof record.title === 'string' ? record.title : '',
  };
}

export function normalizeDraftControlPublishBody(body: unknown): PublishDraftControlInput {
  const value = typeof body === 'object' && body !== null ? body : {};
  const record = value as Record<string, unknown>;

  return {
    acceptedEvidenceTypes: toStringArray(record.acceptedEvidenceTypes),
    applicabilityConditions:
      typeof record.applicabilityConditions === 'string' ? record.applicabilityConditions : '',
    businessMeaning: typeof record.businessMeaning === 'string' ? record.businessMeaning : '',
    externalStandardsMappings: toExternalStandardsMappings(record.externalStandardsMappings),
    releaseImpact:
      typeof record.releaseImpact === 'string' && releaseImpacts.has(record.releaseImpact)
        ? (record.releaseImpact as ReleaseImpact)
        : '',
    verificationMethod:
      typeof record.verificationMethod === 'string' ? record.verificationMethod : '',
  };
}

export function normalizeControlListFilters(
  query: Record<string, string | string[] | undefined>,
): ControlListFilters {
  const releaseImpact = firstQueryValue(query.releaseImpact);
  const status = firstQueryValue(query.status);

  return {
    acceptedEvidenceType: firstQueryValue(query.acceptedEvidenceType).trim(),
    releaseImpact: releaseImpacts.has(releaseImpact) ? (releaseImpact as ReleaseImpact) : '',
    search: firstQueryValue(query.q).trim(),
    standardsFramework: firstQueryValue(query.standardsFramework).trim(),
    status: status === 'archived' ? 'archived' : 'active',
  };
}

export function normalizeDraftControlListFilters(
  query: Record<string, string | string[] | undefined>,
): DraftControlListFilters {
  return { search: firstQueryValue(query.q).trim() };
}

function validateDraftControlInput(input: CreateDraftControlInput) {
  if (!input.controlCode.trim()) {
    throw new DraftControlInputError('Control Code is required.');
  }

  if (!input.title.trim()) {
    throw new DraftControlInputError('Control title is required.');
  }
}

function validatePublishInput(input: PublishDraftControlInput) {
  if (!input.businessMeaning.trim()) {
    throw new ControlPublishInputError('Business meaning is required.');
  }

  if (!input.verificationMethod.trim()) {
    throw new ControlPublishInputError('Verification method is required.');
  }

  if (input.acceptedEvidenceTypes.filter((value) => value.trim()).length === 0) {
    throw new ControlPublishInputError('At least one Accepted Evidence Type is required.');
  }

  if (!input.applicabilityConditions.trim()) {
    throw new ControlPublishInputError('Applicability conditions are required.');
  }

  if (!input.releaseImpact) {
    throw new ControlPublishInputError('Release Impact is required.');
  }
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
    : [];
}

function firstQueryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

const defaultControlListFilters: ControlListFilters = {
  acceptedEvidenceType: '',
  releaseImpact: '',
  search: '',
  standardsFramework: '',
  status: 'active',
};

const defaultDraftControlListFilters: DraftControlListFilters = { search: '' };

function matchesControlFilters(control: ControlListItem, filters: ControlListFilters): boolean {
  const version = control.currentVersion;
  const search = filters.search.toLowerCase();

  if (
    search &&
    ![
      version.controlCode,
      version.title,
      version.businessMeaning,
      ...version.externalStandardsMappings.flatMap((mapping) => [
        mapping.framework,
        mapping.reference,
      ]),
    ].some((value) => value.toLowerCase().includes(search))
  ) {
    return false;
  }

  if (filters.releaseImpact && version.releaseImpact !== filters.releaseImpact) {
    return false;
  }

  if (
    filters.acceptedEvidenceType &&
    !version.acceptedEvidenceTypes.some(
      (value) => value.toLowerCase() === filters.acceptedEvidenceType.toLowerCase(),
    )
  ) {
    return false;
  }

  if (
    filters.standardsFramework &&
    !version.externalStandardsMappings.some(
      (mapping) => mapping.framework.toLowerCase() === filters.standardsFramework.toLowerCase(),
    )
  ) {
    return false;
  }

  return true;
}

function matchesDraftControlFilters(
  draftControl: DraftControlListItem,
  filters: DraftControlListFilters,
): boolean {
  const search = filters.search.toLowerCase();

  return search
    ? [draftControl.controlCode, draftControl.title].some((value) =>
        value.toLowerCase().includes(search),
      )
    : true;
}

function toExternalStandardsMappings(value: unknown): ExternalStandardsMapping[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return [];
    }

    const record = entry as Record<string, unknown>;
    const framework = typeof record.framework === 'string' ? record.framework.trim() : '';
    const reference = typeof record.reference === 'string' ? record.reference.trim() : '';

    if (!framework || !reference) {
      return [];
    }

    const description = typeof record.description === 'string' ? record.description.trim() : '';

    return [description ? { description, framework, reference } : { framework, reference }];
  });
}

function toControlListItem(row: {
  acceptedEvidenceTypes: string;
  applicabilityConditions: string;
  businessMeaning: string;
  controlCode: string;
  controlCreatedAt: Date;
  controlId: string;
  externalStandardsMappings: string;
  releaseImpact: string;
  title: string;
  verificationMethod: string;
  versionCreatedAt: Date;
  versionId: string;
  versionNumber: number;
}): ControlListItem {
  return {
    controlCode: row.controlCode,
    createdAt: row.controlCreatedAt.toISOString(),
    currentVersion: {
      acceptedEvidenceTypes: JSON.parse(row.acceptedEvidenceTypes) as string[],
      applicabilityConditions: row.applicabilityConditions,
      businessMeaning: row.businessMeaning,
      controlCode: row.controlCode,
      createdAt: row.versionCreatedAt.toISOString(),
      externalStandardsMappings: JSON.parse(
        row.externalStandardsMappings,
      ) as ExternalStandardsMapping[],
      id: row.versionId,
      releaseImpact: row.releaseImpact as ReleaseImpact,
      title: row.title,
      verificationMethod: row.verificationMethod,
      versionNumber: row.versionNumber,
    },
    id: row.controlId,
    status: 'active',
    title: row.title,
  };
}
