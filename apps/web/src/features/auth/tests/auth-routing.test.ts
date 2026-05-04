import { describe, expect, it } from 'vitest';
import {
  buildEmailVerificationCallbackUrl,
  buildOrganizationPath,
  buildOrganizationSwitchPath,
  buildPasswordResetCallbackUrl,
  generateOrganizationSlug,
  getPostLoginView,
  getVerificationCallbackState,
  isReservedOrganizationSlug,
  slugifyOrganizationName,
} from '@/features/auth/routing/auth-routing';

describe('auth routing helpers', () => {
  it('maps membership-resolution statuses to frontend views', () => {
    expect(
      getPostLoginView({
        activeOrganizationId: 'org-1',
        canCreateOrganization: true,
        organizations: [],
        pendingInvites: [],
        status: 'active-organization',
      }),
    ).toBe('app');

    expect(
      getPostLoginView({
        activeOrganizationId: null,
        canCreateOrganization: true,
        organizations: [],
        pendingInvites: [],
        status: 'needs-organization-choice',
      }),
    ).toBe('organization-choice');

    expect(
      getPostLoginView({
        activeOrganizationId: null,
        canCreateOrganization: true,
        organizations: [],
        pendingInvites: [],
        status: 'needs-organization-creation',
      }),
    ).toBe('organization-creation');
  });

  it('maps verification callback errors to the correct state', () => {
    expect(getVerificationCallbackState(null)).toBe('success');
    expect(getVerificationCallbackState('TOKEN_EXPIRED')).toBe('expired');
    expect(getVerificationCallbackState('INVALID_TOKEN')).toBe('invalid');
  });

  it('slugifies organization names like the backend', () => {
    expect(slugifyOrganizationName('My Workspace')).toBe('my-workspace');
    expect(slugifyOrganizationName('Zolc Team ++')).toBe('zolc-team');
    expect(slugifyOrganizationName('')).toBe('');
  });

  it('identifies organization slugs reserved by public routes', () => {
    expect(isReservedOrganizationSlug('sign-in')).toBe(true);
    expect(isReservedOrganizationSlug('verify-email')).toBe(true);
    expect(isReservedOrganizationSlug('my-workspace')).toBe(false);
  });

  it('avoids reserved route words when generating organization slugs', () => {
    expect(generateOrganizationSlug('Sign In')).toBe('sign-in-organization');
    expect(generateOrganizationSlug('My Workspace')).toBe('my-workspace');
  });

  it('builds organization-scoped app paths', () => {
    expect(buildOrganizationPath('acme')).toBe('/acme');
    expect(buildOrganizationPath('acme', '/settings')).toBe('/acme/settings');
    expect(buildOrganizationPath('acme', 'projects')).toBe('/acme/projects');
  });

  it('preserves static organization-scoped paths when switching organizations', () => {
    expect(
      buildOrganizationSwitchPath({
        currentOrganizationSlug: 'acme',
        currentPathname: '/acme',
        nextOrganizationSlug: 'globex',
      }),
    ).toBe('/globex');
    expect(
      buildOrganizationSwitchPath({
        currentOrganizationSlug: 'acme',
        currentPathname: '/acme/settings',
        nextOrganizationSlug: 'globex',
      }),
    ).toBe('/globex/settings');
    expect(
      buildOrganizationSwitchPath({
        currentOrganizationSlug: 'acme',
        currentPathname: '/acme/projects',
        nextOrganizationSlug: 'globex',
      }),
    ).toBe('/globex/projects');
    expect(
      buildOrganizationSwitchPath({
        currentOrganizationSlug: 'acme',
        currentPathname: '/acme/controls',
        nextOrganizationSlug: 'globex',
      }),
    ).toBe('/globex/controls');
    expect(
      buildOrganizationSwitchPath({
        currentOrganizationSlug: 'acme',
        currentPathname: '/acme/checklists',
        nextOrganizationSlug: 'globex',
      }),
    ).toBe('/globex/checklists');
    expect(
      buildOrganizationSwitchPath({
        currentOrganizationSlug: 'acme',
        currentPathname: '/acme/exceptions',
        nextOrganizationSlug: 'globex',
      }),
    ).toBe('/globex/exceptions');
    expect(
      buildOrganizationSwitchPath({
        currentOrganizationSlug: 'acme',
        currentPathname: '/acme/audit',
        nextOrganizationSlug: 'globex',
      }),
    ).toBe('/globex/audit');
  });

  it('redirects dynamic or non-organization paths to the selected organization home', () => {
    expect(
      buildOrganizationSwitchPath({
        currentOrganizationSlug: 'acme',
        currentPathname: '/acme/p/my-project',
        nextOrganizationSlug: 'globex',
      }),
    ).toBe('/globex');
    expect(
      buildOrganizationSwitchPath({
        currentOrganizationSlug: 'acme',
        currentPathname: '/settings',
        nextOrganizationSlug: 'globex',
      }),
    ).toBe('/globex');
    expect(
      buildOrganizationSwitchPath({
        currentOrganizationSlug: null,
        currentPathname: '/',
        nextOrganizationSlug: 'globex',
      }),
    ).toBe('/globex');
  });

  it('builds callback urls for verification and password reset', () => {
    expect(
      buildEmailVerificationCallbackUrl({
        email: 'person@example.com',
        origin: 'http://localhost:5173',
        redirectTo: '/invite/123',
      }),
    ).toBe(
      'http://localhost:5173/verify-email/callback?email=person%40example.com&redirectTo=%2Finvite%2F123',
    );

    expect(buildPasswordResetCallbackUrl('http://localhost:5173')).toBe(
      'http://localhost:5173/reset-password',
    );
  });
});
