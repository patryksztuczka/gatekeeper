import { and, asc, desc, eq, isNotNull, isNull, ne } from 'drizzle-orm';
import { db } from '../db/client';
import {
  controlProposedUpdates,
  controls,
  controlVersions,
  draftControls,
  members,
  users,
} from '../db/schema';
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
  archivedAt: string | null;
  archiveReason: string | null;
  controlCode: string;
  createdAt: string;
  currentVersion: ControlVersionResponse;
  id: string;
  status: 'active';
  title: string;
  versions: ControlVersionResponse[];
};

export type ControlProposedUpdateListItem = ControlVersionResponse & {
  author: {
    email: string;
    id: string;
    name: string;
  };
  controlId: string;
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

type ArchiveControlInput = {
  reason: string;
};

type CreateControlProposedUpdateInput = PublishDraftControlInput & {
  controlCode: string;
  title: string;
};

const draftReviewerRoles = new Set(['owner', 'admin']);
const publishControlRoles = new Set(['owner', 'admin']);
const archiveControlRoles = new Set(['owner', 'admin']);
const releaseImpacts = new Set(['advisory', 'blocking', 'needs review']);

export class DraftControlInputError extends Error {}
export class ControlPublishInputError extends Error {}
export class ControlProposedUpdateInputError extends Error {}

export function canPublishControls(role: string): boolean {
  return publishControlRoles.has(role);
}

export function canArchiveControls(role: string): boolean {
  return archiveControlRoles.has(role);
}

export async function listControls(
  organizationId: string,
  filters: ControlListFilters = defaultControlListFilters,
): Promise<ControlListItem[]> {
  const rows = await db
    .select({
      acceptedEvidenceTypes: controlVersions.acceptedEvidenceTypes,
      archivedAt: controls.archivedAt,
      archiveReason: controls.archiveReason,
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
    .where(
      and(
        eq(controls.organizationId, organizationId),
        filters.status === 'archived'
          ? isNotNull(controls.archivedAt)
          : isNull(controls.archivedAt),
      ),
    )
    .orderBy(asc(controlVersions.controlCode), asc(controlVersions.title));

  return (await Promise.all(rows.map((row) => toControlListItem(row)))).filter((control) =>
    matchesControlFilters(control, filters),
  );
}

export async function getControlDetail(
  membership: OrganizationMembership,
  controlId: string,
): Promise<ControlListItem | null> {
  const row = await db
    .select({
      acceptedEvidenceTypes: controlVersions.acceptedEvidenceTypes,
      archivedAt: controls.archivedAt,
      archiveReason: controls.archiveReason,
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

  if (!row || (row.archivedAt && !archiveControlRoles.has(membership.role))) {
    return null;
  }

  return toControlListItem(row);
}

export async function listControlProposedUpdates(
  membership: OrganizationMembership,
): Promise<ControlProposedUpdateListItem[]> {
  const rows = await db
    .select({
      acceptedEvidenceTypes: controlProposedUpdates.acceptedEvidenceTypes,
      applicabilityConditions: controlProposedUpdates.applicabilityConditions,
      authorEmail: users.email,
      authorId: members.id,
      authorName: users.name,
      businessMeaning: controlProposedUpdates.businessMeaning,
      controlCode: controlProposedUpdates.controlCode,
      controlId: controlProposedUpdates.controlId,
      createdAt: controlProposedUpdates.createdAt,
      externalStandardsMappings: controlProposedUpdates.externalStandardsMappings,
      id: controlProposedUpdates.id,
      releaseImpact: controlProposedUpdates.releaseImpact,
      title: controlProposedUpdates.title,
      verificationMethod: controlProposedUpdates.verificationMethod,
    })
    .from(controlProposedUpdates)
    .innerJoin(members, eq(controlProposedUpdates.authorMemberId, members.id))
    .innerJoin(users, eq(members.userId, users.id))
    .where(
      draftReviewerRoles.has(membership.role)
        ? eq(controlProposedUpdates.organizationId, membership.organizationId)
        : and(
            eq(controlProposedUpdates.organizationId, membership.organizationId),
            eq(controlProposedUpdates.authorMemberId, membership.id),
          ),
    )
    .orderBy(asc(controlProposedUpdates.createdAt), asc(controlProposedUpdates.controlCode));

  return rows.map(({ authorEmail, authorId, authorName, controlId, ...row }) => ({
    ...toControlVersionResponse({ ...row, versionNumber: 0 }),
    author: {
      email: authorEmail,
      id: authorId,
      name: authorName,
    },
    controlId,
  }));
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

  const trimmedControlCode = input.controlCode.trim();
  const existingDraft = await db
    .select({ id: draftControls.id })
    .from(draftControls)
    .where(
      and(
        eq(draftControls.organizationId, membership.organizationId),
        eq(draftControls.controlCode, trimmedControlCode),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (existingDraft) {
    throw new DraftControlInputError('Control Code is already used in this Organization.');
  }

  const existingControl = await db
    .select({ id: controls.id })
    .from(controls)
    .where(
      and(
        eq(controls.organizationId, membership.organizationId),
        eq(controls.currentControlCode, trimmedControlCode),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (existingControl) {
    throw new DraftControlInputError('Control Code is already used in this Organization.');
  }

  const now = new Date();
  const draft = {
    authorMemberId: membership.id,
    controlCode: trimmedControlCode,
    createdAt: now,
    id: crypto.randomUUID(),
    organizationId: membership.organizationId,
    title: input.title.trim(),
    updatedAt: now,
  };

  await db.insert(draftControls).values(draft);

  return (await listDraftControls(membership)).find(({ id }) => id === draft.id)!;
}

export async function cancelDraftControl(
  membership: OrganizationMembership,
  draftControlId: string,
): Promise<boolean> {
  const draftControl = await db
    .select({ authorMemberId: draftControls.authorMemberId, id: draftControls.id })
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
    return false;
  }

  if (draftControl.authorMemberId !== membership.id && !draftReviewerRoles.has(membership.role)) {
    return false;
  }

  await db.delete(draftControls).where(eq(draftControls.id, draftControl.id));

  return true;
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

export async function setControlArchivedForMembership(input: {
  archived: boolean;
  controlId: string;
  membership: OrganizationMembership;
  reason?: string;
}): Promise<ControlListItem | null> {
  const control = await db
    .select({ id: controls.id })
    .from(controls)
    .where(
      and(
        eq(controls.id, input.controlId),
        eq(controls.organizationId, input.membership.organizationId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!control) {
    return null;
  }

  await db
    .update(controls)
    .set(
      input.archived
        ? {
            archivedAt: new Date(),
            archivedByMemberId: input.membership.id,
            archiveReason: input.reason?.trim() || null,
            updatedAt: new Date(),
          }
        : {
            archivedAt: null,
            archivedByMemberId: null,
            archiveReason: null,
            updatedAt: new Date(),
          },
    )
    .where(eq(controls.id, control.id));

  return getControlDetail(input.membership, input.controlId);
}

export async function createControlProposedUpdate(
  membership: OrganizationMembership,
  controlId: string,
  input: CreateControlProposedUpdateInput,
): Promise<ControlProposedUpdateListItem | null> {
  validateProposedUpdateInput(input);

  const control = await db
    .select({ id: controls.id })
    .from(controls)
    .where(
      and(
        eq(controls.id, controlId),
        eq(controls.organizationId, membership.organizationId),
        isNull(controls.archivedAt),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!control) {
    return null;
  }

  const existingProposal = await db
    .select({ id: controlProposedUpdates.id })
    .from(controlProposedUpdates)
    .where(eq(controlProposedUpdates.controlId, controlId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (existingProposal) {
    throw new ControlProposedUpdateInputError('This Control already has an open proposed update.');
  }

  const existingControlWithCode = await db
    .select({ id: controls.id })
    .from(controls)
    .where(
      and(
        eq(controls.organizationId, membership.organizationId),
        eq(controls.currentControlCode, input.controlCode.trim()),
        ne(controls.id, controlId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (existingControlWithCode) {
    throw new ControlProposedUpdateInputError('Control Code is already used in this Organization.');
  }

  const now = new Date();
  const proposedUpdate = {
    acceptedEvidenceTypes: JSON.stringify(input.acceptedEvidenceTypes.map((value) => value.trim())),
    applicabilityConditions: input.applicabilityConditions.trim(),
    authorMemberId: membership.id,
    businessMeaning: input.businessMeaning.trim(),
    controlCode: input.controlCode.trim(),
    controlId,
    createdAt: now,
    externalStandardsMappings: JSON.stringify(input.externalStandardsMappings),
    id: crypto.randomUUID(),
    organizationId: membership.organizationId,
    releaseImpact: input.releaseImpact,
    title: input.title.trim(),
    updatedAt: now,
    verificationMethod: input.verificationMethod.trim(),
  };

  await db.insert(controlProposedUpdates).values(proposedUpdate);

  return (await listControlProposedUpdates(membership)).find(({ id }) => id === proposedUpdate.id)!;
}

export async function publishControlProposedUpdate(
  membership: OrganizationMembership,
  controlId: string,
  proposedUpdateId: string,
): Promise<ControlListItem | null> {
  const proposedUpdate = await db
    .select()
    .from(controlProposedUpdates)
    .where(
      and(
        eq(controlProposedUpdates.id, proposedUpdateId),
        eq(controlProposedUpdates.controlId, controlId),
        eq(controlProposedUpdates.organizationId, membership.organizationId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!proposedUpdate) {
    return null;
  }

  const activeControl = await db
    .select({ id: controls.id })
    .from(controls)
    .where(
      and(
        eq(controls.id, controlId),
        eq(controls.organizationId, membership.organizationId),
        isNull(controls.archivedAt),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!activeControl) {
    return null;
  }

  const existingControlWithCode = await db
    .select({ id: controls.id })
    .from(controls)
    .where(
      and(
        eq(controls.organizationId, membership.organizationId),
        eq(controls.currentControlCode, proposedUpdate.controlCode),
        ne(controls.id, controlId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (existingControlWithCode) {
    throw new ControlProposedUpdateInputError('Control Code is already used in this Organization.');
  }

  const latestVersion = await db
    .select({ versionNumber: controlVersions.versionNumber })
    .from(controlVersions)
    .where(eq(controlVersions.controlId, controlId))
    .orderBy(desc(controlVersions.versionNumber))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!latestVersion) {
    return null;
  }

  const now = new Date();
  const versionId = crypto.randomUUID();

  await db.insert(controlVersions).values({
    acceptedEvidenceTypes: proposedUpdate.acceptedEvidenceTypes,
    applicabilityConditions: proposedUpdate.applicabilityConditions,
    businessMeaning: proposedUpdate.businessMeaning,
    controlCode: proposedUpdate.controlCode,
    controlId,
    createdAt: now,
    externalStandardsMappings: proposedUpdate.externalStandardsMappings,
    id: versionId,
    releaseImpact: proposedUpdate.releaseImpact,
    title: proposedUpdate.title,
    verificationMethod: proposedUpdate.verificationMethod,
    versionNumber: latestVersion.versionNumber + 1,
  });
  await db
    .update(controls)
    .set({
      currentControlCode: proposedUpdate.controlCode,
      currentVersionId: versionId,
      updatedAt: now,
    })
    .where(eq(controls.id, controlId));
  await db.delete(controlProposedUpdates).where(eq(controlProposedUpdates.id, proposedUpdateId));

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

export function normalizeControlArchiveBody(body: unknown): ArchiveControlInput {
  const value = typeof body === 'object' && body !== null ? body : {};
  const record = value as Record<string, unknown>;

  return {
    reason: typeof record.reason === 'string' ? record.reason : '',
  };
}

export function normalizeControlProposedUpdateBody(
  body: unknown,
): CreateControlProposedUpdateInput {
  const value = typeof body === 'object' && body !== null ? body : {};
  const record = value as Record<string, unknown>;
  const publishInput = normalizeDraftControlPublishBody(body);

  return {
    ...publishInput,
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

function validateProposedUpdateInput(input: CreateControlProposedUpdateInput) {
  validateDraftControlInput(input);
  validatePublishInput(input);
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

async function toControlListItem(row: {
  acceptedEvidenceTypes: string;
  archivedAt: Date | null;
  archiveReason: string | null;
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
}): Promise<ControlListItem> {
  const versions = await getControlVersions(row.controlId);

  return {
    archivedAt: row.archivedAt?.toISOString() ?? null,
    archiveReason: row.archiveReason,
    controlCode: row.controlCode,
    createdAt: row.controlCreatedAt.toISOString(),
    currentVersion: toControlVersionResponse({
      acceptedEvidenceTypes: row.acceptedEvidenceTypes,
      applicabilityConditions: row.applicabilityConditions,
      businessMeaning: row.businessMeaning,
      controlCode: row.controlCode,
      createdAt: row.versionCreatedAt,
      externalStandardsMappings: row.externalStandardsMappings,
      id: row.versionId,
      releaseImpact: row.releaseImpact,
      title: row.title,
      verificationMethod: row.verificationMethod,
      versionNumber: row.versionNumber,
    }),
    id: row.controlId,
    status: 'active',
    title: row.title,
    versions,
  };
}

async function getControlVersions(controlId: string): Promise<ControlVersionResponse[]> {
  const rows = await db
    .select()
    .from(controlVersions)
    .where(eq(controlVersions.controlId, controlId))
    .orderBy(desc(controlVersions.versionNumber));

  return rows.map((row) => toControlVersionResponse(row));
}

function toControlVersionResponse(row: {
  acceptedEvidenceTypes: string;
  applicabilityConditions: string;
  businessMeaning: string;
  controlCode: string;
  createdAt: Date;
  externalStandardsMappings: string;
  id: string;
  releaseImpact: string;
  title: string;
  verificationMethod: string;
  versionNumber: number;
}): ControlVersionResponse {
  return {
    acceptedEvidenceTypes: JSON.parse(row.acceptedEvidenceTypes) as string[],
    applicabilityConditions: row.applicabilityConditions,
    businessMeaning: row.businessMeaning,
    controlCode: row.controlCode,
    createdAt: row.createdAt.toISOString(),
    externalStandardsMappings: JSON.parse(
      row.externalStandardsMappings,
    ) as ExternalStandardsMapping[],
    id: row.id,
    releaseImpact: row.releaseImpact as ReleaseImpact,
    title: row.title,
    verificationMethod: row.verificationMethod,
    versionNumber: row.versionNumber,
  };
}
