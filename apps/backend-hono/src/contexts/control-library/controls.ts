import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  controlCodeReservations,
  controlProposedUpdates,
  controlPublishRequestApprovals,
  controlPublishRequests,
  controls,
  controlVersions,
  draftControls,
  members,
  users,
} from '../../db/schema';
import type { AuthorizedOrganizationMember } from '../../types/organization-types';
import type { OrganizationAuthorizationPolicy } from '../identity-organization/organization-authorization';
import {
  canPublishControlPublishRequest,
  ensureControlPublishAllowed,
  ensureControlPublishRequestApprovalAllowed,
  ensureControlPublishRequestPublishAllowed,
  ensureControlPublishRequestRejectionAllowed,
  ensureControlPublishRequestWithdrawalAllowed,
  getControlPublishRequestRequiredApprovals,
} from './control-publish-governance';

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
  businessMeaning: string;
  controlCode: string;
  createdAt: string;
  id: string;
  title: string;
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

export type ControlPublishRequestListItem = ControlVersionResponse & {
  approvalCount: number;
  author: {
    email: string;
    id: string;
    name: string;
  };
  controlId: string | null;
  draftControlId: string | null;
  isPublishable: boolean;
  proposedUpdateId: string | null;
  rejectionComment: string | null;
  requestType: 'draft_control' | 'proposed_update';
  requiredApprovalCount: number;
  status: 'draft' | 'submitted';
  submittedAt: string;
};

export type ControlListFilters = {
  search: string;
  status: 'active' | 'archived';
};

export type DraftControlListFilters = {
  search: string;
};

type CreateDraftControlInput = {
  title: string;
};

type PublishDraftControlInput = {
  businessMeaning: string;
};

type CreateControlProposedUpdateInput = PublishDraftControlInput & {
  title: string;
};

type RejectControlPublishRequestInput = {
  comment: string;
};

const draftReviewerRoles = new Set(['owner', 'admin']);
const controlPublisherRoles = ['owner', 'admin'] as const;
const controlCodePrefix = 'CTL';

export const controlLibraryAuthorizationActions = {
  approvePublishRequest: {
    allowedRoles: controlPublisherRoles,
    deniedMessage: 'Only Organization owners and admins can approve Control Publish Requests.',
  },
  archive: {
    allowedRoles: controlPublisherRoles,
    deniedMessage: 'Only Organization owners and admins can archive Controls.',
  },
  cancelDraft: {
    allowedRoles: 'any-member',
    deniedMessage: 'Only Organization members can cancel Draft Controls.',
  },
  createDraft: {
    allowedRoles: 'any-member',
    deniedMessage: 'Only Organization members can create Draft Controls.',
  },
  createProposedUpdate: {
    allowedRoles: 'any-member',
    deniedMessage: 'Only Organization members can propose Control updates.',
  },
  listActive: {
    allowedRoles: 'any-member',
    deniedMessage: 'Only Organization members can view active Controls.',
  },
  listArchived: {
    allowedRoles: controlPublisherRoles,
    deniedMessage: 'Only Organization owners and admins can view archived Controls.',
  },
  listDrafts: {
    allowedRoles: 'any-member',
    deniedMessage: 'Only Organization members can view Draft Controls.',
  },
  listProposedUpdates: {
    allowedRoles: 'any-member',
    deniedMessage: 'Only Organization members can view proposed Control updates.',
  },
  listPublishRequests: {
    allowedRoles: 'any-member',
    deniedMessage: 'Only Organization members can view Control Publish Requests.',
  },
  publishDraft: {
    allowedRoles: controlPublisherRoles,
    deniedMessage: 'Only Organization owners and admins can publish Controls.',
  },
  publishProposedUpdate: {
    allowedRoles: controlPublisherRoles,
    deniedMessage: 'Only Organization owners and admins can publish Controls.',
  },
  publishPublishRequest: {
    allowedRoles: controlPublisherRoles,
    deniedMessage: 'Only Organization owners and admins can publish Control Publish Requests.',
  },
  rejectPublishRequest: {
    allowedRoles: controlPublisherRoles,
    deniedMessage: 'Only Organization owners and admins can reject Control Publish Requests.',
  },
  rejectProposedUpdate: {
    allowedRoles: controlPublisherRoles,
    deniedMessage: 'Only Organization owners and admins can reject proposed Control updates.',
  },
  restore: {
    allowedRoles: controlPublisherRoles,
    deniedMessage: 'Only Organization owners and admins can restore Controls.',
  },
  submitDraftPublishRequest: {
    allowedRoles: 'any-member',
    deniedMessage: 'Only Organization members can submit Control Publish Requests.',
  },
  submitProposedUpdatePublishRequest: {
    allowedRoles: 'any-member',
    deniedMessage: 'Only Organization members can submit Control Publish Requests.',
  },
  viewActive: {
    allowedRoles: 'any-member',
    deniedMessage: 'Only Organization members can view Controls.',
  },
  viewArchived: {
    allowedRoles: controlPublisherRoles,
    deniedMessage: 'Only Organization owners and admins can view archived Controls.',
  },
  withdrawPublishRequest: {
    allowedRoles: 'any-member',
    deniedMessage: 'Only Organization members can withdraw Control Publish Requests.',
  },
} satisfies Record<string, OrganizationAuthorizationPolicy>;

