import { env } from 'cloudflare:workers';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';
import { db } from '../db/client';
import {
  accounts,
  invitations,
  members,
  organizations,
  sessions,
  users,
  verifications,
} from '../db/schema';
import {
  ensureDefaultOrganizationForUser,
  gatekeeperOrganizationOptions,
  getInitialActiveOrganizationId,
  isEmailPasswordSignUp,
  shouldCreateDefaultOrganization,
} from './auth-organization';
import { sendEmail } from './email';

const sevenDaysInSeconds = 60 * 60 * 24 * 7;
const oneDayInSeconds = 60 * 60 * 24;

function getAppOrigin() {
  return env.TRUSTED_ORIGINS.split(',')[0]?.trim() || env.BETTER_AUTH_URL;
}

function getInvitationLink(invitationId: string) {
  return `${getAppOrigin().replace(/\/$/, '')}/invite/${invitationId}`;
}

export const auth = betterAuth({
  appName: 'Gatekeeper',
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
      organization: organizations,
      member: members,
      invitation: invitations,
    },
  }),
  trustedOrigins: [env.TRUSTED_ORIGINS],
  databaseHooks: {
    user: {
      create: {
        after: async (user, context) => {
          if (!context || !isEmailPasswordSignUp(context)) {
            return;
          }

          if (!(await shouldCreateDefaultOrganization(context.context, user.email))) {
            return;
          }

          await ensureDefaultOrganizationForUser(context.context, {
            ...user,
            image: user.image ?? null,
          });
        },
      },
    },
    session: {
      create: {
        before: async (session, context) => {
          if (!context) {
            return;
          }

          const activeOrganizationId = await getInitialActiveOrganizationId(session.userId);

          if (!activeOrganizationId) {
            return;
          }

          return {
            data: {
              ...session,
              activeOrganizationId,
            },
          };
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: [{ email: user.email, name: user.name }],
        subject: 'Reset your Gatekeeper password',
        text: `Use this link to reset your password: ${url}`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: [{ email: user.email, name: user.name }],
        subject: 'Verify your Gatekeeper email',
        text: `Use this link to verify your email address: ${url}`,
      });
    },
  },
  session: {
    expiresIn: sevenDaysInSeconds,
    updateAge: oneDayInSeconds,
  },
  plugins: [
    organization({
      ...gatekeeperOrganizationOptions,
      sendInvitationEmail: async ({ email, invitation, inviter, organization }) => {
        const invitationLink = getInvitationLink(invitation.id);

        await sendEmail({
          to: [{ email }],
          subject: `Join ${organization.name} on Gatekeeper`,
          text: `${inviter.user.email} invited you to join ${organization.name} on Gatekeeper as ${invitation.role}. Open this link to continue: ${invitationLink}`,
          tags: ['auth', 'invitation'],
        });
      },
    }),
  ],
});
