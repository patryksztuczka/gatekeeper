import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { requestPasswordReset } from '../../features/auth/auth-api';
import { buildPasswordResetCallbackUrl } from '../../features/auth/auth-routing';

export function ForgotPasswordPage() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setStatus(null);
    setIsSubmitting(true);

    try {
      const response = await requestPasswordReset({
        email,
        redirectTo: buildPasswordResetCallbackUrl(window.location.origin),
      });

      setStatus(response.message);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Unable to request password reset.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <p className="text-xs uppercase">Password reset</p>
      <h2 className="mt-2 text-2xl font-bold">Forgot your password?</h2>
      <p className="mt-4 text-sm">Enter your email and we will send a reset link.</p>

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

        {error ? <p className="border border-red-700 bg-red-100 p-3 text-sm">{error}</p> : null}
        {status ? <p className="border border-green-700 bg-green-100 p-3 text-sm">{status}</p> : null}

        <button
          type="submit"
          className="border border-black bg-black px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Sending...' : 'Send reset link'}
        </button>
      </form>

      <p className="mt-5 text-sm">
        <Link to="/sign-in" className="underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
