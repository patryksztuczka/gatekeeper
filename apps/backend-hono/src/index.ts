import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth } from './lib/auth';
import { env } from 'cloudflare:workers';
import { resolveMembershipResolution } from './lib/auth-organization';

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

app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));

app.get('/', (c) => {
  return c.text('Hello Hono!');
});

export default app;
