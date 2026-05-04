import { describe, expect, it } from 'vitest';

import {
  authorizeOrganizationAction,
  OrganizationAuthorizationError,
} from '../src/contexts/identity-organization/organization-authorization';
import { controlLibraryAuthorizationActions } from '../src/contexts/control-library/controls';
import { projectAuthorizationActions } from '../src/contexts/projects/projects';
import { db } from '../src/db/client';
import { members, organizations, users } from '../src/db/schema';

async function createUser(prefix: string) {
  const token = crypto.randomUUID();
  const user = {
    email: `${prefix}-${token}@example.com`,
    emailVerified: true,
    id: crypto.randomUUID(),
    name: `${prefix} user`,
  };

  await db.insert(users).values(user);

  return user;
}

async function createOrganizationMember(role: 'admin' | 'member' | 'owner', prefix: string) {
  const user = await createUser(prefix);
  const organization = {
    id: crypto.randomUUID(),
    name: `${prefix} Organization`,
    slug: `${prefix}-${crypto.randomUUID().slice(0, 8)}`,
  };
  const member = {
    id: crypto.randomUUID(),
    organizationId: organization.id,
    role,
    userId: user.id,
  };

  await db.insert(organizations).values(organization);
  await db.insert(members).values(member);

  return { member, organization, user };
}

describe('Organization-Scoped Authorization', () => {
  it('returns a narrow authorized Organization Member value for allowed domain actions', async () => {
    const { member, organization, user } = await createOrganizationMember('owner', 'auth-owner');

    await expect(
      authorizeOrganizationAction({
        action: projectAuthorizationActions.create,
        organizationSlug: organization.slug,
        userId: user.id,
      }),
    ).resolves.toEqual({
      id: member.id,
      organizationId: organization.id,
      organizationSlug: organization.slug,
      role: 'owner',
    });
  });

  it('uses domain-action-specific denial messages for forbidden actions', async () => {
    const { organization, user } = await createOrganizationMember('member', 'auth-member');

    await expect(
      authorizeOrganizationAction({
        action: projectAuthorizationActions.create,
        organizationSlug: organization.slug,
        userId: user.id,
      }),
    ).rejects.toMatchObject({
      message: 'Only Organization owners and admins can create Projects.',
      reason: 'forbidden',
    });
  });

  it('keeps read visibility rules explicit per domain action', async () => {
    const { organization, user } = await createOrganizationMember('member', 'auth-reader');

    await expect(
      authorizeOrganizationAction({
        action: projectAuthorizationActions.listArchived,
        organizationSlug: organization.slug,
        userId: user.id,
      }),
    ).resolves.toMatchObject({ role: 'member' });

    await expect(
      authorizeOrganizationAction({
        action: controlLibraryAuthorizationActions.listArchived,
        organizationSlug: organization.slug,
        userId: user.id,
      }),
    ).rejects.toMatchObject({
      message: 'Only Organization owners and admins can view archived Controls.',
      reason: 'forbidden',
    });
  });

  it('collapses missing Organization and non-member access', async () => {
    const { organization, user } = await createOrganizationMember('owner', 'auth-member-collapse');
    const outsider = await createUser('auth-outsider-collapse');

    await expect(
      authorizeOrganizationAction({
        action: projectAuthorizationActions.listActive,
        organizationSlug: organization.slug,
        userId: outsider.id,
      }),
    ).rejects.toBeInstanceOf(OrganizationAuthorizationError);
    await expect(
      authorizeOrganizationAction({
        action: projectAuthorizationActions.listActive,
        organizationSlug: organization.slug,
        userId: outsider.id,
      }),
    ).rejects.toMatchObject({ message: 'Organization not found', reason: 'not-found' });
    await expect(
      authorizeOrganizationAction({
        action: projectAuthorizationActions.listActive,
        organizationSlug: 'missing-organization',
        userId: user.id,
      }),
    ).rejects.toMatchObject({ message: 'Organization not found', reason: 'not-found' });
  });
});
