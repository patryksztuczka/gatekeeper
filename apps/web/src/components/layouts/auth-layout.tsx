import { Outlet } from 'react-router';

export function AuthLayout() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-slate-100 sm:px-8 lg:px-12">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-slate-950/30 backdrop-blur sm:p-10">
          <div className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-sm font-medium text-emerald-200">
            Gatekeeper authentication
          </div>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Simple sign in and sign up flows for the first release.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
            Email and password only, with email verification and password recovery prepared in the
            backend.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
              <p className="text-sm font-medium text-white">Sign in</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Existing users authenticate with email and password and continue into their active
                organization.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
              <p className="text-sm font-medium text-white">Sign up</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                New users create an account and verify their email before they can access
                Gatekeeper.
              </p>
            </div>
          </div>
        </section>

        <section>
          <Outlet />
        </section>
      </div>
    </main>
  );
}
