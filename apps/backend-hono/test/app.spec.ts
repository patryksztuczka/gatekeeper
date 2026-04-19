import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import app from '../src/index';

describe('app routes', () => {
  describe('root route', () => {
    it('responds with Hello Hono! (unit style)', async () => {
      const response = await app.request('http://example.com');

      expect(await response.text()).toBe('Hello Hono!');
    });

    it('responds with Hello Hono! (integration style)', async () => {
      const response = await SELF.fetch('https://example.com');

      expect(await response.text()).toBe('Hello Hono!');
    });
  });

  describe('auth routes', () => {
    it('mounts Better Auth routes', async () => {
      const response = await SELF.fetch('https://example.com/api/auth/get-session');

      expect(response.status).toBe(200);
    });
  });
});
