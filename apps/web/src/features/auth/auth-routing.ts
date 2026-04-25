import type { MembershipResolutionResponse } from './auth-api';

export type PostLoginView = 'app' | 'organization-choice' | 'organization-creation';

export type VerificationCallbackState = 'expired' | 'invalid' | 'success';

export function getPostLoginView(resolution: MembershipResolutionResponse): PostLoginView {
  switch (resolution.status) {
    case 'active-organization':
      return 'app';
    case 'needs-organization-choice':
      return 'organization-choice';
    case 'needs-organization-creation':
      return 'organization-creation';
  }
}

export function getVerificationCallbackState(error: string | null): VerificationCallbackState {
  if (!error) {
    return 'success';
  }

  if (error === 'TOKEN_EXPIRED') {
    return 'expired';
  }

  return 'invalid';
}

export function slugifyOrganizationName(value: string): string {
  const normalizedValue = Array.from(value.normalize('NFKD'))
    .filter((character) => character.charCodeAt(0) <= 0x7f)
    .join('');

  return normalizedValue
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function buildOrganizationPath(organizationSlug: string, path = '/'): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `/${organizationSlug}${normalizedPath === '/' ? '' : normalizedPath}`;
}

const STATIC_ORGANIZATION_PATHS = new Set([
  '/',
  '/settings',
  '/projects',
  '/controls',
  '/checklists',
  '/exceptions',
  '/audit',
]);

export function buildOrganizationSwitchPath(input: {
  currentPathname: string;
  currentOrganizationSlug: string | null;
  nextOrganizationSlug: string;
}): string {
  const { currentPathname, currentOrganizationSlug, nextOrganizationSlug } = input;

  if (!currentOrganizationSlug) {
    return buildOrganizationPath(nextOrganizationSlug);
  }

  const organizationPathPrefix = `/${currentOrganizationSlug}`;

  if (
    currentPathname !== organizationPathPrefix &&
    !currentPathname.startsWith(`${organizationPathPrefix}/`)
  ) {
    return buildOrganizationPath(nextOrganizationSlug);
  }

  const pathWithinOrganization = currentPathname.slice(organizationPathPrefix.length) || '/';

  if (!STATIC_ORGANIZATION_PATHS.has(pathWithinOrganization)) {
    return buildOrganizationPath(nextOrganizationSlug);
  }

  return buildOrganizationPath(nextOrganizationSlug, pathWithinOrganization);
}

export function buildEmailVerificationCallbackUrl(input: {
  email: string;
  origin: string;
  redirectTo: string;
}): string {
  const url = new URL('/verify-email/callback', input.origin);
  url.searchParams.set('email', input.email);
  url.searchParams.set('redirectTo', input.redirectTo);
  return url.toString();
}

export function buildPasswordResetCallbackUrl(origin: string): string {
  return new URL('/reset-password', origin).toString();
}

export function buildSignInLink(redirectTo: string, email?: string): string {
  const searchParams = new URLSearchParams({ redirectTo });

  if (email) {
    searchParams.set('email', email);
  }

  return `/sign-in?${searchParams.toString()}`;
}

export function buildSignUpLink(redirectTo: string, email?: string): string {
  const searchParams = new URLSearchParams({ redirectTo });

  if (email) {
    searchParams.set('email', email);
  }

  return `/sign-up?${searchParams.toString()}`;
}

export function buildVerifyEmailLink(email: string, redirectTo: string): string {
  const searchParams = new URLSearchParams({ email, redirectTo });
  return `/verify-email?${searchParams.toString()}`;
}
