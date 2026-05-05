import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  AlertCircle,
  Archive,
  CalendarDays,
  FolderKanban,
  RotateCcw,
  UserRound,
} from 'lucide-react';
import {
  buildProjectSettingsPath,
  buildProjectsPath,
} from '@/features/projects/routing/project-routing';
import { ProjectChecklistsSection } from '@/features/checklists/components/project-checklists-section';
import {
  useProjectAccess,
  useProjectArchiveActions,
  useProjectDetail,
} from '@/features/projects/api/project-workspace';
import type { ProjectDetail } from '@/features/projects/api/project-api';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(new Date(value));
}

export function ProjectDetailPage() {
  const { organizationSlug = '', projectSlug = '' } = useParams();
  const [actionError, setActionError] = useState<string | null>(null);
  const projectsPath = organizationSlug ? buildProjectsPath(organizationSlug) : '/';
  const hasProjectIdentity = Boolean(organizationSlug && projectSlug);

  const detailQuery = useProjectDetail({ organizationSlug, projectSlug });
  const projectAccess = useProjectAccess(organizationSlug);
  const [restoredProject, setRestoredProject] = useState<ProjectDetail | null>(null);
  const projectArchiveActions = useProjectArchiveActions({
    onError: (message) => {
      setActionError(message || 'Unable to restore Project.');
    },
    onRestored: (response) => setRestoredProject(response.project),
    organizationSlug,
  });
  const result = restoredProject
    ? { status: 'available' as const, project: restoredProject }
    : detailQuery.data;

  if (
    hasProjectIdentity &&
    (detailQuery.isPending || projectAccess.isPending) &&
    !restoredProject
  ) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!result || result.status === 'unavailable' || detailQuery.error || projectAccess.error) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <Alert variant={detailQuery.error || projectAccess.error ? 'destructive' : 'default'}>
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

  const { project } = result;
  const settingsPath = organizationSlug
    ? buildProjectSettingsPath(organizationSlug, project.slug)
    : projectsPath;
  const canManage = projectAccess.canManageProjects;

  const handleRestore = () => {
    if (!organizationSlug || !projectSlug || !canManage) return;

    setActionError(null);
    projectArchiveActions.setProjectArchived(projectSlug, false);
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      {project.archivedAt ? (
        <Alert>
          <Archive className="size-4" />
          <AlertTitle>Archived Project</AlertTitle>
          <AlertDescription>
            This Project is hidden from active work. Its URL remains available for Organization
            members.
          </AlertDescription>
        </Alert>
      ) : null}
      {actionError ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Unable to restore</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}
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
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to={projectsPath}>All Projects</Link>
          </Button>
          {project.archivedAt && canManage ? (
            <Button
              type="button"
              variant="outline"
              disabled={projectArchiveActions.isPending}
              onClick={handleRestore}
            >
              <RotateCcw />
              Restore
            </Button>
          ) : null}
          <Button asChild>
            <Link to={settingsPath}>Project settings</Link>
          </Button>
        </div>
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

      <ProjectChecklistsSection
        canManage={canManage}
        currentMemberId={projectAccess.currentMemberId}
        organizationSlug={organizationSlug}
        projectArchived={Boolean(project.archivedAt)}
        projectOwnerAssignmentMemberId={project.projectOwner?.id ?? null}
        projectSlug={project.slug}
      />
    </div>
  );
}
