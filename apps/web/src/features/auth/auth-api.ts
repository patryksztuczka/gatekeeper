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
