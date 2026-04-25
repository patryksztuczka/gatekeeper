import { AUTH_BASE_URL } from '../auth/auth-client';

export type ProjectDetail = {
  id: string;
  name: string;
  description: string;
  slug: string;
  archivedAt: string | null;
  createdAt: string;
  projectOwner: {
    email: string;
    id: string;
    name: string;
    role: string;
  } | null;
};

export type ProjectDetailResult =
  | { status: 'available'; project: ProjectDetail }
  | { status: 'unavailable' };

export async function getProjectDetail(input: {
  organizationSlug: string;
  projectSlug: string;
}): Promise<ProjectDetailResult> {
  const response = await fetch(
    `${AUTH_BASE_URL}/api/organizations/${input.organizationSlug}/projects/${input.projectSlug}`,
    {
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: 'GET',
    },
  );

  if (response.status === 404) {
    return { status: 'unavailable' };
  }

  if (!response.ok) {
    throw new Error('Unable to load Project.');
  }

  const body = (await response.json()) as { project: ProjectDetail };
  return { status: 'available', project: body.project };
}

export async function updateProjectSettings(input: {
  description: string;
  name: string;
  organizationSlug: string;
  projectOwnerMemberId: string | null;
  projectSlug: string;
}): Promise<ProjectDetail> {
  const response = await fetch(
    `${AUTH_BASE_URL}/api/organizations/${input.organizationSlug}/projects/${input.projectSlug}`,
    {
      body: JSON.stringify({
        description: input.description,
        name: input.name,
        projectOwnerMemberId: input.projectOwnerMemberId,
      }),
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    },
  );
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    project?: ProjectDetail;
  } | null;

  if (!response.ok) {
    throw new Error(body?.error ?? 'Unable to update Project.');
  }

  if (!body?.project) {
    throw new Error('Unable to update Project.');
  }

  return body.project;
}

export async function archiveProject(input: {
  organizationSlug: string;
  projectSlug: string;
}): Promise<ProjectDetail> {
  return setProjectArchived(input, 'archive');
}

export async function restoreProject(input: {
  organizationSlug: string;
  projectSlug: string;
}): Promise<ProjectDetail> {
  return setProjectArchived(input, 'restore');
}

async function setProjectArchived(
  input: { organizationSlug: string; projectSlug: string },
  action: 'archive' | 'restore',
): Promise<ProjectDetail> {
  const response = await fetch(
    `${AUTH_BASE_URL}/api/organizations/${input.organizationSlug}/projects/${input.projectSlug}/${action}`,
    {
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    },
  );
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    project?: ProjectDetail;
  } | null;

  if (!response.ok) {
    throw new Error(body?.error ?? `Unable to ${action} Project.`);
  }

  if (!body?.project) {
    throw new Error(`Unable to ${action} Project.`);
  }

  return body.project;
}
