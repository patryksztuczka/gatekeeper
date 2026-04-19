import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { signUp } from '../../lib/auth-client';

const getAuthErrorMessage = (result: unknown, fallback: string): string | null => {
  if (!result || typeof result !== 'object' || !('error' in result)) {
    return null;
  }

  const error = result.error;

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }

  return fallback;
};

export function SignUpPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
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
      const result = await signUp.email({
        name,
        email,
        password,
        callbackURL: `${window.location.origin}/sign-in`,
      });

      const message = getAuthErrorMessage(result, 'Unable to create account.');

      if (message) {
        setError(message);
        return;
      }

      setStatus('Account created. Check your inbox for the verification email before signing in.');
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Unable to create account.';
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
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Sign up</p>
      <h2 className="mt-2 text-2xl font-semibold">Create your Gatekeeper account</h2>

      <div className="mt-6 space-y-4">
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
        <Link to="/sign-in" className="font-medium text-emerald-700 transition hover:text-emerald-600">
          Sign in
        </Link>
      </p>
    </form>
  );
}
