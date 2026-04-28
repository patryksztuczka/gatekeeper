import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { auth } from './lib/auth';
import { env } from 'cloudflare:workers';
import { resolveInvitationEntryState, resolveMembershipResolution } from './lib/auth-organization';
import {
  canManageControlApprovalPolicy,
  ControlApprovalPolicyInputError,
  getControlApprovalPolicy,
  normalizeControlApprovalPolicyUpdateBody,
  updateControlApprovalPolicy,
} from './lib/control-approval-policy';
import {
  addChecklistTemplateItem,
  ChecklistTemplateInputError,
  canManageChecklistTemplates,
  createChecklistTemplate,
  createChecklistTemplateSection,
  listChecklistTemplates,
  normalizeChecklistTemplateCreateBody,
  normalizeChecklistTemplateItemOrderBody,
  normalizeChecklistTemplateItemBody,
  normalizeChecklistTemplateListFilters,
  normalizeChecklistTemplateSectionBody,
  normalizeChecklistTemplateSectionOrderBody,
  publishChecklistTemplate,
  renameChecklistTemplateSection,
  removeChecklistTemplateItem,
  reorderChecklistTemplateItems,
  reorderChecklistTemplateSections,
  setChecklistTemplateArchivedForMembership,
} from './lib/checklist-templates';
import {
  canArchiveControls,
  canPublishControls,
  approveControlPublishRequest,
  cancelDraftControl,
  ControlProposedUpdateInputError,
  ControlPublishRequestInputError,
  createControlProposedUpdate,
  ControlPublishInputError,
  createDraftControl,
  DraftControlInputError,
  getControlDetail,
  listControlProposedUpdates,
  listControlPublishRequests,
  listControls,
  listDraftControls,
  normalizeControlArchiveBody,
  normalizeControlListFilters,
  normalizeControlPublishRequestRejectionBody,
  normalizeControlProposedUpdateBody,
  normalizeDraftControlListFilters,
  normalizeDraftControlCreateBody,
  normalizeDraftControlPublishBody,
  publishControlPublishRequest,
  publishControlProposedUpdate,
  publishDraftControl,
  rejectControlPublishRequest,
  setControlArchivedForMembership,
  submitControlProposedUpdatePublishRequest,
  submitDraftControlPublishRequest,
  withdrawControlPublishRequest,
} from './lib/controls';
import {
  canManageProjectComponents,
  canManageProjects,
  createProjectComponentForMembership,
  createProject,
  getProjectDetailForMember,
  getOrganizationMembership,
  listProjectComponentsForMembership,
  listProjects,
  listOrganizationMembers,
  normalizeProjectComponentBody,
  normalizeProjectCreateBody,
  normalizeProjectUpdateBody,
  ProjectComponentInputError,
  ProjectInputError,
  setProjectComponentArchivedForMembership,
  setProjectArchivedForMembership,
  updateProjectComponentForMembership,
  updateProjectForMembership,
} from './lib/projects';
import {
  applyChecklistTemplateToProjectComponent,
  canApplyProjectChecklists,
  getProjectChecklistForMembership,
  normalizeApplyChecklistTemplateBody,
  normalizeChecklistItemVerificationBody,
  ProjectChecklistInputError,
  updateProjectChecklistItemVerification,
} from './lib/project-checklists';

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

app.get('/api/organizations/:organizationSlug/control-approval-policy', async (c) => {
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

  return c.json({ policy: await getControlApprovalPolicy(membership.organizationId) });
});

