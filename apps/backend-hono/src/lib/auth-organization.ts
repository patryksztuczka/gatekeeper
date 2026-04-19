import { getOrgAdapter, type OrganizationOptions } from 'better-auth/plugins';

type OrganizationAuthContext = Parameters<typeof getOrgAdapter>[0];

type AuthUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  image?: string | null;
};

export type SignUpOrganizationMode = 'direct-signup' | 'invite-signup';

const defaultOrganizationNameSuffix = ' Organization';
const fallbackOrganizationName = 'Workspace';
const maxSlugSuffixAttempts = 100;

// Gatekeeper maps product concepts onto Better Auth's organization plugin:
// - account => Better Auth user
// - organization => Better Auth organization
// - membership => Better Auth member
// - invite => Better Auth invitation
//
// Lifecycle rules:
// - direct sign-up: create a default organization for the new user
// - invite sign-up: skip default organization creation when the email has pending invites
// - new session: initialize the active organization from the user's memberships, if any exist
export const gatekeeperOrganizationOptions: OrganizationOptions = {
  allowUserToCreateOrganization: true,
};

export async function resolveSignUpOrganizationMode(
  authContext: OrganizationAuthContext,
  email: string,
): Promise<SignUpOrganizationMode> {
  const pendingInvitations = await getPendingInvitations(authContext, email);

  return pendingInvitations.length > 0 ? 'invite-signup' : 'direct-signup';
}

export async function ensureDefaultOrganizationForUser(
  authContext: OrganizationAuthContext,
  user: AuthUser,
): Promise<void> {
  const adapter = getOrgAdapter(authContext, gatekeeperOrganizationOptions);
  const existingOrganizations = await adapter.listOrganizations(user.id);

  if (existingOrganizations.length > 0) {
    return;
  }

  let organizationData = {
    name: getDefaultOrganizationName(user),
    slug: await getUniqueDefaultOrganizationSlug(authContext, user),
    createdAt: new Date(),
  };

  const beforeCreateOrganization =
    gatekeeperOrganizationOptions.organizationHooks?.beforeCreateOrganization;

  if (beforeCreateOrganization) {
    const response = await beforeCreateOrganization({
      organization: organizationData,
      user,
    });

    if (response?.data) {
      organizationData = {
        ...organizationData,
        ...response.data,
      };
    }
  }

  const organization = await adapter.createOrganization({
    organization: organizationData,
  });

  let memberData = {
    organizationId: organization.id,
    userId: user.id,
    role: gatekeeperOrganizationOptions.creatorRole ?? 'owner',
    createdAt: new Date(),
  };

  const beforeAddMember = gatekeeperOrganizationOptions.organizationHooks?.beforeAddMember;

  if (beforeAddMember) {
    const response = await beforeAddMember({
      member: memberData,
      organization,
      user,
    });

    if (response?.data) {
      memberData = {
        ...memberData,
        ...response.data,
      };
    }
  }

  const member = await adapter.createMember(memberData);

  const afterAddMember = gatekeeperOrganizationOptions.organizationHooks?.afterAddMember;
  if (afterAddMember) {
    await afterAddMember({ member, organization, user });
  }

  const afterCreateOrganization =
    gatekeeperOrganizationOptions.organizationHooks?.afterCreateOrganization;
  if (afterCreateOrganization) {
    await afterCreateOrganization({ member, organization, user });
  }
}

export async function getInitialActiveOrganizationId(
  authContext: OrganizationAuthContext,
  userId: string,
): Promise<string | null> {
  const organizations = await getOrgAdapter(
    authContext,
    gatekeeperOrganizationOptions,
  ).listOrganizations(userId);

  return organizations[0]?.id ?? null;
}

export async function shouldCreateDefaultOrganization(
  authContext: OrganizationAuthContext,
  email: string,
): Promise<boolean> {
  return (await resolveSignUpOrganizationMode(authContext, email)) === 'direct-signup';
}

export function isEmailPasswordSignUp(context: { path?: string } | null): boolean {
  return context?.path === '/sign-up/email';
}

async function getPendingInvitations(authContext: OrganizationAuthContext, email: string) {
  const invitations = await getOrgAdapter(
    authContext,
    gatekeeperOrganizationOptions,
  ).listUserInvitations(email.toLowerCase());
  const now = new Date();

  return invitations.filter(
    (invitation) => invitation.status === 'pending' && invitation.expiresAt > now,
  );
}

function getDefaultOrganizationName(user: AuthUser): string {
  const preferredName = user.name.trim() || user.email.split('@')[0] || fallbackOrganizationName;

  return `${preferredName}${defaultOrganizationNameSuffix}`;
}

async function getUniqueDefaultOrganizationSlug(
  authContext: OrganizationAuthContext,
  user: AuthUser,
): Promise<string> {
  const adapter = getOrgAdapter(authContext, gatekeeperOrganizationOptions);
  const emailLocalPart = user.email.split('@')[0] ?? '';
  const baseSlug = slugify(user.name) || slugify(emailLocalPart) || 'workspace';

  for (let attempt = 0; attempt < maxSlugSuffixAttempts; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;

    if (!(await adapter.findOrganizationBySlug(slug))) {
      return slug;
    }
  }

  return `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;
}

function slugify(value: string): string {
  const normalizedValue = Array.from(value.normalize('NFKD'))
    .filter((character) => character.charCodeAt(0) <= 0x7f)
    .join('');

  return normalizedValue
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}
