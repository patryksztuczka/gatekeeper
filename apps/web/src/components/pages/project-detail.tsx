import { Link, useParams } from 'react-router';
import { buildOrganizationPath } from '../../features/auth/auth-routing';
import { Button } from '@/components/ui/button';

export function ProjectDetailPage() {
  const { organizationSlug, projectSlug } = useParams();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">Project</p>
        <h1 className="text-2xl font-semibold tracking-tight">{projectSlug}</h1>
        <p className="text-sm text-muted-foreground">
          The Project detail view will expand in the next Project slice.
        </p>
      </header>
      {organizationSlug ? (
        <Button asChild variant="outline">
          <Link to={buildOrganizationPath(organizationSlug, '/projects')}>Back to Projects</Link>
        </Button>
      ) : null}
    </div>
  );
}
