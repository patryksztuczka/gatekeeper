import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { getAuthErrorCode, getAuthErrorMessage } from '../../features/auth/auth-errors';
import { signIn } from '../../features/auth/auth-client';
import {
  buildSignUpLink,
  buildVerifyEmailLink,
} from '../../features/auth/auth-routing';

export function SignInPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/';
  const invitedEmail = searchParams.get('email') || '';
  const isInviteJourney = redirectTo.startsWith('/invite/');
  const [email, setEmail] = useState(invitedEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const verifyEmailLink = buildVerifyEmailLink(email, redirectTo);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await signIn.email({
        email,
        password,
        rememberMe: false,
        callbackURL: `${window.location.origin}${redirectTo}`,
      });

      const code = getAuthErrorCode(result);
      const message = getAuthErrorMessage(result, 'Unable to sign in.');

      if (code === 'EMAIL_NOT_VERIFIED' || message === 'Email not verified') {
        navigate(verifyEmailLink);
        return;
      }

      if (message) {
        setError(message);
        return;
      }

      navigate(redirectTo);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Unable to sign in.';

      if (message === 'Email not verified') {
        navigate(verifyEmailLink);
        return;
      }

      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <p className="text-xs uppercase">Sign in</p>
      <h2 className="mt-2 text-2xl font-bold">Use an existing account</h2>

      {isInviteJourney ? (
        <p className="mt-4 border border-black bg-yellow-100 p-3 text-sm">
          Sign in with the invited email address to continue with this organization invite.
        </p>
      ) : null}

      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        <label className="block text-sm">
          <span className="font-bold">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 block w-full border border-black px-3 py-2"
            autoComplete="email"
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
            autoComplete="current-password"
            required
          />
        </label>

        {error ? <p className="border border-red-700 bg-red-100 p-3 text-sm">{error}</p> : null}

        <button
          type="submit"
          className="border border-black bg-black px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <div className="mt-5 space-y-2 text-sm">
        <p>
          <Link to={`/forgot-password?email=${encodeURIComponent(email)}`} className="underline">
            Forgot password?
          </Link>
        </p>
        <p>
          Need an account?{' '}
          <Link to={buildSignUpLink(redirectTo, invitedEmail || undefined)} className="underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
