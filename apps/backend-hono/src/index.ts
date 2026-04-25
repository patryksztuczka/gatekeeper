import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth } from './lib/auth';
import { env } from 'cloudflare:workers';
import { resolveInvitationEntryState, resolveMembershipResolution } from './lib/auth-organization';
import { getProjectDetailForMember } from './lib/projects';

const app = new Hono();

app.use(
  '/api/*',
  cors({
    origin: env.CORS_ORIGIN,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['POST', 'GET', 'PATCH', 'DELETE', 'OPTIONS', 'PUT'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    credentials: true,
  }),
);

app.get('/api/auth/membership-resolution', async (c) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const resolution = await resolveMembershipResolution({
    currentActiveOrganizationId: session.session.activeOrganizationId ?? null,
    sessionId: session.session.id,
    userEmail: session.user.email,
    userId: session.user.id,
  });

  return c.json(resolution);
});

app.get('/api/auth/invitations/:invitationId', async (c) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  const invitation = await resolveInvitationEntryState(
    c.req.param('invitationId'),
    session
      ? {
          email: session.user.email,
          emailVerified: session.user.emailVerified,
        }
      : null,
  );

  return c.json(invitation, invitation.status === 'invalid' ? 404 : 200);
});

app.get('/api/organizations/:organizationSlug/projects/:projectSlug', async (c) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const project = await getProjectDetailForMember({
    organizationSlug: c.req.param('organizationSlug'),
    projectSlug: c.req.param('projectSlug'),
    userId: session.user.id,
  });

  if (!project) {
    return c.json({ error: 'Project unavailable' }, 404);
  }

  return c.json({ project });
});

app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));

app.get('/', (c) => {
  return c.text('Hello Hono!');
});

export default app;
