import { AUTH_BASE_URL } from './auth-client';

export type MembershipResolutionResponse = {
  activeOrganizationId: string | null;
  canCreateOrganization: boolean;
  organizations: Array<{
    id: string;
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

export type ControlListItem = {
  archivedAt: string | null;
  archiveReason: string | null;
  controlCode: string;
  createdAt: string;
  currentVersion: {
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
  id: string;
  title: string;
};

export type OrganizationMemberListItem = {
  email: string;
  id: string;
  name: string;
  role: string;
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

export function listDraftControls(organizationSlug: string) {
  return request<{ draftControls: DraftControlListItem[] }>(
    `/api/organizations/${organizationSlug}/controls/drafts`,
    {
      method: 'GET',
    },
  );
}

export function listControls(organizationSlug: string, status: 'active' | 'archived' = 'active') {
  const query = status === 'archived' ? '?status=archived' : '';

  return request<{ controls: ControlListItem[] }>(
    `/api/organizations/${organizationSlug}/controls${query}`,
    {
      method: 'GET',
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

export function cancelDraftControl(organizationSlug: string, draftControlId: string) {
  return request<{ canceled: boolean }>(
    `/api/organizations/${organizationSlug}/controls/drafts/${draftControlId}`,
    {
      method: 'DELETE',
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
