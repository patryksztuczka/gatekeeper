import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, Archive, CheckCircle2, Plus, RotateCcw } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { humanizeAuthError } from '@/features/auth/api/auth-errors';
import { buildOrganizationPath, slugifyProjectName } from '@/features/auth/routing/auth-routing';
import type { OrganizationMemberListItem } from '@/features/organizations/api/organization-api';
import type { ProjectListItem } from '@/features/projects/api/project-api';
import {
  createProjectFormSchema,
  type CreateProjectFormValues,
} from '@/features/projects/schemas/project-form-schemas';
import { queryClient, trpc } from '@/lib/trpc';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function canCreateProjects(role: string | null) {
  return role === 'owner' || role === 'admin';
}

function isArchivedView(value: string | null) {
  return value === 'archived';
}

export function ProjectsPage() {
  const { organizationSlug } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const createProjectForm = useForm<CreateProjectFormValues>({
    resolver: zodResolver(createProjectFormSchema),
    defaultValues: { name: '', slug: '', description: '', projectOwnerMemberId: '' },
  });
  const archivedView = isArchivedView(searchParams.get('status'));
  const projectStatus = archivedView ? 'archived' : 'active';
  const hasOrganization = Boolean(organizationSlug);

  const projectQuery = useQuery(
    trpc.projects.list.queryOptions(
      { organizationSlug: organizationSlug ?? '', status: projectStatus },
      { enabled: hasOrganization },
    ),
  );
  const memberQuery = useQuery(
    trpc.organizations.members.queryOptions(
      { organizationSlug: organizationSlug ?? '' },
      { enabled: hasOrganization },
    ),
  );
  const resolutionQuery = useQuery(
    trpc.organizations.membershipResolution.queryOptions(undefined, { enabled: hasOrganization }),
  );
  const createProjectMutation = useMutation(
    trpc.projects.create.mutationOptions({
      onSuccess: (response) => {
        void queryClient.invalidateQueries();
        if (!organizationSlug) return;

        resetForm();
        setIsModalOpen(false);
        setStatus('Project created.');
        navigate(buildOrganizationPath(organizationSlug, `/p/${response.project.slug}`));
      },
      onError: (caughtError) => {
        setError(humanizeAuthError(null, caughtError.message, 'Unable to create Project.'));
      },
    }),
  );
  const archiveProjectMutation = useMutation(
    trpc.projects.archive.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries();
        setStatus('Project archived.');
      },
      onError: (caughtError) => {
        setError(humanizeAuthError(null, caughtError.message, 'Unable to archive Project.'));
      },
    }),
  );
  const restoreProjectMutation = useMutation(
    trpc.projects.restore.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries();
        setStatus('Project restored.');
      },
      onError: (caughtError) => {
        setError(humanizeAuthError(null, caughtError.message, 'Unable to restore Project.'));
      },
    }),
  );

  const projects = projectQuery.data?.projects ?? [];
  const members: OrganizationMemberListItem[] = memberQuery.data?.members ?? [];
  const organization = resolutionQuery.data?.organizations.find(
    (org) => org.slug === organizationSlug,
  );
  const currentRole = organization?.role ?? null;
  const loadError = projectQuery.error ?? memberQuery.error ?? resolutionQuery.error;
  const displayError =
    error ??
    (loadError ? humanizeAuthError(null, loadError.message, 'Unable to load Projects.') : null);
  const isLoading =
    hasOrganization &&
    (projectQuery.isPending || memberQuery.isPending || resolutionQuery.isPending);

  const resetForm = () => {
    createProjectForm.reset();
  };

  const handleCreateProject = (values: CreateProjectFormValues) => {
    if (!organizationSlug) return;

    setError(null);
    setStatus(null);
    createProjectMutation.mutate({
      description: values.description,
      name: values.name,
      organizationSlug,
      projectOwnerMemberId: values.projectOwnerMemberId || null,
      slug: values.slug,
    });
  };

  const handleArchiveStateChange = (project: ProjectListItem) => {
    if (!organizationSlug) return;

    setError(null);
    setStatus(null);

    if (archivedView) {
      restoreProjectMutation.mutate({ organizationSlug, projectSlug: project.slug });
    } else {
      archiveProjectMutation.mutate({ organizationSlug, projectSlug: project.slug });
    }
  };

  const canCreate = canCreateProjects(currentRole);
  const emptyTitle = archivedView ? 'No archived Projects' : 'No active Projects yet';
  const emptyDescription = archivedView
    ? 'Archived Projects will appear here after they are hidden from active work.'
    : 'Create the first Project to start organizing governance work for this Organization.';

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            {archivedView
              ? 'Review Archived Projects hidden from active work.'
              : 'Track active governance work for this Organization.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={archivedView ? 'outline' : 'default'}
            onClick={() => setSearchParams({})}
          >
            Active
          </Button>
          <Button
            type="button"
            variant={archivedView ? 'default' : 'outline'}
            onClick={() => setSearchParams({ status: 'archived' })}
          >
            Archived
          </Button>
          {canCreate && !archivedView ? (
            <Button type="button" onClick={() => setIsModalOpen(true)}>
              <Plus />
              Create Project
            </Button>
          ) : null}
        </div>
      </header>

      {displayError ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{displayError}</AlertDescription>
        </Alert>
      ) : null}
      {status ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Done</AlertTitle>
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading Projects...</p>
      ) : projects.length === 0 ? (
        <section className="rounded-xl border border-dashed p-8 text-center">
          <h2 className="text-lg font-medium">{emptyTitle}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{emptyDescription}</p>
          {canCreate && !archivedView ? (
            <Button className="mt-4" type="button" onClick={() => setIsModalOpen(true)}>
              Create Project
            </Button>
          ) : null}
        </section>
      ) : (
        <section className="grid gap-3">
          {projects.map((project) => (
            <article key={project.id} className="rounded-xl border bg-card p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <Link
                    to={
                      organizationSlug
                        ? buildOrganizationPath(organizationSlug, `/p/${project.slug}`)
                        : '#'
                    }
                    className="text-base font-semibold hover:underline"
                  >
                    {project.name}
                  </Link>
                  <p className="text-sm text-muted-foreground">{project.description}</p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">
                  {archivedView && project.archivedAt
                    ? `Archived ${formatDate(project.archivedAt)}`
                    : `Created ${formatDate(project.createdAt)}`}
                </p>
              </div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Project Owner:{' '}
                  {project.projectOwner
                    ? `${project.projectOwner.name} (${project.projectOwner.email})`
                    : 'Not assigned'}
                </p>
                {canCreate ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={archiveProjectMutation.isPending || restoreProjectMutation.isPending}
                    onClick={() => handleArchiveStateChange(project)}
                  >
                    {archivedView ? <RotateCcw /> : <Archive />}
                    {archivedView ? 'Restore' : 'Archive'}
                  </Button>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      )}

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-lg">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Create Project</h2>
              <p className="text-sm text-muted-foreground">
                Add a Project for this Organization. The slug can be edited before creation.
              </p>
            </div>
            <form
              className="mt-6 space-y-4"
              onSubmit={createProjectForm.handleSubmit(handleCreateProject)}
            >
              <div className="space-y-2">
                <Label htmlFor="project-name">Name</Label>
                <Input
                  id="project-name"
                  {...createProjectForm.register('name')}
                  onChange={(event) => {
                    createProjectForm.setValue('name', event.target.value, {
                      shouldValidate: true,
                    });
                    createProjectForm.setValue('slug', slugifyProjectName(event.target.value), {
                      shouldValidate: true,
                    });
                  }}
                />
                {createProjectForm.formState.errors.name ? (
                  <p className="text-sm text-destructive">
                    {createProjectForm.formState.errors.name.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-slug">Slug</Label>
                <Input
                  id="project-slug"
                  {...createProjectForm.register('slug', {
                    onChange: (event) => {
                      createProjectForm.setValue('slug', slugifyProjectName(event.target.value), {
                        shouldValidate: true,
                      });
                    },
                  })}
                />
                {createProjectForm.formState.errors.slug ? (
                  <p className="text-sm text-destructive">
                    {createProjectForm.formState.errors.slug.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-description">Description</Label>
                <Input id="project-description" {...createProjectForm.register('description')} />
                {createProjectForm.formState.errors.description ? (
                  <p className="text-sm text-destructive">
                    {createProjectForm.formState.errors.description.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-owner">Project Owner</Label>
                <select
                  id="project-owner"
                  {...createProjectForm.register('projectOwnerMemberId')}
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
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsModalOpen(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createProjectMutation.isPending}>
                  {createProjectMutation.isPending ? 'Creating...' : 'Create Project'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
