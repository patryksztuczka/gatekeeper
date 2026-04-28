import { AUTH_BASE_URL } from './auth-client';

export type MembershipResolutionResponse = {
  activeOrganizationId: string | null;
  canCreateOrganization: boolean;
  organizations: Array<{
    id: string;
    memberId: string;
    name: string;
    role: string;
    slug: string;
  }>;
  pendingInvites: Array<{
    expiresAt: string;
    id: string;
    organizationId: string;
    organizationName: string;
    role: string | null;
  }>;
  status: 'active-organization' | 'needs-organization-choice' | 'needs-organization-creation';
};

export type InvitationEntryResponse = {
  action:
    | 'email-verification-required'
    | 'ready-for-authentication'
    | 'ready-to-accept'
    | 'signed-in-as-different-user'
    | 'unavailable';
  invitation: {
    email: string;
    expiresAt: string;
    id: string;
    inviterEmail: string;
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    role: string | null;
  } | null;
  status: 'accepted' | 'canceled' | 'expired' | 'invalid' | 'pending' | 'rejected';
  viewer: {
    email: string | null;
    emailVerified: boolean | null;
    isAuthenticated: boolean;
  };
};

export type ProjectListItem = {
  archivedAt: string | null;
  createdAt: string;
  description: string;
  id: string;
  name: string;
  projectOwner: {
    email: string;
    id: string;
    name: string;
  } | null;
  slug: string;
};

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

