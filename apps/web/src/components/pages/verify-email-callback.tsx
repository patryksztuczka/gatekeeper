import { Link, useSearchParams } from 'react-router';
import {
  buildSignInLink,
  buildVerifyEmailLink,
  getVerificationCallbackState,
} from '../../features/auth/auth-routing';

export function VerifyEmailCallbackPage() {
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') || '';
  const redirectTo = searchParams.get('redirectTo') || '/';
  const callbackState = getVerificationCallbackState(searchParams.get('error'));

  if (callbackState === 'success') {
    return (
      <div>
        <p className="text-xs uppercase">Verification result</p>
        <h2 className="mt-2 text-2xl font-bold">Email verified</h2>
        <p className="mt-4 text-sm">Your account is verified. You can sign in now.</p>

        <p className="mt-5 text-sm">
          <Link to={buildSignInLink(redirectTo, email || undefined)} className="underline">
            Continue to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs uppercase">Verification result</p>
      <h2 className="mt-2 text-2xl font-bold">
        {callbackState === 'expired' ? 'Verification link expired' : 'Verification link is invalid'}
      </h2>
      <p className="mt-4 text-sm leading-6">
        {callbackState === 'expired'
          ? 'The email verification link is too old. Request a fresh one below.'
          : 'The verification link could not be used. Request another email and try again.'}
      </p>

      <div className="mt-5 space-y-2 text-sm">
        <p>
          <Link
            to={email ? buildVerifyEmailLink(email, redirectTo) : '/verify-email'}
            className="underline"
          >
            Resend verification email
          </Link>
        </p>
        <p>
          <Link to={buildSignInLink(redirectTo, email || undefined)} className="underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
