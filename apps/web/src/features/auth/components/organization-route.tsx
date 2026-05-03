import { useEffect, useState } from 'react';
import { Link, Navigate, Outlet, useParams } from 'react-router';
import { setActiveOrganization } from '@/features/auth/api/auth-api';
import { AuthGuardSkeleton } from './auth-guard-skeleton';
import type { MembershipResolutionResponse } from '@/features/organizations/api/organization-api';
import { queryClient, trpc } from '@/lib/trpc';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

type OrganizationRouteState =
  | { status: 'loading' }
  | { status: 'ready'; resolution: MembershipResolutionResponse }
  | { status: 'unavailable' }
  | { status: 'error' };

export function OrganizationRoute() {
  const { organizationSlug } = useParams();
  const [state, setState] = useState<OrganizationRouteState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function resolveOrganization() {
      if (!organizationSlug) {
        setState({ status: 'unavailable' });
        return;
      }

      setState({ status: 'loading' });

      try {
        const resolution = await queryClient.fetchQuery(
          trpc.organizations.membershipResolution.queryOptions(),
        );
        const organization = resolution.organizations.find((org) => org.slug === organizationSlug);

        if (!organization) {
          if (!cancelled) setState({ status: 'unavailable' });
          return;
        }

        if (resolution.activeOrganizationId !== organization.id) {
          await setActiveOrganization({ organizationId: organization.id });
          await queryClient.invalidateQueries();
        }

        if (!cancelled) {
          setState({
            status: 'ready',
            resolution: {
              ...resolution,
              activeOrganizationId: organization.id,
            },
          });
        }
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    }

    void resolveOrganization();

    return () => {
      cancelled = true;
    };
  }, [organizationSlug]);

  if (!organizationSlug) {
    return <Navigate to="/" replace />;
  }

  if (state.status === 'loading') {
    return <AuthGuardSkeleton />;
  }

  if (state.status === 'ready') {
    return <Outlet />;
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg space-y-4">
        <Alert variant="destructive">
          <AlertTitle>Organization unavailable</AlertTitle>
          <AlertDescription>
            You do not have access to this organization, or it does not exist.
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline">
          <Link to="/">Go to your organizations</Link>
        </Button>
      </div>
    </div>
  );
}
