import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Plus } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  createProject,
  getMembershipResolution,
  listOrganizationMembers,
  listProjects,
  type OrganizationMemberListItem,
  type ProjectListItem,
} from '../../features/auth/auth-api';
import { humanizeAuthError } from '../../features/auth/auth-errors';
import { buildOrganizationPath, slugifyProjectName } from '../../features/auth/auth-routing';
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

function canCreateProjects(role: string | null): boolean {
  return role === 'owner' || role === 'admin';
}

export function ProjectsPage() {
  const { organizationSlug } = useParams();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [members, setMembers] = useState<OrganizationMemberListItem[]>([]);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [slug, setSlug] = useState('');
  const [projectOwnerMemberId, setProjectOwnerMemberId] = useState('');

  useEffect(() => {
    const refresh = async () => {
      if (!organizationSlug) return;

      setIsLoading(true);
      setError(null);
      try {
        const [projectResponse, memberResponse, resolution] = await Promise.all([
          listProjects(organizationSlug),
          listOrganizationMembers(organizationSlug),
          getMembershipResolution(),
        ]);
        const organization = resolution.organizations.find((org) => org.slug === organizationSlug);

        setProjects(projectResponse.projects);
        setMembers(memberResponse.members);
        setCurrentRole(organization?.role ?? null);
      } catch (caughtError) {
        const rawMessage =
          caughtError instanceof Error ? caughtError.message : 'Unable to load Projects.';
        setError(humanizeAuthError(null, rawMessage, 'Unable to load Projects.'));
      } finally {
        setIsLoading(false);
      }
    };

    void refresh();
  }, [organizationSlug]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setSlug('');
    setProjectOwnerMemberId('');
  };

  const handleCreateProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationSlug) return;

    setIsCreating(true);
    setError(null);
    setStatus(null);
    try {
      const response = await createProject(organizationSlug, {
        description,
        name,
        projectOwnerMemberId: projectOwnerMemberId || null,
        slug,
      });
      resetForm();
      setIsModalOpen(false);
      setStatus('Project created.');
      navigate(buildOrganizationPath(organizationSlug, `/p/${response.project.slug}`));
    } catch (caughtError) {
      const rawMessage =
        caughtError instanceof Error ? caughtError.message : 'Unable to create Project.';
      setError(humanizeAuthError(null, rawMessage, 'Unable to create Project.'));
    } finally {
      setIsCreating(false);
    }
  };

  const canCreate = canCreateProjects(currentRole);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Track active governance work for this Organization.
          </p>
        </div>
        {canCreate ? (
          <Button type="button" onClick={() => setIsModalOpen(true)}>
            <Plus />
            Create Project
          </Button>
        ) : null}
      </header>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
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
          <h2 className="text-lg font-medium">No active Projects yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Create the first Project to start organizing governance work for this Organization.
          </p>
          {canCreate ? (
            <Button className="mt-4" type="button" onClick={() => setIsModalOpen(true)}>
              Create Project
            </Button>
          ) : null}
        </section>
      ) : (
        <section className="grid gap-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              to={
                organizationSlug
                  ? buildOrganizationPath(organizationSlug, `/p/${project.slug}`)
                  : '#'
              }
              className="rounded-xl border bg-card p-5 transition-colors hover:bg-muted/40"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <h2 className="text-base font-semibold">{project.name}</h2>
                  <p className="text-sm text-muted-foreground">{project.description}</p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">
                  Created {formatDate(project.createdAt)}
                </p>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Project Owner:{' '}
                {project.projectOwner
                  ? `${project.projectOwner.name} (${project.projectOwner.email})`
                  : 'Not assigned'}
              </p>
            </Link>
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
            <form className="mt-6 space-y-4" onSubmit={handleCreateProject}>
              <div className="space-y-2">
                <Label htmlFor="project-name">Name</Label>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setSlug(slugifyProjectName(event.target.value));
                  }}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-slug">Slug</Label>
                <Input
                  id="project-slug"
                  value={slug}
                  onChange={(event) => setSlug(slugifyProjectName(event.target.value))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-description">Description</Label>
                <Input
                  id="project-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-owner">Project Owner</Label>
                <select
                  id="project-owner"
                  value={projectOwnerMemberId}
                  onChange={(event) => setProjectOwnerMemberId(event.target.value)}
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
                <Button type="submit" disabled={isCreating}>
                  {isCreating ? 'Creating...' : 'Create Project'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
