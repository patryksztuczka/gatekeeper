import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { getAuthErrorMessage } from '../../features/auth/auth-errors';
import { signUp } from '../../features/auth/auth-client';

export function SignUpPage() {
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/';
  const invitedEmail = searchParams.get('email') || '';
  const isInviteJourney = redirectTo.startsWith('/invite/');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(invitedEmail);
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setStatus(null);
    setIsSubmitting(true);

    try {
      const callbackURL = new URL('/sign-in', window.location.origin);
      callbackURL.searchParams.set('redirectTo', redirectTo);

      const result = await signUp.email({
        name,
        email,
        password,
        callbackURL: callbackURL.toString(),
      });

      const message = getAuthErrorMessage(result, 'Unable to create account.');

      if (message) {
        setError(message);
        return;
      }

      setStatus(
        isInviteJourney
          ? 'Account created. Verify your email, then sign in to accept the invitation.'
          : 'Account created. Check your inbox for the verification email before signing in.',
      );
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Unable to create account.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      className="rounded-3xl border border-white/10 bg-white p-6 text-slate-900 shadow-xl shadow-slate-950/20 sm:p-7"
      onSubmit={handleSubmit}
    >
      <p className="text-sm font-medium tracking-[0.2em] text-slate-500 uppercase">Sign up</p>
      <h2 className="mt-2 text-2xl font-semibold">Create your Gatekeeper account</h2>

      <div className="mt-6 space-y-4">
        {isInviteJourney ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Create the account with the invited email so you can accept the organization invite.
          </p>
        ) : null}

        <label className="block text-sm font-medium text-slate-700">
          Full name
          <input
            type="text"
            placeholder="Patryk Sztuczka"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none"
            autoComplete="name"
            required
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Email
          <input
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none"
            autoComplete="email"
            readOnly={Boolean(invitedEmail)}
            required
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Password
          <input
            type="password"
            placeholder="Create a secure password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-500">
        You will need to verify your email before you can access the product.
      </p>

      {error ? (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {status ? (
        <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {status}
        </p>
      ) : null}

      <button
        type="submit"
        className="mt-6 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400"
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Creating account...' : 'Create account'}
      </button>

      <p className="mt-5 text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link
          to={`/sign-in?redirectTo=${encodeURIComponent(redirectTo)}${invitedEmail ? `&email=${encodeURIComponent(invitedEmail)}` : ''}`}
          className="font-medium text-emerald-700 transition hover:text-emerald-600"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
