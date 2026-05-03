import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { inferRouterOutputs } from '@trpc/server';
import { AUTH_BASE_URL } from '@/features/auth/api/auth-client';
import type { AppRouter } from '../../../backend-hono/src/trpc/router';

export type RouterOutputs = inferRouterOutputs<AppRouter>;

export const queryClient = new QueryClient();

const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${AUTH_BASE_URL}/api/trpc`,
      fetch: (url, options) =>
        fetch(url, {
          ...options,
          credentials: 'include',
        }),
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
