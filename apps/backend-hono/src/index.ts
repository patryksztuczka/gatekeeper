import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth } from './lib/auth';
import { env } from 'cloudflare:workers';
import { resolveInvitationEntryState, resolveMembershipResolution } from './lib/auth-organization';
import {
  canManageProjects,
  createProject,
  getProjectDetailForMember,
  getOrganizationMembership,
  listActiveProjects,
  listOrganizationMembers,
  normalizeProjectCreateBody,
  normalizeProjectUpdateBody,
  ProjectInputError,
  updateProjectForMembership,
} from './lib/projects';

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

app.get('/api/organizations/:organizationSlug/members', async (c) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const membership = await getOrganizationMembership(
    c.req.param('organizationSlug'),
    session.user.id,
  );

  if (!membership) {
    return c.json({ error: 'Organization not found' }, 404);
  }

  return c.json({ members: await listOrganizationMembers(membership.organizationId) });
});

app.get('/api/organizations/:organizationSlug/projects', async (c) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const membership = await getOrganizationMembership(
    c.req.param('organizationSlug'),
    session.user.id,
  );

  if (!membership) {
    return c.json({ error: 'Organization not found' }, 404);
  }

  return c.json({ projects: await listActiveProjects(membership.organizationId) });
});

app.post('/api/organizations/:organizationSlug/projects', async (c) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const membership = await getOrganizationMembership(
    c.req.param('organizationSlug'),
    session.user.id,
  );

  if (!membership) {
    return c.json({ error: 'Organization not found' }, 404);
  }

  if (!canManageProjects(membership.role)) {
    return c.json({ error: 'Only Organization owners and admins can create Projects.' }, 403);
  }

  try {
    const project = await createProject(
      membership.organizationId,
      normalizeProjectCreateBody(await c.req.json().catch(() => null)),
    );

    return c.json({ project }, 201);
  } catch (caughtError) {
    if (caughtError instanceof ProjectInputError) {
      return c.json({ error: caughtError.message }, 400);
    }

    throw caughtError;
  }
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

app.patch('/api/organizations/:organizationSlug/projects/:projectSlug', async (c) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const membership = await getOrganizationMembership(
    c.req.param('organizationSlug'),
    session.user.id,
  );

  if (!membership) {
    return c.json({ error: 'Project unavailable' }, 404);
  }

  if (!canManageProjects(membership.role)) {
    return c.json({ error: 'Only Organization owners and admins can edit Projects.' }, 403);
  }

  try {
    const project = await updateProjectForMembership({
      membership,
      projectSlug: c.req.param('projectSlug'),
      updates: normalizeProjectUpdateBody(await c.req.json().catch(() => null)),
    });

    if (!project) {
      return c.json({ error: 'Project unavailable' }, 404);
    }

    return c.json({ project });
  } catch (caughtError) {
    if (caughtError instanceof ProjectInputError) {
      return c.json({ error: caughtError.message }, 400);
    }

    throw caughtError;
  }
});

app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));

app.get('/', (c) => {
  return c.text('Hello Hono!');
});

export default app;