app.patch('/api/organizations/:organizationSlug/control-approval-policy', async (c) => {
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

  if (!canManageControlApprovalPolicy(membership.role)) {
    return c.json(
      { error: 'Only Organization owners and admins can edit Control Approval Policy.' },
      403,
    );
  }

  try {
    const policy = await updateControlApprovalPolicy(
      membership,
      normalizeControlApprovalPolicyUpdateBody(await c.req.json().catch(() => null)),
    );

    return c.json({ policy });
  } catch (caughtError) {
    if (caughtError instanceof ControlApprovalPolicyInputError) {
      return c.json({ error: caughtError.message }, 400);
    }

    throw caughtError;
  }
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

app.get('/api/organizations/:organizationSlug/checklist-templates', async (c) => {
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

  const filters = normalizeChecklistTemplateListFilters(c.req.query());

  if (filters.status === 'archived' && !canManageChecklistTemplates(membership.role)) {
    return c.json(
      { error: 'Only Organization owners and admins can view archived Checklist Templates.' },
      403,
    );
  }

  return c.json({
    checklistTemplates: await listChecklistTemplates(membership, filters),
  });
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

  return c.json({
    draftControls: await listDraftControls(
      membership,
      normalizeDraftControlListFilters(c.req.query()),
    ),
  });
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

  const filters = normalizeControlListFilters(c.req.query());

  if (filters.status === 'archived' && !canArchiveControls(membership.role)) {
    return c.json(
      { error: 'Only Organization owners and admins can view archived Controls.' },
      403,
    );
  }

  return c.json({
    controls: await listControls(membership.organizationId, filters),
  });
});

app.get('/api/organizations/:organizationSlug/controls/proposed-updates', async (c) => {
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

  return c.json({ proposedUpdates: await listControlProposedUpdates(membership) });
});

app.get('/api/organizations/:organizationSlug/controls/publish-requests', async (c) => {
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

  return c.json({ publishRequests: await listControlPublishRequests(membership) });
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

app.post(
  '/api/organizations/:organizationSlug/controls/publish-requests/:publishRequestId/approve',
  async (c) => reviewControlPublishRequest(c, 'approve'),
);

app.post(
  '/api/organizations/:organizationSlug/controls/publish-requests/:publishRequestId/reject',
  async (c) => reviewControlPublishRequest(c, 'reject'),
);

app.post(
  '/api/organizations/:organizationSlug/controls/publish-requests/:publishRequestId/withdraw',
  async (c) => reviewControlPublishRequest(c, 'withdraw'),
);

app.post(
  '/api/organizations/:organizationSlug/controls/publish-requests/:publishRequestId/publish',
  async (c) => publishReviewedControlPublishRequest(c),
);

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

app.post('/api/organizations/:organizationSlug/checklist-templates', async (c) => {
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

  if (!canManageChecklistTemplates(membership.role)) {
    return c.json(
      { error: 'Only Organization owners and admins can create Checklist Templates.' },
      403,
    );
  }

  try {
    const checklistTemplate = await createChecklistTemplate(
      membership,
      normalizeChecklistTemplateCreateBody(await c.req.json().catch(() => null)),
    );

    return c.json({ checklistTemplate }, 201);
  } catch (caughtError) {
    if (caughtError instanceof ChecklistTemplateInputError) {
      return c.json({ error: caughtError.message }, 400);
    }

    throw caughtError;
  }
});

app.post(
  '/api/organizations/:organizationSlug/checklist-templates/:templateId/sections',
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
      return c.json({ error: 'Checklist Template unavailable' }, 404);
    }

    if (!canManageChecklistTemplates(membership.role)) {
      return c.json(
        { error: 'Only Organization owners and admins can edit Checklist Template Sections.' },
        403,
      );
    }

    try {
      const checklistTemplate = await createChecklistTemplateSection(
        membership,
        c.req.param('templateId'),
        normalizeChecklistTemplateSectionBody(await c.req.json().catch(() => null)),
      );

      if (!checklistTemplate) {
        return c.json({ error: 'Checklist Template unavailable' }, 404);
      }

      return c.json({ checklistTemplate }, 201);
    } catch (caughtError) {
      if (caughtError instanceof ChecklistTemplateInputError) {
        return c.json({ error: caughtError.message }, 400);
      }

      throw caughtError;
    }
  },
);

app.patch(
  '/api/organizations/:organizationSlug/checklist-templates/:templateId/sections/order',
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
      return c.json({ error: 'Checklist Template unavailable' }, 404);
    }

    if (!canManageChecklistTemplates(membership.role)) {
      return c.json(
        { error: 'Only Organization owners and admins can edit Checklist Template Sections.' },
        403,
      );
    }

    try {
      const checklistTemplate = await reorderChecklistTemplateSections(
        membership,
        c.req.param('templateId'),
        normalizeChecklistTemplateSectionOrderBody(await c.req.json().catch(() => null)),
      );

      if (!checklistTemplate) {
        return c.json({ error: 'Checklist Template unavailable' }, 404);
      }

      return c.json({ checklistTemplate });
    } catch (caughtError) {
      if (caughtError instanceof ChecklistTemplateInputError) {
        return c.json({ error: caughtError.message }, 400);
      }

      throw caughtError;
    }
  },
);

