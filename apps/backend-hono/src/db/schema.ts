import {
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).default(false).notNull(),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

export type User = typeof users.$inferSelect;

export const organizations = sqliteTable(
  'organizations',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    logo: text('logo'),
    metadata: text('metadata'),
    controlApprovalPolicyEnabled: integer('control_approval_policy_enabled', { mode: 'boolean' })
      .default(false)
      .notNull(),
    controlApprovalRequiredCount: integer('control_approval_required_count').default(1).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [index('organization_slug_idx').on(table.slug)],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
    activeOrganizationId: text('active_organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('session_user_id_idx').on(table.userId),
    index('session_active_organization_id_idx').on(table.activeOrganizationId),
  ],
);

export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('account_user_id_idx').on(table.userId)],
);

export const verifications = sqliteTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

export const members = sqliteTable(
  'members',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index('member_organization_id_idx').on(table.organizationId),
    index('member_user_id_idx').on(table.userId),
    uniqueIndex('member_organization_user_unique').on(table.organizationId, table.userId),
  ],
);

export const invitations = sqliteTable(
  'invitations',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role'),
    status: text('status').notNull().default('pending'),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    inviterId: text('inviter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('invitation_organization_id_idx').on(table.organizationId),
    index('invitation_email_idx').on(table.email),
    index('invitation_inviter_id_idx').on(table.inviterId),
  ],
);

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull(),
    slug: text('slug').notNull(),
    projectOwnerMemberId: text('project_owner_member_id').references(() => members.id, {
      onDelete: 'set null',
    }),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('project_organization_id_idx').on(table.organizationId),
    index('project_owner_member_id_idx').on(table.projectOwnerMemberId),
    uniqueIndex('project_organization_slug_unique').on(table.organizationId, table.slug),
  ],
);

export const draftControls = sqliteTable(
  'draft_controls',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    authorMemberId: text('author_member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    controlCode: text('control_code').notNull(),
    title: text('title').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('draft_control_organization_id_idx').on(table.organizationId),
    index('draft_control_author_member_id_idx').on(table.authorMemberId),
    uniqueIndex('draft_control_organization_code_unique').on(
      table.organizationId,
      table.controlCode,
    ),
  ],
);

export const controlCodeReservations = sqliteTable(
  'control_code_reservations',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    controlCode: text('control_code').notNull(),
    sequenceNumber: integer('sequence_number').notNull(),
    reservedByDraftControlId: text('reserved_by_draft_control_id'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index('control_code_reservation_organization_id_idx').on(table.organizationId),
    uniqueIndex('control_code_reservation_organization_code_unique').on(
      table.organizationId,
      table.controlCode,
    ),
    uniqueIndex('control_code_reservation_organization_sequence_unique').on(
      table.organizationId,
      table.sequenceNumber,
    ),
  ],
);

export const controls = sqliteTable(
  'controls',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    currentVersionId: text('current_version_id'),
    currentControlCode: text('current_control_code').notNull(),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    archivedByMemberId: text('archived_by_member_id').references(() => members.id, {
      onDelete: 'set null',
    }),
    archiveReason: text('archive_reason'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('control_organization_id_idx').on(table.organizationId),
    index('control_archived_by_member_id_idx').on(table.archivedByMemberId),
    uniqueIndex('control_organization_code_unique').on(
      table.organizationId,
      table.currentControlCode,
    ),
  ],
);

export const controlVersions = sqliteTable(
  'control_versions',
  {
    id: text('id').primaryKey(),
    controlId: text('control_id')
      .notNull()
      .references(() => controls.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    controlCode: text('control_code').notNull(),
    title: text('title').notNull(),
    businessMeaning: text('business_meaning').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index('control_version_control_id_idx').on(table.controlId),
    uniqueIndex('control_version_control_id_id_unique').on(table.controlId, table.id),
    uniqueIndex('control_version_number_unique').on(table.controlId, table.versionNumber),
  ],
);

export const checklistTemplates = sqliteTable(
  'checklist_templates',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('checklist_template_organization_id_idx').on(table.organizationId),
    index('checklist_template_archived_at_idx').on(table.archivedAt),
    uniqueIndex('checklist_template_active_name_unique')
      .on(table.organizationId, table.name)
      .where(sql`${table.archivedAt} is null`),
  ],
);

