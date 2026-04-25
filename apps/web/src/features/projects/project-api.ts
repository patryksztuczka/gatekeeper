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