export type ChecklistTemplateItem = {
  control: {
    controlCode: string;
    id: string;
    title: string;
  };
  createdAt: string;
  displayOrder: number;
  id: string;
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
  status: 'active' | 'draft';
  unsectionedItems: ChecklistTemplateItem[];
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

export type ControlVersionResponse = {
  acceptedEvidenceTypes: string[];
  applicabilityConditions: string;
  businessMeaning: string;
  controlCode: string;
  createdAt: string;
  externalStandardsMappings: Array<{
    description?: string;
    framework: string;
    reference: string;
  }>;
  id: string;
  releaseImpact: 'advisory' | 'blocking' | 'needs review';
  title: string;
  verificationMethod: string;
  versionNumber: number;
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
  acceptedEvidenceType?: string;
  releaseImpact?: string;
  search?: string;
  standardsFramework?: string;
  status?: 'active' | 'archived';
};

export type OrganizationMemberListItem = {
  email: string;
  id: string;
  name: string;
  role: string;
};

export type ControlApprovalPolicy = {
  enabled: boolean;
  maxRequiredApprovals: number;
  requiredApprovals: number;
};

type ApiErrorBody = {
  error?:
    | {
        message?: string;
      }
    | string;
  message?: string;
};

async function request<T>(
  path: string,
  init?: RequestInit & { allowStatuses?: number[] },
): Promise<T> {
  const response = await fetch(`${AUTH_BASE_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => null)) as ApiErrorBody | T | null;
  const errorBody = typeof body === 'object' && body !== null ? (body as ApiErrorBody) : null;

  if (!response.ok && !init?.allowStatuses?.includes(response.status)) {
    const message = errorBody
      ? typeof errorBody.error === 'string'
        ? errorBody.error
        : errorBody.error?.message || errorBody.message || 'Request failed.'
      : 'Request failed.';

    throw new Error(message);
  }

  return body as T;
}

export function getMembershipResolution() {
  return request<MembershipResolutionResponse>('/api/auth/membership-resolution', {
    method: 'GET',
  });
}

export function sendVerificationEmail(input: { callbackURL?: string; email: string }) {
  return request<{ status: boolean }>('/api/auth/send-verification-email', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function requestPasswordReset(input: { email: string; redirectTo: string }) {
  return request<{ message: string; status: boolean }>('/api/auth/request-password-reset', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function resetPassword(input: { newPassword: string; token: string }) {
  return request<{ status: boolean }>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getInvitationEntry(invitationId: string) {
  return request<InvitationEntryResponse>(`/api/auth/invitations/${invitationId}`, {
    allowStatuses: [404],
    method: 'GET',
  });
}

export function createOrganizationInvitation(input: { email: string; role: string }) {
  return request<{ id: string; organizationId: string }>(`/api/auth/organization/invite-member`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function createOrganization(input: {
  keepCurrentActiveOrganization?: boolean;
  name: string;
  slug: string;
}) {
  return request<{ id: string; name: string; slug: string }>('/api/auth/organization/create', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function setActiveOrganization(input: { organizationId: string | null }) {
  return request<{ id: string; name: string; slug: string } | null>(
    '/api/auth/organization/set-active',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function acceptOrganizationInvitation(invitationId: string) {
  return request(`/api/auth/organization/accept-invitation`, {
    method: 'POST',
    body: JSON.stringify({ invitationId }),
  });
}

export function listOrganizationMembers(organizationSlug: string) {
  return request<{ members: OrganizationMemberListItem[] }>(
    `/api/organizations/${organizationSlug}/members`,
    {
      method: 'GET',
    },
  );
}

export function getControlApprovalPolicy(organizationSlug: string) {
  return request<{ policy: ControlApprovalPolicy }>(
    `/api/organizations/${organizationSlug}/control-approval-policy`,
    {
      method: 'GET',
    },
  );
}

export function updateControlApprovalPolicy(
  organizationSlug: string,
  input: { enabled: boolean; requiredApprovals: number },
) {
  return request<{ policy: ControlApprovalPolicy }>(
    `/api/organizations/${organizationSlug}/control-approval-policy`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
}

export function listProjects(organizationSlug: string, status: 'active' | 'archived' = 'active') {
  const query = status === 'archived' ? '?status=archived' : '';

  return request<{ projects: ProjectListItem[] }>(
    `/api/organizations/${organizationSlug}/projects${query}`,
    {
      method: 'GET',
    },
  );
}

export function createProject(
  organizationSlug: string,
  input: {
    description: string;
    name: string;
    projectOwnerMemberId?: string | null;
    slug: string;
  },
) {
  return request<{ project: ProjectListItem }>(`/api/organizations/${organizationSlug}/projects`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listChecklistTemplates(
  organizationSlug: string,
  filters: { search?: string; status?: 'active' | 'draft' | 'all' } = {},
) {
  const query = toQueryString({
    q: filters.search,
    status: filters.status && filters.status !== 'all' ? filters.status : undefined,
  });

  return request<{ checklistTemplates: ChecklistTemplateListItem[] }>(
    `/api/organizations/${organizationSlug}/checklist-templates${query}`,
    {
      method: 'GET',
    },
  );
}

export function createChecklistTemplate(organizationSlug: string, input: { name: string }) {
  return request<{ checklistTemplate: ChecklistTemplateListItem }>(
    `/api/organizations/${organizationSlug}/checklist-templates`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function publishChecklistTemplate(organizationSlug: string, templateId: string) {
  return request<{ checklistTemplate: ChecklistTemplateListItem }>(
    `/api/organizations/${organizationSlug}/checklist-templates/${templateId}/publish`,
    {
      method: 'POST',
    },
  );
}

export function addChecklistTemplateItem(
  organizationSlug: string,
  templateId: string,
  input: { controlId: string },
) {
  return request<{ checklistTemplate: ChecklistTemplateListItem }>(
    `/api/organizations/${organizationSlug}/checklist-templates/${templateId}/items`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function removeChecklistTemplateItem(
  organizationSlug: string,
  templateId: string,
  itemId: string,
) {
  return request<{ checklistTemplate: ChecklistTemplateListItem }>(
    `/api/organizations/${organizationSlug}/checklist-templates/${templateId}/items/${itemId}`,
    {
      method: 'DELETE',
    },
  );
}

function toQueryString(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value);
    }
  }

  const value = query.toString();

  return value ? `?${value}` : '';
}

export function listDraftControls(organizationSlug: string, search = '') {
  const query = toQueryString({ q: search });

  return request<{ draftControls: DraftControlListItem[] }>(
    `/api/organizations/${organizationSlug}/controls/drafts${query}`,
    {
      method: 'GET',
    },
  );
}

export function listControls(organizationSlug: string, filters: ControlListFilters = {}) {
  const query = toQueryString({
    acceptedEvidenceType: filters.acceptedEvidenceType,
    q: filters.search,
    releaseImpact: filters.releaseImpact,
    standardsFramework: filters.standardsFramework,
    status: filters.status,
  });

  return request<{ controls: ControlListItem[] }>(
    `/api/organizations/${organizationSlug}/controls${query}`,
    {
      method: 'GET',
    },
  );
}

export function listControlProposedUpdates(organizationSlug: string) {
  return request<{ proposedUpdates: ControlProposedUpdateListItem[] }>(
    `/api/organizations/${organizationSlug}/controls/proposed-updates`,
    {
      method: 'GET',
    },
  );
}

export function listControlPublishRequests(organizationSlug: string) {
  return request<{ publishRequests: ControlPublishRequestListItem[] }>(
    `/api/organizations/${organizationSlug}/controls/publish-requests`,
    {
      method: 'GET',
    },
  );
}

export function approveControlPublishRequest(organizationSlug: string, publishRequestId: string) {
  return request<{ publishRequest: ControlPublishRequestListItem }>(
    `/api/organizations/${organizationSlug}/controls/publish-requests/${publishRequestId}/approve`,
    {
      method: 'POST',
    },
  );
}

export function rejectControlPublishRequest(
  organizationSlug: string,
  publishRequestId: string,
  input: { comment: string },
) {
  return request<{ publishRequest: ControlPublishRequestListItem }>(
    `/api/organizations/${organizationSlug}/controls/publish-requests/${publishRequestId}/reject`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function withdrawControlPublishRequest(organizationSlug: string, publishRequestId: string) {
  return request<{ publishRequest: ControlPublishRequestListItem }>(
    `/api/organizations/${organizationSlug}/controls/publish-requests/${publishRequestId}/withdraw`,
    {
      method: 'POST',
    },
  );
}

export function publishControlPublishRequest(organizationSlug: string, publishRequestId: string) {
  return request<{ control: ControlListItem }>(
    `/api/organizations/${organizationSlug}/controls/publish-requests/${publishRequestId}/publish`,
    {
      method: 'POST',
    },
  );
}

export function createDraftControl(
  organizationSlug: string,
  input: {
    controlCode: string;
    title: string;
  },
) {
  return request<{ draftControl: DraftControlListItem }>(
    `/api/organizations/${organizationSlug}/controls/drafts`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function publishDraftControl(
  organizationSlug: string,
  draftControlId: string,
  input: {
    acceptedEvidenceTypes: string[];
    applicabilityConditions: string;
    businessMeaning: string;
    releaseImpact: string;
    verificationMethod: string;
  },
) {
  return request<{ control: ControlListItem }>(
    `/api/organizations/${organizationSlug}/controls/drafts/${draftControlId}/publish`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function submitDraftControlPublishRequest(
  organizationSlug: string,
  draftControlId: string,
  input: {
    acceptedEvidenceTypes: string[];
    applicabilityConditions: string;
    businessMeaning: string;
    releaseImpact: string;
    verificationMethod: string;
  },
) {
  return request<{ publishRequest: ControlPublishRequestListItem }>(
    `/api/organizations/${organizationSlug}/controls/drafts/${draftControlId}/publish-requests`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function cancelDraftControl(organizationSlug: string, draftControlId: string) {
  return request<{ canceled: boolean }>(
    `/api/organizations/${organizationSlug}/controls/drafts/${draftControlId}`,
    {
      method: 'DELETE',
    },
  );
}

export function createControlProposedUpdate(
  organizationSlug: string,
  controlId: string,
  input: {
    acceptedEvidenceTypes: string[];
    applicabilityConditions: string;
    businessMeaning: string;
    controlCode: string;
    releaseImpact: string;
    title: string;
    verificationMethod: string;
  },
) {
  return request<{ proposedUpdate: ControlProposedUpdateListItem }>(
    `/api/organizations/${organizationSlug}/controls/${controlId}/proposed-updates`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function archiveControl(
  organizationSlug: string,
  controlId: string,
  input: { reason?: string } = {},
) {
  return request<{ control: ControlListItem }>(
    `/api/organizations/${organizationSlug}/controls/${controlId}/archive`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
}

export function restoreControl(organizationSlug: string, controlId: string) {
  return request<{ control: ControlListItem }>(
    `/api/organizations/${organizationSlug}/controls/${controlId}/restore`,
    {
      method: 'PATCH',
    },
  );
}

export function publishControlProposedUpdate(
  organizationSlug: string,
  controlId: string,
  proposedUpdateId: string,
) {
  return request<{ control: ControlListItem }>(
    `/api/organizations/${organizationSlug}/controls/${controlId}/proposed-updates/${proposedUpdateId}/publish`,
    {
      method: 'POST',
    },
  );
}

export function submitControlProposedUpdatePublishRequest(
  organizationSlug: string,
  controlId: string,
  proposedUpdateId: string,
) {
  return request<{ publishRequest: ControlPublishRequestListItem }>(
    `/api/organizations/${organizationSlug}/controls/${controlId}/proposed-updates/${proposedUpdateId}/publish-requests`,
    {
      method: 'POST',
    },
  );
}
