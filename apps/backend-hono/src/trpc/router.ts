import { router } from './core';
import { controlsRouter } from '../contexts/control-library/controls-router';
import { organizationsRouter } from '../contexts/identity-organization/organizations-router';
import { projectsRouter } from '../contexts/projects/projects-router';

export const appRouter = router({
  controls: controlsRouter,
  organizations: organizationsRouter,
  projects: projectsRouter,
});

export type AppRouter = typeof appRouter;
