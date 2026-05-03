import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { resetPassword } from '../../features/auth/auth-api';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const errorCode = searchParams.get('error');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isInvalidLink = errorCode === 'INVALID_TOKEN' || !token;

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token) {
      setError('This reset link is not valid.');
      return;
    }

    setError(null);
    setStatus(null);
    setIsSubmitting(true);

    try {
      await resetPassword({ newPassword, token });
      setStatus('Password updated. You can sign in with the new password now.');
      setNewPassword('');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to reset password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isInvalidLink) {
    return (
      <div>
        <p className="text-xs uppercase">Reset password</p>
        <h2 className="mt-2 text-2xl font-bold">Reset link is invalid</h2>
        <p className="mt-4 text-sm">Request a new reset email and try again.</p>

        <div className="mt-5 space-y-2 text-sm">
          <p>
            <Link to="/forgot-password" className="underline">
              Request another reset link
            </Link>
          </p>
          <p>
            <Link to="/sign-in" className="underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs uppercase">Reset password</p>
      <h2 className="mt-2 text-2xl font-bold">Choose a new password</h2>

      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        <label className="block text-sm">
          <span className="font-bold">New password</span>
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="mt-1 block w-full border border-black px-3 py-2"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>

        {error ? <p className="border border-red-700 bg-red-100 p-3 text-sm">{error}</p> : null}
        {status ? (
          <p className="border border-green-700 bg-green-100 p-3 text-sm">{status}</p>
        ) : null}

        <button
          type="submit"
          className="border border-black bg-black px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Updating...' : 'Reset password'}
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
