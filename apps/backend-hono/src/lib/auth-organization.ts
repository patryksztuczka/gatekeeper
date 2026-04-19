import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { getOrgAdapter, type OrganizationOptions } from 'better-auth/plugins';
import { db } from '../db/client';
import {
  invitations,
  members,
  organizations,
  sessions,
  users,
  type User as AuthUser,
} from '../db/schema';

type OrganizationAuthContext = Parameters<typeof getOrgAdapter>[0];

export type SignUpOrganizationMode = 'direct-signup' | 'invite-signup';

export type MembershipResolutionStatus =
  | 'active-organization'
  | 'needs-organization-choice'
  | 'needs-organization-creation';

export type MembershipResolutionResponse = {
  status: MembershipResolutionStatus;
  activeOrganizationId: string | null;
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    role: string;
  }>;
  pendingInvites: Array<{
    id: string;
    organizationId: string;
    organizationName: string;
    role: string | null;
    expiresAt: string;
  }>;
  canCreateOrganization: boolean;
};

export type InvitationEntryStatus =
  | 'accepted'
  | 'canceled'
  | 'expired'
  | 'invalid'
  | 'pending'
  | 'rejected';

export type InvitationEntryAction =
  | 'email-verification-required'
  | 'ready-for-authentication'
  | 'ready-to-accept'
  | 'signed-in-as-different-user'
  | 'unavailable';

export type InvitationEntryResponse = {
  status: InvitationEntryStatus;
  action: InvitationEntryAction;
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
  viewer: {
    email: string | null;
    emailVerified: boolean | null;
    isAuthenticated: boolean;
  };
};

type MembershipOrganization = MembershipResolutionResponse['organizations'][number] & {
  membershipCreatedAt: Date;
};

type PendingInvite = Omit<MembershipResolutionResponse['pendingInvites'][number], 'expiresAt'> & {
  createdAt: Date;
  expiresAt: Date;
};

type InvitationEntryViewer = {
  email: string;
  emailVerified: boolean;
} | null;

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

export async function getInitialActiveOrganizationId(userId: string): Promise<string | null> {
  return (await listMembershipOrganizations(userId))[0]?.id ?? null;
}

export async function resolveMembershipResolution({
  currentActiveOrganizationId,
  sessionId,
  userEmail,
  userId,
}: {
  currentActiveOrganizationId: string | null;
  sessionId: string;
  userEmail: string;
  userId: string;
}): Promise<MembershipResolutionResponse> {
  const [membershipOrganizations, pendingInvites] = await Promise.all([
    listMembershipOrganizations(userId),
    listPendingInvites(userEmail),
  ]);
  const resolvedActiveOrganizationId = resolveActiveOrganizationId(
    currentActiveOrganizationId,
    membershipOrganizations,
  );

  if (resolvedActiveOrganizationId !== currentActiveOrganizationId) {
    await db
      .update(sessions)
      .set({ activeOrganizationId: resolvedActiveOrganizationId })
      .where(eq(sessions.id, sessionId));
  }

  return {
    status: getMembershipResolutionStatus(resolvedActiveOrganizationId, pendingInvites),
    activeOrganizationId: resolvedActiveOrganizationId,
    organizations: orderMembershipOrganizations(
      membershipOrganizations,
      resolvedActiveOrganizationId,
    ).map(({ id, membershipCreatedAt: _membershipCreatedAt, name, role, slug }) => ({
      id,
      name,
      role,
      slug,
    })),
    pendingInvites: pendingInvites.map(({ createdAt: _createdAt, expiresAt, ...invite }) => ({
      ...invite,
      expiresAt: expiresAt.toISOString(),
    })),
    canCreateOrganization: true,
  };
}