app.patch(
  '/api/organizations/:organizationSlug/checklist-templates/:templateId/sections/:sectionId',
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
      return c.json({ error: 'Checklist Template Section unavailable' }, 404);
    }

    if (!canManageChecklistTemplates(membership.role)) {
      return c.json(
        { error: 'Only Organization owners and admins can edit Checklist Template Sections.' },
        403,
      );
    }

    try {
      const checklistTemplate = await renameChecklistTemplateSection(
        membership,
        c.req.param('templateId'),
        c.req.param('sectionId'),
        normalizeChecklistTemplateSectionBody(await c.req.json().catch(() => null)),
      );

      if (!checklistTemplate) {
        return c.json({ error: 'Checklist Template Section unavailable' }, 404);
      }

      return c.json({ checklistTemplate });
    } catch (caughtError) {
      if (caughtError instanceof ChecklistTemplateInputError) {
        return c.json({ error: caughtError.message }, 400);
      }

      throw caughtError;
    }
  },
);

app.post(
  '/api/organizations/:organizationSlug/checklist-templates/:templateId/items',
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
      return c.json({ error: 'Checklist Template unavailable' }, 404);
    }

    if (!canManageChecklistTemplates(membership.role)) {
      return c.json(
        { error: 'Only Organization owners and admins can edit Checklist Template items.' },
        403,
      );
    }

    try {
      const checklistTemplate = await addChecklistTemplateItem(
        membership,
        c.req.param('templateId'),
        normalizeChecklistTemplateItemBody(await c.req.json().catch(() => null)),
      );

      if (!checklistTemplate) {
        return c.json({ error: 'Checklist Template unavailable' }, 404);
      }

      return c.json({ checklistTemplate }, 201);
    } catch (caughtError) {
      if (caughtError instanceof ChecklistTemplateInputError) {
        return c.json({ error: caughtError.message }, 400);
      }

      throw caughtError;
    }
  },
);

app.patch(
  '/api/organizations/:organizationSlug/checklist-templates/:templateId/items/order',
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
      return c.json({ error: 'Checklist Template unavailable' }, 404);
    }

    if (!canManageChecklistTemplates(membership.role)) {
      return c.json(
        { error: 'Only Organization owners and admins can edit Checklist Template items.' },
        403,
      );
    }

    try {
      const checklistTemplate = await reorderChecklistTemplateItems(
        membership,
        c.req.param('templateId'),
        normalizeChecklistTemplateItemOrderBody(await c.req.json().catch(() => null)),
      );

      if (!checklistTemplate) {
        return c.json({ error: 'Checklist Template unavailable' }, 404);
      }

      return c.json({ checklistTemplate });
    } catch (caughtError) {
      if (caughtError instanceof ChecklistTemplateInputError) {
        return c.json({ error: caughtError.message }, 400);
      }

      throw caughtError;
    }
  },
);

app.delete(
  '/api/organizations/:organizationSlug/checklist-templates/:templateId/items/:itemId',
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
      return c.json({ error: 'Checklist Template unavailable' }, 404);
    }

    if (!canManageChecklistTemplates(membership.role)) {
      return c.json(
        { error: 'Only Organization owners and admins can edit Checklist Template items.' },
        403,
      );
    }

    const checklistTemplate = await removeChecklistTemplateItem(
      membership,
      c.req.param('templateId'),
      c.req.param('itemId'),
    );

    if (!checklistTemplate) {
      return c.json({ error: 'Checklist Template item unavailable' }, 404);
    }

    return c.json({ checklistTemplate });
  },
);

app.post(
  '/api/organizations/:organizationSlug/checklist-templates/:templateId/publish',
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
      return c.json({ error: 'Checklist Template unavailable' }, 404);
    }

    if (!canManageChecklistTemplates(membership.role)) {
      return c.json(
        { error: 'Only Organization owners and admins can publish Checklist Templates.' },
        403,
      );
    }

    const checklistTemplate = await publishChecklistTemplate(membership, c.req.param('templateId'));

    if (!checklistTemplate) {
      return c.json({ error: 'Checklist Template unavailable' }, 404);
    }

    return c.json({ checklistTemplate });
  },
);

app.post(
  '/api/organizations/:organizationSlug/checklist-templates/:templateId/archive',
  async (c) => setChecklistTemplateArchived(c, true),
);

