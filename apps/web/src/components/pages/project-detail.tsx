import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { AlertCircle, CalendarDays, FolderKanban, UserRound } from 'lucide-react';
import { getProjectDetail, type ProjectDetail } from '@/features/projects/project-api';
import { buildProjectsPath } from '@/features/projects/project-routing';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type ProjectDetailState =
  | { status: 'loading' }
  | { status: 'available'; project: ProjectDetail }
  | { status: 'unavailable' }
  | { status: 'error' };

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(new Date(value));
}

export function ProjectDetailPage() {
  const { organizationSlug = '', projectSlug = '' } = useParams();
  const [state, setState] = useState<ProjectDetailState>({ status: 'loading' });
  const projectsPath = organizationSlug ? buildProjectsPath(organizationSlug) : '/';

  useEffect(() => {
    let cancelled = false;

    async function loadProject() {
      if (!organizationSlug || !projectSlug) {
        setState({ status: 'unavailable' });
        return;
      }

      setState({ status: 'loading' });

      try {
        const result = await getProjectDetail({ organizationSlug, projectSlug });
        if (!cancelled) setState(result);
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    }

    void loadProject();

    return () => {
      cancelled = true;
    };
  }, [organizationSlug, projectSlug]);

  if (state.status === 'loading') {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (state.status === 'unavailable' || state.status === 'error') {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <Alert variant={state.status === 'error' ? 'destructive' : 'default'}>
          <AlertCircle className="size-4" />
          <AlertTitle>Project unavailable</AlertTitle>
          <AlertDescription>
            This Project could not be found, or you do not have access to it.
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline">
          <Link to={projectsPath}>Back to Projects</Link>
        </Button>
      </div>
    );
  }

  const { project } = state;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <FolderKanban className="size-4" />
            Project overview
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">{project.name}</h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {project.description}
            </p>
          </div>
        </div>
        <Button asChild variant="outline">
          <Link to={projectsPath}>All Projects</Link>
        </Button>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="size-4 text-muted-foreground" />
              Project Owner
            </CardTitle>
            <CardDescription>Accountability for this Project.</CardDescription>
          </CardHeader>
          <CardContent>
            {project.projectOwner ? (
              <div className="space-y-1">
                <p className="font-medium">{project.projectOwner.name}</p>
                <p className="text-sm text-muted-foreground">{project.projectOwner.email}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No Project Owner assigned yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="size-4 text-muted-foreground" />
              Created
            </CardTitle>
            <CardDescription>Project record metadata.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{formatDate(project.createdAt)}</p>
            <p className="text-sm text-muted-foreground">Slug: {project.slug}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-dashed bg-muted/30">
        <CardHeader>
          <CardTitle>Governance work will appear here</CardTitle>
          <CardDescription>
            Controls, checklists, exceptions, and audit evidence will connect to this Project in
            future slices.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-background p-6 text-sm text-muted-foreground">
            This Project is ready. Start by adding governance workflows when those areas become
            available.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
