import { TRPCError } from '@trpc/server';
import { getHTTPStatusCodeFromError } from '@trpc/server/http';

import { auth } from '../src/lib/auth';
import { appRouter } from '../src/trpc/router';

type AppRouterCaller = ReturnType<typeof appRouter.createCaller>;

async function createCaller(headers?: Headers) {
  return appRouter.createCaller({
    session: headers ? await auth.api.getSession({ headers }) : null,
  });
}

export async function callTRPC<TBody>(
  headers: Headers | undefined,
  call: (caller: AppRouterCaller) => Promise<TBody>,
  successStatus = 200,
) {
  try {
    return {
      body: await call(await createCaller(headers)),
      status: successStatus,
    };
  } catch (caughtError) {
    if (caughtError instanceof TRPCError) {
      return {
        body: { error: caughtError.message } as TBody,
        status: getHTTPStatusCodeFromError(caughtError),
      };
    }

    throw caughtError;
  }
}
