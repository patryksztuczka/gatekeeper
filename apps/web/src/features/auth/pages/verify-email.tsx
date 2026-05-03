import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';
import { sendVerificationEmail } from '@/features/auth/api/auth-api';
import {
  verifyEmailFormSchema,
  type VerifyEmailFormValues,
} from '@/features/auth/schemas/auth-form-schemas';
import {
  buildEmailVerificationCallbackUrl,
  buildSignInLink,
  buildSignUpLink,
} from '@/features/auth/routing/auth-routing';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/';
  const form = useForm<VerifyEmailFormValues>({
    resolver: zodResolver(verifyEmailFormSchema),
    defaultValues: { email: searchParams.get('email') || '' },
  });
  const email = form.watch('email');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (values: VerifyEmailFormValues) => {
    setError(null);
    setStatus(null);
    setIsSubmitting(true);

    try {
      await sendVerificationEmail({
        email: values.email,
        callbackURL: buildEmailVerificationCallbackUrl({
          email: values.email,
          origin: window.location.origin,
          redirectTo,
        }),
      });

      setStatus(
        'Verification email sent. Check your inbox and open the link from the same browser.',
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Unable to send verification email.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <p className="text-xs uppercase">Verify email</p>
      <h2 className="mt-2 text-2xl font-bold">Check your inbox</h2>
      <p className="mt-4 text-sm leading-6">
        Product access is blocked until the email address is verified. You can resend the link here.
      </p>

      <form className="mt-5 space-y-4" onSubmit={form.handleSubmit(handleSubmit)}>
        <label className="block text-sm">
          <span className="font-bold">Email</span>
          <input
            type="email"
            {...form.register('email')}
            className="mt-1 block w-full border border-black px-3 py-2"
            autoComplete="email"
          />
        </label>
        {form.formState.errors.email ? (
          <p className="border border-red-700 bg-red-100 p-3 text-sm">
            {form.formState.errors.email.message}
          </p>
        ) : null}

        {error ? <p className="border border-red-700 bg-red-100 p-3 text-sm">{error}</p> : null}
        {status ? (
          <p className="border border-green-700 bg-green-100 p-3 text-sm">{status}</p>
        ) : null}

        <button
          type="submit"
          className="border border-black bg-black px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Sending...' : 'Resend verification email'}
        </button>
      </form>

      <div className="mt-5 space-y-2 text-sm">
        <p>
          <Link to={buildSignInLink(redirectTo, email || undefined)} className="underline">
            Back to sign in
          </Link>
        </p>
        <p>
          Need to create the account first?{' '}
          <Link to={buildSignUpLink(redirectTo, email || undefined)} className="underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
