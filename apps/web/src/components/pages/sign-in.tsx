import { useState } from 'react';
import type { FormEvent } from 'react';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { getAuthErrorCode, getAuthErrorMessage } from '../../features/auth/auth-errors';
import { signIn } from '../../features/auth/auth-client';
import {
  buildSignUpLink,
  buildVerifyEmailLink,
} from '../../features/auth/auth-routing';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SignInPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/';
  const invitedEmail = searchParams.get('email') || '';
  const isInviteJourney = redirectTo.startsWith('/invite/');
  const [email, setEmail] = useState(invitedEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="w-full max-w-sm space-y-8">
      <div className="space-y-3 text-center">
        <div className="flex justify-center lg:hidden">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="size-5" />
          </div>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to your Gatekeeper account.
        </p>
      </div>

      {isInviteJourney ? (
        <p className="text-center text-sm text-muted-foreground">
          Sign in with the invited email to continue with this invite.
        </p>
      ) : null}

      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              to={`/forgot-password?email=${encodeURIComponent(email)}`}
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="pr-9"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link
          to={buildSignUpLink(redirectTo, invitedEmail || undefined)}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}