app.post(
  '/api/organizations/:organizationSlug/checklist-templates/:templateId/restore',
  async (c) => setChecklistTemplateArchived(c, false),
);

app.post('/api/organizations/:organizationSlug/controls/:controlId/proposed-updates', async (c) => {
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

  try {
    const proposedUpdate = await createControlProposedUpdate(
      membership,
      c.req.param('controlId'),
      normalizeControlProposedUpdateBody(await c.req.json().catch(() => null)),
    );

    if (!proposedUpdate) {
      return c.json({ error: 'Control unavailable' }, 404);
    }

    return c.json({ proposedUpdate }, 201);
  } catch (caughtError) {
    if (caughtError instanceof ControlProposedUpdateInputError) {
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

app.post(
  '/api/organizations/:organizationSlug/controls/drafts/:draftControlId/publish-requests',
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

    try {
      const publishRequest = await submitDraftControlPublishRequest(
        membership,
        c.req.param('draftControlId'),
        normalizeDraftControlPublishBody(await c.req.json().catch(() => null)),
      );

      if (!publishRequest) {
        return c.json({ error: 'Draft Control unavailable' }, 404);
      }

      return c.json({ publishRequest }, 201);
    } catch (caughtError) {
      if (caughtError instanceof ControlPublishRequestInputError) {
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

app.post(
  '/api/organizations/:organizationSlug/controls/:controlId/proposed-updates/:proposedUpdateId/publish',
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
      return c.json({ error: 'Proposed update unavailable' }, 404);
    }

    if (!canPublishControls(membership.role)) {
      return c.json({ error: 'Only Organization owners and admins can publish Controls.' }, 403);
    }

    try {
      const control = await publishControlProposedUpdate(
        membership,
        c.req.param('controlId'),
        c.req.param('proposedUpdateId'),
      );

      if (!control) {
        return c.json({ error: 'Proposed update unavailable' }, 404);
      }

      return c.json({ control }, 201);
    } catch (caughtError) {
      if (caughtError instanceof ControlProposedUpdateInputError) {
        return c.json({ error: caughtError.message }, 400);
      }

      if (caughtError instanceof ControlPublishInputError) {
        return c.json({ error: caughtError.message }, 400);
      }

      throw caughtError;
    }
  },
);

app.post(
  '/api/organizations/:organizationSlug/controls/:controlId/proposed-updates/:proposedUpdateId/publish-requests',
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
      return c.json({ error: 'Proposed update unavailable' }, 404);
    }

    try {
      const publishRequest = await submitControlProposedUpdatePublishRequest(
        membership,
        c.req.param('controlId'),
        c.req.param('proposedUpdateId'),
      );

      if (!publishRequest) {
        return c.json({ error: 'Proposed update unavailable' }, 404);
      }

      return c.json({ publishRequest }, 201);
    } catch (caughtError) {
      if (caughtError instanceof ControlPublishRequestInputError) {
        return c.json({ error: caughtError.message }, 400);
      }

      throw caughtError;
    }
  },
);

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

app.get('/api/organizations/:organizationSlug/projects/:projectSlug/components', async (c) => {
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

  const status = c.req.query('status') === 'archived' ? 'archived' : 'active';

  if (
    status === 'archived' &&
    !(await canManageProjectComponents({ membership, projectSlug: c.req.param('projectSlug') }))
  ) {
    return c.json(
      { error: 'Only Project Component managers can view archived Project Components.' },
      403,
    );
  }

  const components = await listProjectComponentsForMembership({
    membership,
    projectSlug: c.req.param('projectSlug'),
    status,
  });

  if (!components) {
    return c.json({ error: 'Project unavailable' }, 404);
  }

  return c.json({ components });
});

app.post('/api/organizations/:organizationSlug/projects/:projectSlug/components', async (c) => {
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

  if (
    !(await canManageProjectComponents({ membership, projectSlug: c.req.param('projectSlug') }))
  ) {
    return c.json(
      {
        error:
          'Only Organization owners, admins, and the Project Owner can create Project Components.',
      },
      403,
    );
  }

  try {
    const component = await createProjectComponentForMembership({
      membership,
      projectSlug: c.req.param('projectSlug'),
      values: normalizeProjectComponentBody(await c.req.json().catch(() => null)),
    });

    if (!component) {
      return c.json({ error: 'Project unavailable' }, 404);
    }

    return c.json({ component }, 201);
  } catch (caughtError) {
    if (caughtError instanceof ProjectComponentInputError) {
      return c.json({ error: caughtError.message }, 400);
    }

    throw caughtError;
  }
});

app.patch(
  '/api/organizations/:organizationSlug/projects/:projectSlug/components/:componentId',
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
      return c.json({ error: 'Project Component unavailable' }, 404);
    }

    if (
      !(await canManageProjectComponents({ membership, projectSlug: c.req.param('projectSlug') }))
    ) {
      return c.json(
        {
          error:
            'Only Organization owners, admins, and the Project Owner can edit Project Components.',
        },
        403,
      );
    }

    try {
      const component = await updateProjectComponentForMembership({
        componentId: c.req.param('componentId'),
        membership,
        projectSlug: c.req.param('projectSlug'),
        values: normalizeProjectComponentBody(await c.req.json().catch(() => null)),
      });

      if (!component) {
        return c.json({ error: 'Project Component unavailable' }, 404);
      }

      return c.json({ component });
    } catch (caughtError) {
      if (caughtError instanceof ProjectComponentInputError) {
        return c.json({ error: caughtError.message }, 400);
      }

      throw caughtError;
    }
  },
);

app.patch(
  '/api/organizations/:organizationSlug/projects/:projectSlug/components/:componentId/archive',
  async (c) => setProjectComponentArchived(c, true),
);

app.patch(
  '/api/organizations/:organizationSlug/projects/:projectSlug/components/:componentId/restore',
  async (c) => setProjectComponentArchived(c, false),
);

app.post(
  '/api/organizations/:organizationSlug/projects/:projectSlug/components/:componentId/checklists',
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
      return c.json({ error: 'Project Component unavailable' }, 404);
    }

    if (
      !(await canApplyProjectChecklists({ membership, projectSlug: c.req.param('projectSlug') }))
    ) {
      return c.json(
        {
          error:
            'Only Organization owners, admins, and the Project Owner can apply Checklist Templates to Project Components.',
        },
        403,
      );
    }

    try {
      const projectChecklist = await applyChecklistTemplateToProjectComponent({
        componentId: c.req.param('componentId'),
        membership,
        projectSlug: c.req.param('projectSlug'),
        values: normalizeApplyChecklistTemplateBody(await c.req.json().catch(() => null)),
      });

      if (!projectChecklist) {
        return c.json({ error: 'Project Component unavailable' }, 404);
      }

      return c.json({ projectChecklist }, 201);
    } catch (caughtError) {
      if (caughtError instanceof ProjectChecklistInputError) {
        return c.json({ error: caughtError.message }, 400);
      }

      throw caughtError;
    }
  },
);

