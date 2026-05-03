import type { Context } from 'hono';
import { auth } from '../lib/auth';

export async function createTRPCContext(c: Context) {
  return {
    session: await auth.api.getSession({
      headers: c.req.raw.headers,
    }),
  };
}
