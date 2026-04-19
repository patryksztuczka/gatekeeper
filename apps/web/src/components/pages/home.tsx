import { signOut, useSession } from '../../lib/auth-client';

export function HomePage() {
  const { data: session } = useSession();

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-slate-100 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-5xl rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-slate-950/30 backdrop-blur sm:p-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium tracking-[0.2em] text-emerald-300 uppercase">
              Protected route
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Welcome to Gatekeeper
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              This route is visible only after a valid Better Auth session is established.
            </p>
          </div>

          <button
            type="button"
            className="rounded-xl border border-white/15 bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-slate-800"
            onClick={async () => {
              await signOut();
            }}
          >
            Sign out
          </button>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
            <p className="text-sm font-medium text-slate-400">Signed in user</p>
            <p className="mt-2 text-lg font-semibold text-white">
              {session?.user.name ?? 'Unknown user'}
            </p>
            <p className="mt-1 text-sm text-slate-400">{session?.user.email}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
            <p className="text-sm font-medium text-slate-400">Session state</p>
            <p className="mt-2 text-lg font-semibold text-white">Authenticated</p>
            <p className="mt-1 text-sm text-slate-400">
              Public routes now redirect away from sign-in and sign-up.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
            <p className="text-sm font-medium text-slate-400">Next step</p>
            <p className="mt-2 text-lg font-semibold text-white">Hook real app shell here</p>
            <p className="mt-1 text-sm text-slate-400">
              This page is the initial protected placeholder for the app.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
