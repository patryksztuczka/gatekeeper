import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router';
import { AlertCircle, Archive, CheckCircle2, LockKeyhole, RotateCcw } from 'lucide-react';
import type { ProjectDetail } from '@/features/projects/api/project-api';
import {
  projectSettingsFormSchema,
  type ProjectSettingsFormValues,
} from '@/features/projects/schemas/project-form-schemas';
import { buildProjectPath, buildProjectsPath } from '@/features/projects/routing/project-routing';
import { humanizeAuthError } from '@/features/auth/api/auth-errors';
import type { OrganizationMemberListItem } from '@/features/organizations/api/organization-api';
import { queryClient, trpc } from '@/lib/trpc';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

function canManageProjects(role: string | null) {
  return role === 'owner' || role === 'admin';
}

export function ProjectSettingsPage() {
  const { organizationSlug = '', projectSlug = '' } = useParams();
  const [projectOverride, setProjectOverride] = useState<ProjectDetail | null>(null);
  const projectSettingsForm = useForm<ProjectSettingsFormValues>({
    resolver: zodResolver(projectSettingsFormSchema),
    defaultValues: { name: '', description: '', projectOwnerMemberId: '' },
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const projectsPath = organizationSlug ? buildProjectsPath(organizationSlug) : '/';
  const hasProjectIdentity = Boolean(organizationSlug && projectSlug);

  const detailQuery = useQuery(
    trpc.projects.detail.queryOptions(
      { organizationSlug, projectSlug },
      { enabled: hasProjectIdentity },
    ),
  );
  const memberQuery = useQuery(
    trpc.organizations.members.queryOptions(
      { organizationSlug },
      { enabled: Boolean(organizationSlug) },
    ),
  );
  const resolutionQuery = useQuery(
    trpc.organizations.membershipResolution.queryOptions(undefined, {
      enabled: Boolean(organizationSlug),
    }),
  );
  const updateProjectMutation = useMutation(
    trpc.projects.update.mutationOptions({
      onSuccess: (response) => {
        void queryClient.invalidateQueries();
        const updatedProject = response.project;

        setProjectOverride(updatedProject);
        projectSettingsForm.reset({
          name: updatedProject.name,
          description: updatedProject.description,
          projectOwnerMemberId: updatedProject.projectOwner?.id ?? '',
        });
        setStatus('Project settings saved.');
      },
      onError: (caughtError) => {
        setSaveError(
          humanizeAuthError(null, caughtError.message, 'Unable to save Project settings.'),
        );
      },
    }),
  );
  const archiveProjectMutation = useMutation(
    trpc.projects.archive.mutationOptions({
      onSuccess: (response) => {
        void queryClient.invalidateQueries();
        setProjectOverride(response.project);
        setStatus('Project archived.');
      },
      onError: (caughtError) => {
        setSaveError(humanizeAuthError(null, caughtError.message, 'Unable to archive Project.'));
      },
    }),
  );
  const restoreProjectMutation = useMutation(
    trpc.projects.restore.mutationOptions({
      onSuccess: (response) => {
        void queryClient.invalidateQueries();
        setProjectOverride(response.project);
        setStatus('Project restored.');
      },
      onError: (caughtError) => {
        setSaveError(humanizeAuthError(null, caughtError.message, 'Unable to restore Project.'));
      },
    }),
  );

  const queryProject = detailQuery.data?.status === 'available' ? detailQuery.data.project : null;
  const project = projectOverride ?? queryProject;
  const members: OrganizationMemberListItem[] = memberQuery.data?.members ?? [];
  const organization = resolutionQuery.data?.organizations.find(
    (org) => org.slug === organizationSlug,
  );
  const currentRole = organization?.role ?? null;
  const loadError = detailQuery.error ?? memberQuery.error ?? resolutionQuery.error;
  const loadErrorMessage = loadError
    ? humanizeAuthError(null, loadError.message, 'Unable to load Project settings.')
    : null;
  const isSaving = updateProjectMutation.isPending;
  const isArchiving = archiveProjectMutation.isPending || restoreProjectMutation.isPending;

  useEffect(() => {
    if (!queryProject) return;

    setProjectOverride(null);
    projectSettingsForm.reset({
      name: queryProject.name,
      description: queryProject.description,
      projectOwnerMemberId: queryProject.projectOwner?.id ?? '',
    });
  }, [projectSettingsForm, queryProject]);

  const handleSave = (values: ProjectSettingsFormValues) => {
    if (!organizationSlug || !projectSlug || !canManageProjects(currentRole)) return;

    setSaveError(null);
    setStatus(null);
    updateProjectMutation.mutate({
      description: values.description,
      name: values.name,
      organizationSlug,
      projectOwnerMemberId: values.projectOwnerMemberId || null,
      projectSlug,
    });
  };

  const handleArchiveStateChange = () => {
    if (!organizationSlug || !projectSlug || !canManageProjects(currentRole) || !project) return;

    setSaveError(null);
    setStatus(null);

    if (project.archivedAt) {
      restoreProjectMutation.mutate({ organizationSlug, projectSlug });
    } else {
      archiveProjectMutation.mutate({ organizationSlug, projectSlug });
    }
  };

  if (
    hasProjectIdentity &&
    (detailQuery.isPending || memberQuery.isPending || resolutionQuery.isPending) &&
    !project
  ) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!project || detailQuery.data?.status === 'unavailable' || loadErrorMessage) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <Alert variant={loadErrorMessage ? 'destructive' : 'default'}>
          <AlertCircle className="size-4" />
          <AlertTitle>Project settings unavailable</AlertTitle>
          <AlertDescription>
            {loadErrorMessage ??
              'This Project could not be found, or you do not have access to it.'}
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline">
          <Link to={projectsPath}>Back to Projects</Link>
        </Button>
      </div>
    );
  }

  const projectPath = organizationSlug
    ? buildProjectPath(organizationSlug, project.slug)
    : projectsPath;
  const canEdit = canManageProjects(currentRole);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Project settings</h1>
          <p className="text-sm text-muted-foreground">
            Edit Project details without changing its Organization-local slug.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to={projectPath}>Back to Project</Link>
        </Button>
      </header>

      {project.archivedAt ? (
        <Alert>
          <Archive className="size-4" />
          <AlertTitle>Archived Project</AlertTitle>
          <AlertDescription>
            This Project is hidden from active work. Restore it to return it to active Projects.
          </AlertDescription>
        </Alert>
      ) : null}

      {!canEdit ? (
        <Alert>
          <LockKeyhole className="size-4" />
          <AlertTitle>Read-only settings</AlertTitle>
          <AlertDescription>
            Members can view Project information, but only Organization owners and admins can edit
            Project settings.
          </AlertDescription>
        </Alert>
      ) : null}
      {saveError ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Unable to save</AlertTitle>
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      ) : null}
      {status ? (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertTitle>Done</AlertTitle>
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>
            Name, description, and Project Owner can change. The slug remains immutable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={projectSettingsForm.handleSubmit(handleSave)}>
            <div className="space-y-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                {...projectSettingsForm.register('name')}
                disabled={!canEdit || isSaving}
              />
              {projectSettingsForm.formState.errors.name ? (
                <p className="text-sm text-destructive">
                  {projectSettingsForm.formState.errors.name.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-description">Description</Label>
              <Input
                id="project-description"
                {...projectSettingsForm.register('description')}
                disabled={!canEdit || isSaving}
              />
              {projectSettingsForm.formState.errors.description ? (
                <p className="text-sm text-destructive">
                  {projectSettingsForm.formState.errors.description.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-owner">Project Owner</Label>
              <select
                id="project-owner"
                {...projectSettingsForm.register('projectOwnerMemberId')}
                disabled={!canEdit || isSaving}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
              >
                <option value="">No Project Owner</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} ({member.email})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-slug">Slug</Label>
              <Input id="project-slug" value={project.slug} disabled />
              <p className="text-xs text-muted-foreground">
                Project URLs keep using this slug even if the name changes.
              </p>
            </div>
            {canEdit ? (
              <div className="flex justify-end">
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save Project'}
                </Button>
              </div>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle>{project.archivedAt ? 'Restore Project' : 'Archive Project'}</CardTitle>
            <CardDescription>
              {project.archivedAt
                ? 'Move this Project back to active work.'
                : 'Hide this Project from active work without deleting its record or URL.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant={project.archivedAt ? 'default' : 'outline'}
              disabled={isArchiving}
              onClick={handleArchiveStateChange}
            >
              {project.archivedAt ? <RotateCcw /> : <Archive />}
              {isArchiving
                ? project.archivedAt
                  ? 'Restoring...'
                  : 'Archiving...'
                : project.archivedAt
                  ? 'Restore Project'
                  : 'Archive Project'}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
