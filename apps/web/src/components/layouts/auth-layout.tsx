import { Outlet } from 'react-router';

export function AuthLayout() {
  return (
    <main className="min-h-screen bg-stone-200 px-4 py-6 text-black sm:px-6">
      <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[320px_1fr]">
        <section className="border-2 border-black bg-white p-5">
          <p className="text-xs uppercase">Gatekeeper v1</p>
          <h1 className="mt-3 text-3xl font-bold">Auth screens</h1>
          <p className="mt-3 text-sm leading-6">
            Plain email and password auth, organization invites, email verification, and password
            reset.
          </p>

          <hr className="my-4 border-black" />

          <p className="text-sm font-bold">Included</p>
          <ul className="mt-2 list-disc pl-5 text-sm leading-6">
            <li>sign in</li>
            <li>sign up</li>
            <li>verify email</li>
            <li>reset password</li>
            <li>invite acceptance</li>
            <li>organization switching</li>
          </ul>
        </section>

        <section className="border-2 border-black bg-white p-5">
          <Outlet />
        </section>
      </div>
    </main>
  );
}
