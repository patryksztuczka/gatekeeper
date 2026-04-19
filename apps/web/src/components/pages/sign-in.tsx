import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { getAuthErrorMessage } from '../../features/auth/auth-errors';
import { signIn } from '../../features/auth/auth-client';

export function SignInPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/';
  const invitedEmail = searchParams.get('email') || '';
  const isInviteJourney = redirectTo.startsWith('/invite/');
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
      const result = await signIn.email({
        email,
        password,
        rememberMe: false,
        callbackURL: `${window.location.origin}${redirectTo}`,
      });

      const message = getAuthErrorMessage(result, 'Unable to sign in.');

      if (message) {
        setError(message);
        return;
      }

      setStatus('Signed in successfully. Redirecting...');
      navigate(redirectTo);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Unable to sign in.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/20 sm:p-7"
      onSubmit={handleSubmit}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium tracking-[0.2em] text-slate-400 uppercase">Sign in</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Welcome back</h2>
        </div>
        <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-medium text-sky-200">
          v1
        </span>
      </div>

      <div className="mt-6 space-y-4">
        {isInviteJourney ? (
          <p className="rounded-xl border border-sky-400/25 bg-sky-400/10 px-4 py-3 text-sm text-sky-100">
            Sign in with the invited account to accept this organization invite.
          </p>
        ) : null}

        <label className="block text-sm font-medium text-slate-200">
          Email
          <input
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
            autoComplete="email"
            required
          />
        </label>

        <label className="block text-sm font-medium text-slate-200">
          Password
          <input
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
            autoComplete="current-password"
            required
          />
        </label>
      </div>

      <div className="mt-4 flex items-center justify-end gap-4 text-sm text-slate-400">
        <a href="#" className="text-sky-300 transition hover:text-sky-200">
          Forgot password?
        </a>
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {status ? (
        <p className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
          {status}
        </p>
      ) : null}

      <button
        type="submit"
        className="mt-6 w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Signing in...' : 'Sign in'}
      </button>

      <p className="mt-5 text-center text-sm text-slate-400">
        New to Gatekeeper?{' '}
        <Link
          to={`/sign-up?redirectTo=${encodeURIComponent(redirectTo)}${invitedEmail ? `&email=${encodeURIComponent(invitedEmail)}` : ''}`}
          className="font-medium text-sky-300 transition hover:text-sky-200"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}
