import { Navigate, Outlet } from 'react-router';
import { useSession } from '@/features/auth/api/auth-client';
import { AuthGuardSkeleton } from './auth-guard-skeleton';

export function GuestOnlyRoute() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <AuthGuardSkeleton />;
  }

  if (session?.user) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
