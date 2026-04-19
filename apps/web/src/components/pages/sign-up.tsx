import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { getAuthErrorMessage } from '../../features/auth/auth-errors';
import { signUp } from '../../features/auth/auth-client';
import {
  buildEmailVerificationCallbackUrl,
  buildSignInLink,
  buildVerifyEmailLink,
} from '../../features/auth/auth-routing';

export function SignUpPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/';
  const invitedEmail = searchParams.get('email') || '';
  const isInviteJourney = redirectTo.startsWith('/invite/');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(invitedEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await signUp.email({
        name,
        email,
        password,
        callbackURL: buildEmailVerificationCallbackUrl({
          email,
          origin: window.location.origin,
          redirectTo,
        }),
      });

      const message = getAuthErrorMessage(result, 'Unable to create account.');

      if (message) {
        setError(message);
        return;
      }

      navigate(buildVerifyEmailLink(email, redirectTo));
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Unable to create account.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <p className="text-xs uppercase">Sign up</p>
      <h2 className="mt-2 text-2xl font-bold">Create a new account</h2>

      <p className="mt-4 text-sm">
        {isInviteJourney
          ? 'Create the invited account first. After email verification you can sign in and accept the invite.'
          : 'Direct sign-up creates your account first. Email verification is still required before product access.'}
      </p>

      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        <label className="block text-sm">
          <span className="font-bold">Full name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 block w-full border border-black px-3 py-2"
            autoComplete="name"
            required
          />
        </label>

        <label className="block text-sm">
          <span className="font-bold">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 block w-full border border-black px-3 py-2"
            autoComplete="email"
            readOnly={Boolean(invitedEmail)}
            required
          />
        </label>

        <label className="block text-sm">
          <span className="font-bold">Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 block w-full border border-black px-3 py-2"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>

        {error ? <p className="border border-red-700 bg-red-100 p-3 text-sm">{error}</p> : null}

        <button
          type="submit"
          className="border border-black bg-black px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <p className="mt-5 text-sm">
        Already have an account?{' '}
        <Link to={buildSignInLink(redirectTo, invitedEmail || undefined)} className="underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
