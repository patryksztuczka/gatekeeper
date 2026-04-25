import { describe, expect, it } from 'vitest';
import {
  buildEmailVerificationCallbackUrl,
  buildOrganizationPath,
  buildPasswordResetCallbackUrl,
  getPostLoginView,
  getVerificationCallbackState,
  slugifyOrganizationName,
  slugifyProjectName,
} from './auth-routing';

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

  it('slugifies Project names for editable Project creation slugs', () => {
    expect(slugifyProjectName('SOC 2 Readiness')).toBe('soc-2-readiness');
    expect(slugifyProjectName('Controls & Evidence')).toBe('controls-evidence');
    expect(slugifyProjectName('')).toBe('');
  });

  it('builds organization-scoped app paths', () => {
    expect(buildOrganizationPath('acme')).toBe('/acme');
    expect(buildOrganizationPath('acme', '/settings')).toBe('/acme/settings');
    expect(buildOrganizationPath('acme', 'projects')).toBe('/acme/projects');
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
