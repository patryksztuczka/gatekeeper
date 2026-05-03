import { initTRPC, TRPCError } from '@trpc/server';

type AuthSession = {
  session: {
    activeOrganizationId?: string | null;
    id: string;
  };
  user: {
    email: string;
    emailVerified: boolean;
    id: string;
  };
};

export type TRPCContext = {
  session: AuthSession | null;
};

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Unauthorized' });
  }

  return next({
    ctx: {
      session: ctx.session,
    },
  });
});
