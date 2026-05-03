import { router } from './core';
import { controlsRouter } from './controls-router';
import { organizationsRouter } from './organizations-router';
import { projectsRouter } from './projects-router';

export const appRouter = router({
  controls: controlsRouter,
  organizations: organizationsRouter,
  projects: projectsRouter,
});

export type AppRouter = typeof appRouter;