export const checklistTemplateControls = sqliteTable(
  'checklist_template_controls',
  {
    id: text('id').primaryKey(),
    checklistTemplateId: text('checklist_template_id')
      .notNull()
      .references(() => checklistTemplates.id, { onDelete: 'cascade' }),
    controlId: text('control_id')
      .notNull()
      .references(() => controls.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index('checklist_template_control_template_id_idx').on(table.checklistTemplateId),
    index('checklist_template_control_control_id_idx').on(table.controlId),
    uniqueIndex('checklist_template_control_unique').on(table.checklistTemplateId, table.controlId),
  ],
);

export const projectChecklists = sqliteTable(
  'project_checklists',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    sourceChecklistTemplateId: text('source_checklist_template_id').references(
      () => checklistTemplates.id,
      { onDelete: 'set null' },
    ),
    name: text('name').notNull(),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('project_checklist_project_id_idx').on(table.projectId),
    index('project_checklist_source_template_id_idx').on(table.sourceChecklistTemplateId),
    index('project_checklist_archived_at_idx').on(table.archivedAt),
    uniqueIndex('project_checklist_active_name_unique')
      .on(table.projectId, table.name)
      .where(sql`${table.archivedAt} is null`),
  ],
);

export const checklistItems = sqliteTable(
  'checklist_items',
  {
    id: text('id').primaryKey(),
    projectChecklistId: text('project_checklist_id')
      .notNull()
      .references(() => projectChecklists.id, { onDelete: 'cascade' }),
    controlId: text('control_id')
      .notNull()
      .references(() => controls.id, { onDelete: 'cascade' }),
    controlVersionId: text('control_version_id')
      .notNull()
      .references(() => controlVersions.id, { onDelete: 'cascade' }),
    checked: integer('checked', { mode: 'boolean' }).default(false).notNull(),
    status: text('status').default('active').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('checklist_item_project_checklist_id_idx').on(table.projectChecklistId),
    index('checklist_item_control_id_idx').on(table.controlId),
    index('checklist_item_control_version_id_idx').on(table.controlVersionId),
    index('checklist_item_status_idx').on(table.status),
    foreignKey({
      columns: [table.controlId, table.controlVersionId],
      foreignColumns: [controlVersions.controlId, controlVersions.id],
      name: 'checklist_item_control_version_control_fk',
    }).onDelete('cascade'),
    uniqueIndex('checklist_item_active_control_unique')
      .on(table.projectChecklistId, table.controlId)
      .where(sql`${table.status} = 'active'`),
  ],
);

export const controlProposedUpdates = sqliteTable(
  'control_proposed_updates',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    controlId: text('control_id')
      .notNull()
      .references(() => controls.id, { onDelete: 'cascade' }),
    authorMemberId: text('author_member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    businessMeaning: text('business_meaning').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('control_proposed_update_organization_id_idx').on(table.organizationId),
    index('control_proposed_update_author_member_id_idx').on(table.authorMemberId),
    uniqueIndex('control_proposed_update_control_id_unique').on(table.controlId),
  ],
);

export const controlPublishRequests = sqliteTable(
  'control_publish_requests',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    authorMemberId: text('author_member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    requestType: text('request_type').notNull(),
    draftControlId: text('draft_control_id').references(() => draftControls.id, {
      onDelete: 'cascade',
    }),
    controlId: text('control_id').references(() => controls.id, { onDelete: 'cascade' }),
    proposedUpdateId: text('proposed_update_id').references(() => controlProposedUpdates.id, {
      onDelete: 'cascade',
    }),
    controlCode: text('control_code').notNull(),
    title: text('title').notNull(),
    businessMeaning: text('business_meaning').notNull(),
    approvalCount: integer('approval_count').default(0).notNull(),
    requiredApprovalCount: integer('required_approval_count').notNull(),
    rejectionComment: text('rejection_comment'),
    status: text('status').default('submitted').notNull(),
    submittedAt: integer('submitted_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index('control_publish_request_organization_id_idx').on(table.organizationId),
    index('control_publish_request_author_member_id_idx').on(table.authorMemberId),
    uniqueIndex('control_publish_request_draft_unique').on(table.draftControlId),
    uniqueIndex('control_publish_request_proposed_update_unique').on(table.proposedUpdateId),
  ],
);

export const controlPublishRequestApprovals = sqliteTable(
  'control_publish_request_approvals',
  {
    id: text('id').primaryKey(),
    requestId: text('request_id')
      .notNull()
      .references(() => controlPublishRequests.id, { onDelete: 'cascade' }),
    approverMemberId: text('approver_member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index('control_publish_request_approval_request_id_idx').on(table.requestId),
    uniqueIndex('control_publish_request_approval_member_unique').on(
      table.requestId,
      table.approverMemberId,
    ),
  ],
);
