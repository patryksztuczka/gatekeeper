import { buildOrganizationPath } from '../auth/auth-routing';

export function buildProjectPath(organizationSlug: string, projectSlug: string): string {
  return buildOrganizationPath(organizationSlug, `/p/${projectSlug}`);
}

export function buildProjectsPath(organizationSlug: string): string {
  return buildOrganizationPath(organizationSlug, '/projects');
}