app.get(
  '/api/organizations/:organizationSlug/projects/:projectSlug/components/:componentId/checklists/:checklistId',
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
      return c.json({ error: 'Project Checklist unavailable' }, 404);
    }

    const projectChecklist = await getProjectChecklistForMembership({
      checklistId: c.req.param('checklistId'),
      componentId: c.req.param('componentId'),
      includeRemovedFromTemplate: c.req.query('includeRemovedFromTemplate') === 'true',
      membership,
      projectSlug: c.req.param('projectSlug'),
    });

    if (!projectChecklist) {
      return c.json({ error: 'Project Checklist unavailable' }, 404);
    }

    return c.json({ projectChecklist });
  },
);

app.patch(
  '/api/organizations/:organizationSlug/projects/:projectSlug/components/:componentId/checklists/:checklistId/items/:itemId/verification',
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
      return c.json({ error: 'Project Checklist Item unavailable' }, 404);
    }

    try {
      const projectChecklist = await updateProjectChecklistItemVerification({
        checklistId: c.req.param('checklistId'),
        componentId: c.req.param('componentId'),
        itemId: c.req.param('itemId'),
        membership,
        projectSlug: c.req.param('projectSlug'),
        values: normalizeChecklistItemVerificationBody(await c.req.json().catch(() => null)),
      });

      if (!projectChecklist) {
        return c.json({ error: 'Project Checklist Item unavailable' }, 404);
      }

      return c.json({ projectChecklist });
    } catch (caughtError) {
      if (caughtError instanceof ProjectChecklistInputError) {
        return c.json({ error: caughtError.message }, 400);
      }

      throw caughtError;
    }
  },
);

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

