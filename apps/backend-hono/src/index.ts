import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { auth } from './lib/auth';
import { env } from 'cloudflare:workers';
import { resolveInvitationEntryState, resolveMembershipResolution } from './lib/auth-organization';
import {
  canArchiveControls,
  canPublishControls,
  cancelDraftControl,
  ControlPublishInputError,
  createDraftControl,
  DraftControlInputError,
  getControlDetail,
  listControls,
  listDraftControls,
  normalizeControlArchiveBody,
  normalizeDraftControlCreateBody,
  normalizeDraftControlPublishBody,
  publishDraftControl,
  setControlArchivedForMembership,
} from './lib/controls';
import {
  canManageProjects,
  createProject,
  getProjectDetailForMember,
  getOrganizationMembership,
  listProjects,
  listOrganizationMembers,
  normalizeProjectCreateBody,
  normalizeProjectUpdateBody,
  ProjectInputError,
  setProjectArchivedForMembership,
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

  const status = c.req.query('status') === 'archived' ? 'archived' : 'active';

  return c.json({ projects: await listProjects(membership.organizationId, status) });
});

app.get('/api/organizations/:organizationSlug/controls/drafts', async (c) => {
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

  return c.json({ draftControls: await listDraftControls(membership) });
});

app.get('/api/organizations/:organizationSlug/controls', async (c) => {
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

  const status = c.req.query('status') === 'archived' ? 'archived' : 'active';

  if (status === 'archived' && !canArchiveControls(membership.role)) {
    return c.json(
      { error: 'Only Organization owners and admins can view archived Controls.' },
      403,
    );
  }

  return c.json({ controls: await listControls(membership.organizationId, status) });
});

app.get('/api/organizations/:organizationSlug/controls/:controlId', async (c) => {
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
    return c.json({ error: 'Control unavailable' }, 404);
  }

  const control = await getControlDetail(membership, c.req.param('controlId'));

  if (!control) {
    return c.json({ error: 'Control unavailable' }, 404);
  }

  return c.json({ control });
});

app.post('/api/organizations/:organizationSlug/controls/drafts', async (c) => {
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

  try {
    const draftControl = await createDraftControl(
      membership,
      normalizeDraftControlCreateBody(await c.req.json().catch(() => null)),
    );

    return c.json({ draftControl }, 201);
  } catch (caughtError) {
    if (caughtError instanceof DraftControlInputError) {
      return c.json({ error: caughtError.message }, 400);
    }

    throw caughtError;
  }
});

app.post(
  '/api/organizations/:organizationSlug/controls/drafts/:draftControlId/publish',
  async (c) => {
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
      return c.json({ error: 'Draft Control unavailable' }, 404);
    }

    if (!canPublishControls(membership.role)) {
      return c.json({ error: 'Only Organization owners and admins can publish Controls.' }, 403);
    }

    try {
      const control = await publishDraftControl(
        membership,
        c.req.param('draftControlId'),
        normalizeDraftControlPublishBody(await c.req.json().catch(() => null)),
      );

      if (!control) {
        return c.json({ error: 'Draft Control unavailable' }, 404);
      }

      return c.json({ control }, 201);
    } catch (caughtError) {
      if (caughtError instanceof ControlPublishInputError) {
        return c.json({ error: caughtError.message }, 400);
      }

      throw caughtError;
    }
  },
);

app.delete('/api/organizations/:organizationSlug/controls/drafts/:draftControlId', async (c) => {
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
    return c.json({ error: 'Draft Control unavailable' }, 404);
  }

  const canceled = await cancelDraftControl(membership, c.req.param('draftControlId'));

  if (!canceled) {
    return c.json({ error: 'Draft Control unavailable' }, 404);
  }

  return c.json({ canceled: true });
});

app.patch('/api/organizations/:organizationSlug/controls/:controlId/archive', async (c) => {
  return setControlArchived(c, true);
});

app.patch('/api/organizations/:organizationSlug/controls/:controlId/restore', async (c) => {
  return setControlArchived(c, false);
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

app.patch('/api/organizations/:organizationSlug/projects/:projectSlug/archive', async (c) => {
  return setProjectArchived(c, true);
});

app.patch('/api/organizations/:organizationSlug/projects/:projectSlug/restore', async (c) => {
  return setProjectArchived(c, false);
});

async function setProjectArchived(c: Context, archived: boolean) {
  const organizationSlug = c.req.param('organizationSlug');
  const projectSlug = c.req.param('projectSlug');

  if (!organizationSlug || !projectSlug) {
    return c.json({ error: 'Project unavailable' }, 404);
  }

  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const membership = await getOrganizationMembership(organizationSlug, session.user.id);

  if (!membership) {
    return c.json({ error: 'Project unavailable' }, 404);
  }

  if (!canManageProjects(membership.role)) {
    return c.json(
      {
        error: `Only Organization owners and admins can ${archived ? 'archive' : 'restore'} Projects.`,
      },
      403,
    );
  }

  const project = await setProjectArchivedForMembership({
    archived,
    membership,
    projectSlug,
  });

  if (!project) {
    return c.json({ error: 'Project unavailable' }, 404);
  }

  return c.json({ project });
}

async function setControlArchived(c: Context, archived: boolean) {
  const organizationSlug = c.req.param('organizationSlug');
  const controlId = c.req.param('controlId');

  if (!organizationSlug || !controlId) {
    return c.json({ error: 'Control unavailable' }, 404);
  }

  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const membership = await getOrganizationMembership(organizationSlug, session.user.id);

  if (!membership) {
    return c.json({ error: 'Control unavailable' }, 404);
  }

  if (!canArchiveControls(membership.role)) {
    return c.json(
      {
        error: `Only Organization owners and admins can ${archived ? 'archive' : 'restore'} Controls.`,
      },
      403,
    );
  }

  const archiveReason = archived
    ? normalizeControlArchiveBody(await c.req.json().catch(() => null)).reason
    : undefined;
  const control = await setControlArchivedForMembership({
    archived,
    controlId,
    membership,
    reason: archiveReason,
  });

  if (!control) {
    return c.json({ error: 'Control unavailable' }, 404);
  }

  return c.json({ control });
}

app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));

app.get('/', (c) => {
  return c.text('Hello Hono!');
});

export default app;