export async function resolveInvitationEntryState(
  invitationId: string,
  viewer: InvitationEntryViewer,
): Promise<InvitationEntryResponse> {
  const invitation = await db
    .select({
      email: invitations.email,
      expiresAt: invitations.expiresAt,
      id: invitations.id,
      inviterEmail: users.email,
      organizationId: invitations.organizationId,
      organizationName: organizations.name,
      organizationSlug: organizations.slug,
      role: invitations.role,
      status: invitations.status,
    })
    .from(invitations)
    .innerJoin(organizations, eq(invitations.organizationId, organizations.id))
    .innerJoin(users, eq(invitations.inviterId, users.id))
    .where(eq(invitations.id, invitationId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  const viewerState = {
    email: viewer?.email ?? null,
    emailVerified: viewer?.emailVerified ?? null,
    isAuthenticated: viewer !== null,
  };

  if (!invitation) {
    return {
      action: 'unavailable',
      invitation: null,
      status: 'invalid',
      viewer: viewerState,
    };
  }

  const status = getInvitationEntryStatus(invitation.expiresAt, invitation.status);

  return {
    action: getInvitationEntryAction(status, invitation.email, viewer),
    invitation: {
      email: invitation.email,
      expiresAt: invitation.expiresAt.toISOString(),
      id: invitation.id,
      inviterEmail: invitation.inviterEmail,
      organizationId: invitation.organizationId,
      organizationName: invitation.organizationName,
      organizationSlug: invitation.organizationSlug,
      role: invitation.role,
    },
    status,
    viewer: viewerState,
  };
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
  const pendingInvitations = await getOrgAdapter(
    authContext,
    gatekeeperOrganizationOptions,
  ).listUserInvitations(email.toLowerCase());
  const now = new Date();

  return pendingInvitations.filter(
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

async function listMembershipOrganizations(userId: string): Promise<MembershipOrganization[]> {
  return db
    .select({
      id: organizations.id,
      membershipCreatedAt: members.createdAt,
      name: organizations.name,
      role: members.role,
      slug: organizations.slug,
    })
    .from(members)
    .innerJoin(organizations, eq(members.organizationId, organizations.id))
    .where(eq(members.userId, userId))
    .orderBy(asc(members.createdAt), asc(members.organizationId));
}

async function listPendingInvites(userEmail: string): Promise<PendingInvite[]> {
  const normalizedEmail = userEmail.toLowerCase();

  return db
    .select({
      createdAt: invitations.createdAt,
      expiresAt: invitations.expiresAt,
      id: invitations.id,
      organizationId: invitations.organizationId,
      organizationName: organizations.name,
      role: invitations.role,
    })
    .from(invitations)
    .innerJoin(organizations, eq(invitations.organizationId, organizations.id))
    .where(
      and(
        eq(sql<string>`lower(${invitations.email})`, normalizedEmail),
        eq(invitations.status, 'pending'),
        gt(invitations.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(invitations.expiresAt), asc(invitations.createdAt));
}

function resolveActiveOrganizationId(
  currentActiveOrganizationId: string | null,
  membershipOrganizations: MembershipOrganization[],
): string | null {
  if (
    currentActiveOrganizationId &&
    membershipOrganizations.some(({ id }) => id === currentActiveOrganizationId)
  ) {
    return currentActiveOrganizationId;
  }

  return membershipOrganizations[0]?.id ?? null;
}

function getMembershipResolutionStatus(
  activeOrganizationId: string | null,
  pendingInvites: PendingInvite[],
): MembershipResolutionStatus {
  if (activeOrganizationId) {
    return 'active-organization';
  }

  if (pendingInvites.length > 0) {
    return 'needs-organization-choice';
  }

  return 'needs-organization-creation';
}

function orderMembershipOrganizations(
  membershipOrganizations: MembershipOrganization[],
  activeOrganizationId: string | null,
): MembershipOrganization[] {
  if (!activeOrganizationId) {
    return membershipOrganizations;
  }

  const activeOrganization = membershipOrganizations.find(({ id }) => id === activeOrganizationId);

  if (!activeOrganization) {
    return membershipOrganizations;
  }

  return [
    activeOrganization,
    ...membershipOrganizations.filter(({ id }) => id !== activeOrganizationId),
  ];
}

function getInvitationEntryStatus(expiresAt: Date, status: string): InvitationEntryStatus {
  if (status === 'pending' && expiresAt <= new Date()) {
    return 'expired';
  }

  switch (status) {
    case 'accepted':
    case 'canceled':
    case 'pending':
    case 'rejected':
      return status;
    default:
      return 'invalid';
  }
}

function getInvitationEntryAction(
  status: InvitationEntryStatus,
  invitationEmail: string,
  viewer: InvitationEntryViewer,
): InvitationEntryAction {
  if (status !== 'pending') {
    return 'unavailable';
  }

  if (!viewer) {
    return 'ready-for-authentication';
  }

  if (viewer.email.toLowerCase() !== invitationEmail.toLowerCase()) {
    return 'signed-in-as-different-user';
  }

  if (!viewer.emailVerified) {
    return 'email-verification-required';
  }

  return 'ready-to-accept';
}