async function setProjectComponentArchived(c: Context, archived: boolean) {
  const organizationSlug = c.req.param('organizationSlug');
  const projectSlug = c.req.param('projectSlug');
  const componentId = c.req.param('componentId');

  if (!organizationSlug || !projectSlug || !componentId) {
    return c.json({ error: 'Project Component unavailable' }, 404);
  }

  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const membership = await getOrganizationMembership(organizationSlug, session.user.id);

  if (!membership) {
    return c.json({ error: 'Project Component unavailable' }, 404);
  }

  if (!(await canManageProjectComponents({ membership, projectSlug }))) {
    return c.json(
      {
        error: `Only Organization owners, admins, and the Project Owner can ${
          archived ? 'archive' : 'restore'
        } Project Components.`,
      },
      403,
    );
  }

  const component = await setProjectComponentArchivedForMembership({
    archived,
    componentId,
    membership,
    projectSlug,
  });

  if (!component) {
    return c.json({ error: 'Project Component unavailable' }, 404);
  }

  return c.json({ component });
}

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

async function setChecklistTemplateArchived(c: Context, archived: boolean) {
  const organizationSlug = c.req.param('organizationSlug');
  const templateId = c.req.param('templateId');

  if (!organizationSlug || !templateId) {
    return c.json({ error: 'Checklist Template unavailable' }, 404);
  }

  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const membership = await getOrganizationMembership(organizationSlug, session.user.id);

  if (!membership) {
    return c.json({ error: 'Checklist Template unavailable' }, 404);
  }

  if (!canManageChecklistTemplates(membership.role)) {
    return c.json(
      {
        error: `Only Organization owners and admins can ${archived ? 'archive' : 'restore'} Checklist Templates.`,
      },
      403,
    );
  }

  const checklistTemplate = await setChecklistTemplateArchivedForMembership({
    archived,
    membership,
    templateId,
  });

  if (!checklistTemplate) {
    return c.json({ error: 'Checklist Template unavailable' }, 404);
  }

  return c.json({ checklistTemplate });
}

async function reviewControlPublishRequest(c: Context, action: 'approve' | 'reject' | 'withdraw') {
  const organizationSlug = c.req.param('organizationSlug');
  const publishRequestId = c.req.param('publishRequestId');

  if (!organizationSlug || !publishRequestId) {
    return c.json({ error: 'Control Publish Request unavailable' }, 404);
  }

  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const membership = await getOrganizationMembership(organizationSlug, session.user.id);

  if (!membership) {
    return c.json({ error: 'Control Publish Request unavailable' }, 404);
  }

  try {
    const publishRequest =
      action === 'approve'
        ? await approveControlPublishRequest(membership, publishRequestId)
        : action === 'reject'
          ? await rejectControlPublishRequest(
              membership,
              publishRequestId,
              normalizeControlPublishRequestRejectionBody(await c.req.json().catch(() => null)),
            )
          : await withdrawControlPublishRequest(membership, publishRequestId);

    if (!publishRequest) {
      return c.json({ error: 'Control Publish Request unavailable' }, 404);
    }

    return c.json({ publishRequest });
  } catch (caughtError) {
    if (caughtError instanceof ControlPublishRequestInputError) {
      return c.json({ error: caughtError.message }, 400);
    }

    throw caughtError;
  }
}

async function publishReviewedControlPublishRequest(c: Context) {
  const organizationSlug = c.req.param('organizationSlug');
  const publishRequestId = c.req.param('publishRequestId');

  if (!organizationSlug || !publishRequestId) {
    return c.json({ error: 'Control Publish Request unavailable' }, 404);
  }

  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const membership = await getOrganizationMembership(organizationSlug, session.user.id);

  if (!membership) {
    return c.json({ error: 'Control Publish Request unavailable' }, 404);
  }

  try {
    const control = await publishControlPublishRequest(membership, publishRequestId);

    if (!control) {
      return c.json({ error: 'Control Publish Request unavailable' }, 404);
    }

    return c.json({ control }, 201);
  } catch (caughtError) {
    if (
      caughtError instanceof ControlPublishInputError ||
      caughtError instanceof ControlProposedUpdateInputError
    ) {
      return c.json({ error: caughtError.message }, 400);
    }

    throw caughtError;
  }
}

app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));

app.get('/', (c) => {
  return c.text('Hello Hono!');
});

export default app;
