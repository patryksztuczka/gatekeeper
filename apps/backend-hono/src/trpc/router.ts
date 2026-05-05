import { router } from './core';
import { auditLogRouter } from '../contexts/audit-log/audit-log-router';
import { checklistsRouter } from '../contexts/checklists/checklists-router';
import { controlsRouter } from '../contexts/control-library/controls-router';
import { organizationsRouter } from '../contexts/identity-organization/organizations-router';
import { projectsRouter } from '../contexts/projects/projects-router';

export const appRouter = router({
  auditLog: auditLogRouter,
  checklists: checklistsRouter,
  controls: controlsRouter,
  organizations: organizationsRouter,
  projects: projectsRouter,
});

export type AppRouter = typeof appRouter;
