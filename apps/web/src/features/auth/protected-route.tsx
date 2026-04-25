import { Navigate, Outlet, useLocation } from 'react-router';
import { useSession } from './auth-client';
import { AuthGuardSkeleton } from './auth-guard-skeleton';
import { buildVerifyEmailLink } from './auth-routing';

export function ProtectedRoute() {
  const location = useLocation();
  const { data: session, isPending } = useSession();
  const redirectTo = `${location.pathname}${location.search}${location.hash}`;

  if (isPending) {
    return <AuthGuardSkeleton />;
  }

  if (!session?.user) {
    return <Navigate to={`/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`} replace />;
  }

  if (!session.user.emailVerified) {
    return <Navigate to={buildVerifyEmailLink(session.user.email, redirectTo)} replace />;
  }

  return <Outlet />;
}
