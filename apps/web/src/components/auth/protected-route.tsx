import { Navigate, Outlet } from 'react-router';
import { useSession } from '../../lib/auth-client';
import { AuthGuardSkeleton } from './auth-guard-skeleton';

export function ProtectedRoute() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <AuthGuardSkeleton />;
  }

  if (!session?.user) {
    return <Navigate to="/sign-in" replace />;
  }

  return <Outlet />;
}