export class DraftControlInputError extends Error {}
export class ControlPublishInputError extends Error {}
export class ControlProposedUpdateInputError extends Error {}
export class ControlPublishRequestInputError extends Error {}

export async function listControls(
  organizationId: string,
  filters: ControlListFilters = defaultControlListFilters,
) {
  const rows = await db
    .select({
      archivedAt: controls.archivedAt,
      archiveReason: controls.archiveReason,
      businessMeaning: controlVersions.businessMeaning,
      controlCode: controlVersions.controlCode,
      controlCreatedAt: controls.createdAt,
      controlId: controls.id,
      title: controlVersions.title,
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
  membership: AuthorizedOrganizationMember,
  controlId: string,
) {
  const row = await db
    .select({
      archivedAt: controls.archivedAt,
      archiveReason: controls.archiveReason,
      businessMeaning: controlVersions.businessMeaning,
      controlCode: controlVersions.controlCode,
      controlCreatedAt: controls.createdAt,
      controlId: controls.id,
      title: controlVersions.title,
      versionCreatedAt: controlVersions.createdAt,
      versionId: controlVersions.id,
      versionNumber: controlVersions.versionNumber,
    })
    .from(controls)
    .innerJoin(controlVersions, eq(controls.currentVersionId, controlVersions.id))
    .where(and(eq(controls.organizationId, membership.organizationId), eq(controls.id, controlId)))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!row) {
    return null;
  }

  return toControlListItem(row);
}

export async function listControlProposedUpdates(membership: AuthorizedOrganizationMember) {
  const rows = await db
    .select({
      authorEmail: users.email,
      authorId: members.id,
      authorName: users.name,
      businessMeaning: controlProposedUpdates.businessMeaning,
      controlCode: controls.currentControlCode,
      controlId: controlProposedUpdates.controlId,
      createdAt: controlProposedUpdates.createdAt,
      id: controlProposedUpdates.id,
      title: controlProposedUpdates.title,
    })
    .from(controlProposedUpdates)
    .innerJoin(controls, eq(controlProposedUpdates.controlId, controls.id))
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
    .orderBy(asc(controlProposedUpdates.createdAt), asc(controls.currentControlCode));

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

export async function listControlPublishRequests(membership: AuthorizedOrganizationMember) {
  const rows = await db
    .select({
      approvalCount: controlPublishRequests.approvalCount,
      authorEmail: users.email,
      authorId: members.id,
      authorName: users.name,
      businessMeaning: controlPublishRequests.businessMeaning,
      controlCode: controlPublishRequests.controlCode,
      controlId: controlPublishRequests.controlId,
      createdAt: controlPublishRequests.submittedAt,
      draftControlId: controlPublishRequests.draftControlId,
      id: controlPublishRequests.id,
      proposedUpdateId: controlPublishRequests.proposedUpdateId,
      rejectionComment: controlPublishRequests.rejectionComment,
      requestType: controlPublishRequests.requestType,
      requiredApprovalCount: controlPublishRequests.requiredApprovalCount,
      status: controlPublishRequests.status,
      submittedAt: controlPublishRequests.submittedAt,
      title: controlPublishRequests.title,
    })
    .from(controlPublishRequests)
    .innerJoin(members, eq(controlPublishRequests.authorMemberId, members.id))
    .innerJoin(users, eq(members.userId, users.id))
    .where(
      draftReviewerRoles.has(membership.role)
        ? eq(controlPublishRequests.organizationId, membership.organizationId)
        : and(
            eq(controlPublishRequests.organizationId, membership.organizationId),
            eq(controlPublishRequests.authorMemberId, membership.id),
          ),
    )
    .orderBy(desc(controlPublishRequests.submittedAt), asc(controlPublishRequests.controlCode));

  return rows.map(
    ({
      approvalCount,
      authorEmail,
      authorId,
      authorName,
      controlId,
      draftControlId,
      proposedUpdateId,
      rejectionComment,
      requestType,
      requiredApprovalCount,
      status,
      submittedAt,
      ...row
    }) => ({
      ...toControlVersionResponse({ ...row, versionNumber: 0 }),
      approvalCount,
      author: {
        email: authorEmail,
        id: authorId,
        name: authorName,
      },
      controlId,
      draftControlId,
      isPublishable: canPublishControlPublishRequest({
        approvalCount,
        requiredApprovalCount,
        status,
      }),
      proposedUpdateId,
      rejectionComment,
      requestType: requestType as 'draft_control' | 'proposed_update',
      requiredApprovalCount,
      status: status as 'draft' | 'submitted',
      submittedAt: submittedAt.toISOString(),
    }),
  );
}

export async function publishControlPublishRequest(
  membership: AuthorizedOrganizationMember,
  publishRequestId: string,
) {
  const request = await db
    .select()
    .from(controlPublishRequests)
    .where(
      and(
        eq(controlPublishRequests.id, publishRequestId),
        eq(controlPublishRequests.organizationId, membership.organizationId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!request) {
    return null;
  }

  ensureControlPublishRequestPublishAllowed(request);

  if (request.requestType === 'draft_control' && request.draftControlId) {
    return publishDraftControl(membership, request.draftControlId, toPublishInput(request));
  }

  if (request.requestType === 'proposed_update' && request.controlId && request.proposedUpdateId) {
    return publishControlProposedUpdate(membership, request.controlId, request.proposedUpdateId);
  }

  return null;
}

export async function listDraftControls(
  membership: AuthorizedOrganizationMember,
  filters: DraftControlListFilters = defaultDraftControlListFilters,
) {
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
  membership: AuthorizedOrganizationMember,
  input: CreateDraftControlInput,
) {
  validateDraftControlInput(input);

  const now = new Date();
  const draftId = crypto.randomUUID();
  const controlCode = await reserveNextControlCode(membership.organizationId, draftId, now);
  const draft = {
    authorMemberId: membership.id,
    controlCode,
    createdAt: now,
    id: draftId,
    organizationId: membership.organizationId,
    title: input.title.trim(),
    updatedAt: now,
  };

  await db.insert(draftControls).values(draft);

  return (await listDraftControls(membership)).find(({ id }) => id === draft.id)!;
}

export async function cancelDraftControl(
  membership: AuthorizedOrganizationMember,
  draftControlId: string,
) {
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

async function reserveNextControlCode(
  organizationId: string,
  draftControlId: string,
  reservedAt: Date,
) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const lastReservation = await db
      .select({
        sequenceNumber: sql<number>`coalesce(max(${controlCodeReservations.sequenceNumber}), 0)`,
      })
      .from(controlCodeReservations)
      .where(eq(controlCodeReservations.organizationId, organizationId))
      .then((rows) => rows[0]);

    const sequenceNumber = (lastReservation?.sequenceNumber ?? 0) + 1;
    const controlCode = formatControlCode(sequenceNumber);

    try {
      await db.insert(controlCodeReservations).values({
        controlCode,
        createdAt: reservedAt,
        id: crypto.randomUUID(),
        organizationId,
        reservedByDraftControlId: draftControlId,
        sequenceNumber,
      });

      return controlCode;
    } catch (caughtError) {
      if (!isUniqueConstraintError(caughtError)) {
        throw caughtError;
      }
    }
  }

  throw new DraftControlInputError('Unable to reserve the next Control Code.');
}

function formatControlCode(sequenceNumber: number) {
  return `${controlCodePrefix}-${String(sequenceNumber).padStart(3, '0')}`;
}

function isUniqueConstraintError(caughtError: unknown) {
  return caughtError instanceof Error && caughtError.message.includes('UNIQUE constraint failed');
}

export async function publishDraftControl(
  membership: AuthorizedOrganizationMember,
  draftControlId: string,
  input: PublishDraftControlInput,
) {
  validatePublishInput(input);

  await ensureControlPublishAllowed({
    draftControlId,
    organizationId: membership.organizationId,
    proposedUpdateId: null,
  });

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
    businessMeaning: input.businessMeaning.trim(),
    controlCode: draftControl.controlCode,
    controlId,
    createdAt: now,
    id: versionId,
    title: draftControl.title,
    versionNumber: 1,
  });
  await db.delete(draftControls).where(eq(draftControls.id, draftControl.id));

  return getControlDetail(membership, controlId);
}

export async function setControlArchivedForMembership(input: {
  archived: boolean;
  controlId: string;
  membership: AuthorizedOrganizationMember;
  reason?: string;
}) {
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
  membership: AuthorizedOrganizationMember,
  controlId: string,
  input: CreateControlProposedUpdateInput,
) {
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

  const now = new Date();
  const proposedUpdate = {
    authorMemberId: membership.id,
    businessMeaning: input.businessMeaning.trim(),
    controlId,
    createdAt: now,
    id: crypto.randomUUID(),
    organizationId: membership.organizationId,
    title: input.title.trim(),
    updatedAt: now,
  };

  await db.insert(controlProposedUpdates).values(proposedUpdate);

  return (await listControlProposedUpdates(membership)).find(({ id }) => id === proposedUpdate.id)!;
}

export async function submitDraftControlPublishRequest(
  membership: AuthorizedOrganizationMember,
  draftControlId: string,
  input: PublishDraftControlInput,
) {
  validatePublishInput(input);

  const requiredApprovalCount = await getControlPublishRequestRequiredApprovals(
    membership.organizationId,
  );

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

  if (draftControl.authorMemberId !== membership.id && !draftReviewerRoles.has(membership.role)) {
    return null;
  }

  const existingRequest = await db
    .select({ id: controlPublishRequests.id })
    .from(controlPublishRequests)
    .where(eq(controlPublishRequests.draftControlId, draftControlId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  const request = {
    approvalCount: 0,
    authorMemberId: membership.id,
    businessMeaning: input.businessMeaning.trim(),
    controlCode: draftControl.controlCode,
    controlId: null,
    draftControlId,
    id: crypto.randomUUID(),
    organizationId: membership.organizationId,
    proposedUpdateId: null,
    requestType: 'draft_control',
    requiredApprovalCount,
    rejectionComment: null,
    status: 'submitted',
    submittedAt: new Date(),
    title: draftControl.title,
  };

  if (existingRequest) {
    await resetControlPublishRequest(existingRequest.id, request);
  } else {
    await db.insert(controlPublishRequests).values(request);
  }

  return (await listControlPublishRequests(membership)).find(
    ({ id }) => id === (existingRequest?.id ?? request.id),
  )!;
}

export async function submitControlProposedUpdatePublishRequest(
  membership: AuthorizedOrganizationMember,
  controlId: string,
  proposedUpdateId: string,
) {
  const requiredApprovalCount = await getControlPublishRequestRequiredApprovals(
    membership.organizationId,
  );

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

  if (proposedUpdate.authorMemberId !== membership.id && !draftReviewerRoles.has(membership.role)) {
    return null;
  }

  const controlCode = await getCurrentControlCode(controlId);
  if (!controlCode) {
    return null;
  }

  const existingRequest = await db
    .select({ id: controlPublishRequests.id })
    .from(controlPublishRequests)
    .where(eq(controlPublishRequests.proposedUpdateId, proposedUpdateId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  const request = {
    approvalCount: 0,
    authorMemberId: membership.id,
    businessMeaning: proposedUpdate.businessMeaning,
    controlCode,
    controlId,
    draftControlId: null,
    id: crypto.randomUUID(),
    organizationId: membership.organizationId,
    proposedUpdateId,
    requestType: 'proposed_update',
    requiredApprovalCount,
    rejectionComment: null,
    status: 'submitted',
    submittedAt: new Date(),
    title: proposedUpdate.title,
  };

  if (existingRequest) {
    await resetControlPublishRequest(existingRequest.id, request);
  } else {
    await db.insert(controlPublishRequests).values(request);
  }

  return (await listControlPublishRequests(membership)).find(
    ({ id }) => id === (existingRequest?.id ?? request.id),
  )!;
}

export async function approveControlPublishRequest(
  membership: AuthorizedOrganizationMember,
  publishRequestId: string,
) {
  const request = await getReviewableControlPublishRequest(membership, publishRequestId);

  if (!request) {
    return null;
  }

  ensureControlPublishRequestApprovalAllowed({
    approverMemberId: membership.id,
    authorMemberId: request.authorMemberId,
    status: request.status,
  });

  const existingApproval = await db
    .select({ id: controlPublishRequestApprovals.id })
    .from(controlPublishRequestApprovals)
    .where(
      and(
        eq(controlPublishRequestApprovals.requestId, publishRequestId),
        eq(controlPublishRequestApprovals.approverMemberId, membership.id),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!existingApproval) {
    await db.insert(controlPublishRequestApprovals).values({
      approverMemberId: membership.id,
      createdAt: new Date(),
      id: crypto.randomUUID(),
      requestId: publishRequestId,
    });
  }

  await updateControlPublishRequestApprovalCount(publishRequestId);

  return (await listControlPublishRequests(membership)).find(({ id }) => id === publishRequestId)!;
}

export async function rejectControlPublishRequest(
  membership: AuthorizedOrganizationMember,
  publishRequestId: string,
  input: RejectControlPublishRequestInput,
) {
  const request = await getReviewableControlPublishRequest(membership, publishRequestId);
  const comment = input.comment.trim();

  if (!request) {
    return null;
  }

  if (!comment) {
    throw new ControlPublishRequestInputError('Rejection comment is required.');
  }

  ensureControlPublishRequestRejectionAllowed(request.status);

  await clearControlPublishRequestApprovals(publishRequestId);
  await db
    .update(controlPublishRequests)
    .set({ approvalCount: 0, rejectionComment: comment, status: 'draft' })
    .where(eq(controlPublishRequests.id, publishRequestId));

  return (await listControlPublishRequests(membership)).find(({ id }) => id === publishRequestId)!;
}

export async function withdrawControlPublishRequest(
  membership: AuthorizedOrganizationMember,
  publishRequestId: string,
) {
  const request = await getReviewableControlPublishRequest(membership, publishRequestId);

  if (!request) {
    return null;
  }

  ensureControlPublishRequestWithdrawalAllowed({
    authorMemberId: request.authorMemberId,
    memberId: membership.id,
    status: request.status,
  });

  await clearControlPublishRequestApprovals(publishRequestId);
  await db
    .update(controlPublishRequests)
    .set({ approvalCount: 0, rejectionComment: null, status: 'draft' })
    .where(eq(controlPublishRequests.id, publishRequestId));

  return (await listControlPublishRequests(membership)).find(({ id }) => id === publishRequestId)!;
}

export async function publishControlProposedUpdate(
  membership: AuthorizedOrganizationMember,
  controlId: string,
  proposedUpdateId: string,
) {
  await ensureControlPublishAllowed({
    draftControlId: null,
    organizationId: membership.organizationId,
    proposedUpdateId,
  });

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
    .select({ currentControlCode: controls.currentControlCode, id: controls.id })
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
    businessMeaning: proposedUpdate.businessMeaning,
    controlCode: activeControl.currentControlCode,
    controlId,
    createdAt: now,
    id: versionId,
    title: proposedUpdate.title,
    versionNumber: latestVersion.versionNumber + 1,
  });
  await db
    .update(controls)
    .set({
      currentVersionId: versionId,
      updatedAt: now,
    })
    .where(eq(controls.id, controlId));
  await db.delete(controlProposedUpdates).where(eq(controlProposedUpdates.id, proposedUpdateId));

  return getControlDetail(membership, controlId);
}

export async function rejectControlProposedUpdate(
  membership: AuthorizedOrganizationMember,
  controlId: string,
  proposedUpdateId: string,
) {
  const proposedUpdate = await db
    .select({ id: controlProposedUpdates.id })
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
    return false;
  }

  await db.delete(controlProposedUpdates).where(eq(controlProposedUpdates.id, proposedUpdateId));

  return true;
}

export function normalizeDraftControlCreateBody(body: unknown) {
  const value = typeof body === 'object' && body !== null ? body : {};
  const record = value as Record<string, unknown>;

  return {
    title: typeof record.title === 'string' ? record.title : '',
  };
}

export function normalizeDraftControlPublishBody(body: unknown) {
  const value = typeof body === 'object' && body !== null ? body : {};
  const record = value as Record<string, unknown>;

  return {
    businessMeaning: typeof record.businessMeaning === 'string' ? record.businessMeaning : '',
  };
}

export function normalizeControlListFilters(query: Record<string, string | string[] | undefined>) {
  const status = firstQueryValue(query.status);
  const normalizedStatus: ControlListFilters['status'] =
    status === 'archived' ? 'archived' : 'active';

  return {
    search: firstQueryValue(query.q).trim(),
    status: normalizedStatus,
  };
}

export function normalizeDraftControlListFilters(
  query: Record<string, string | string[] | undefined>,
) {
  return { search: firstQueryValue(query.q).trim() };
}

export function normalizeControlArchiveBody(body: unknown) {
  const value = typeof body === 'object' && body !== null ? body : {};
  const record = value as Record<string, unknown>;

  return {
    reason: typeof record.reason === 'string' ? record.reason : '',
  };
}

export function normalizeControlProposedUpdateBody(body: unknown) {
  const value = typeof body === 'object' && body !== null ? body : {};
  const record = value as Record<string, unknown>;
  const publishInput = normalizeDraftControlPublishBody(body);

  return {
    ...publishInput,
    title: typeof record.title === 'string' ? record.title : '',
  };
}

export function normalizeControlPublishRequestRejectionBody(body: unknown) {
  const value = typeof body === 'object' && body !== null ? body : {};
  const record = value as Record<string, unknown>;

  return { comment: typeof record.comment === 'string' ? record.comment : '' };
}

function validateDraftControlInput(input: CreateDraftControlInput) {
  if (!input.title.trim()) {
    throw new DraftControlInputError('Control title is required.');
  }
}

function validatePublishInput(input: PublishDraftControlInput) {
  if (!input.businessMeaning.trim()) {
    throw new ControlPublishInputError('Business meaning is required.');
  }
}

function validateProposedUpdateInput(input: CreateControlProposedUpdateInput) {
  validateDraftControlInput(input);
  validatePublishInput(input);
}

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

const defaultControlListFilters: ControlListFilters = {
  search: '',
  status: 'active',
};

const defaultDraftControlListFilters: DraftControlListFilters = { search: '' };

function matchesControlFilters(control: ControlListItem, filters: ControlListFilters) {
  const version = control.currentVersion;
  const search = filters.search.toLowerCase();

  if (
    search &&
    ![version.controlCode, version.title, version.businessMeaning].some((value) =>
      value.toLowerCase().includes(search),
    )
  ) {
    return false;
  }

  return true;
}

function matchesDraftControlFilters(
  draftControl: DraftControlListItem,
  filters: DraftControlListFilters,
) {
  const search = filters.search.toLowerCase();

  return search
    ? [draftControl.controlCode, draftControl.title].some((value) =>
        value.toLowerCase().includes(search),
      )
    : true;
}

async function toControlListItem(row: {
  archivedAt: Date | null;
  archiveReason: string | null;
  businessMeaning: string;
  controlCode: string;
  controlCreatedAt: Date;
  controlId: string;
  title: string;
  versionCreatedAt: Date;
  versionId: string;
  versionNumber: number;
}) {
  const versions = await getControlVersions(row.controlId);

  return {
    archivedAt: row.archivedAt?.toISOString() ?? null,
    archiveReason: row.archiveReason,
    controlCode: row.controlCode,
    createdAt: row.controlCreatedAt.toISOString(),
    currentVersion: toControlVersionResponse({
      businessMeaning: row.businessMeaning,
      controlCode: row.controlCode,
      createdAt: row.versionCreatedAt,
      id: row.versionId,
      title: row.title,
      versionNumber: row.versionNumber,
    }),
    id: row.controlId,
    status: 'active' as const,
    title: row.title,
    versions,
  };
}

async function getControlVersions(controlId: string) {
  const rows = await db
    .select()
    .from(controlVersions)
    .where(eq(controlVersions.controlId, controlId))
    .orderBy(desc(controlVersions.versionNumber));

  return rows.map((row) => toControlVersionResponse(row));
}

async function getCurrentControlCode(controlId: string) {
  return db
    .select({ currentControlCode: controls.currentControlCode })
    .from(controls)
    .where(eq(controls.id, controlId))
    .limit(1)
    .then((rows) => rows[0]?.currentControlCode ?? null);
}

async function getReviewableControlPublishRequest(
  membership: AuthorizedOrganizationMember,
  publishRequestId: string,
) {
  return db
    .select({
      authorMemberId: controlPublishRequests.authorMemberId,
      id: controlPublishRequests.id,
      status: controlPublishRequests.status,
    })
    .from(controlPublishRequests)
    .where(
      and(
        eq(controlPublishRequests.id, publishRequestId),
        eq(controlPublishRequests.organizationId, membership.organizationId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

async function resetControlPublishRequest(
  requestId: string,
  values: typeof controlPublishRequests.$inferInsert,
) {
  await clearControlPublishRequestApprovals(requestId);
  await db
    .update(controlPublishRequests)
    .set({ ...values, id: requestId })
    .where(eq(controlPublishRequests.id, requestId));
}

async function clearControlPublishRequestApprovals(requestId: string) {
  await db
    .delete(controlPublishRequestApprovals)
    .where(eq(controlPublishRequestApprovals.requestId, requestId));
}

async function updateControlPublishRequestApprovalCount(requestId: string) {
  const approvals = await db
    .select({ id: controlPublishRequestApprovals.id })
    .from(controlPublishRequestApprovals)
    .where(eq(controlPublishRequestApprovals.requestId, requestId));

  await db
    .update(controlPublishRequests)
    .set({ approvalCount: approvals.length })
    .where(eq(controlPublishRequests.id, requestId));
}

function toPublishInput(request: typeof controlPublishRequests.$inferSelect) {
  return {
    businessMeaning: request.businessMeaning,
  };
}

function toControlVersionResponse(row: {
  businessMeaning: string;
  controlCode: string;
  createdAt: Date;
  id: string;
  title: string;
  versionNumber: number;
}) {
  return {
    businessMeaning: row.businessMeaning,
    controlCode: row.controlCode,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    title: row.title,
    versionNumber: row.versionNumber,
  };
}
