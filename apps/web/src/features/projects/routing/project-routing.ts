import { buildOrganizationPath } from '@/features/auth/routing/auth-routing';

export function buildProjectPath(organizationSlug: string, projectSlug: string): string {
  return buildOrganizationPath(organizationSlug, `/p/${projectSlug}`);
}

export function buildProjectSettingsPath(organizationSlug: string, projectSlug: string): string {
  return buildOrganizationPath(organizationSlug, `/p/${projectSlug}/settings`);
}

export function buildProjectsPath(organizationSlug: string): string {
  return buildOrganizationPath(organizationSlug, '/projects');
}

export function slugifyProjectName(value: string): string {
  const normalizedValue = Array.from(value.normalize('NFKD'))
    .filter((character) => character.charCodeAt(0) <= 0x7f)
    .join('');

  return normalizedValue
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
