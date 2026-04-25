import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { AlertCircle, CheckCircle2, LockKeyhole } from 'lucide-react';
import {
  getProjectDetail,
  updateProjectSettings,
  type ProjectDetail,
} from '@/features/projects/project-api';
import { buildProjectPath, buildProjectsPath } from '@/features/projects/project-routing';
import {
  getMembershipResolution,
  listOrganizationMembers,
  type OrganizationMemberListItem,
} from '@/features/auth/auth-api';
import { humanizeAuthError } from '@/features/auth/auth-errors';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

type ProjectSettingsState =
  | { status: 'loading' }
  | { status: 'available'; project: ProjectDetail }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

function canManageProjects(role: string | null): boolean {
  return role === 'owner' || role === 'admin';
}

export function ProjectSettingsPage() {
  const { organizationSlug = '', projectSlug = '' } = useParams();
  const [state, setState] = useState<ProjectSettingsState>({ status: 'loading' });
  const [members, setMembers] = useState<OrganizationMemberListItem[]>([]);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [projectOwnerMemberId, setProjectOwnerMemberId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const projectsPath = organizationSlug ? buildProjectsPath(organizationSlug) : '/';

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      if (!organizationSlug || !projectSlug) {
        setState({ status: 'unavailable' });
        return;
      }

      setState({ status: 'loading' });
      setSaveError(null);
      setStatus(null);

      try {
        const [projectResult, memberResponse, resolution] = await Promise.all([
          getProjectDetail({ organizationSlug, projectSlug }),
          listOrganizationMembers(organizationSlug),
          getMembershipResolution(),
        ]);

        if (cancelled) return;

        if (projectResult.status === 'unavailable') {
          setState({ status: 'unavailable' });
          return;
        }

        const organization = resolution.organizations.find((org) => org.slug === organizationSlug);

        setMembers(memberResponse.members);
        setCurrentRole(organization?.role ?? null);
        setName(projectResult.project.name);
        setDescription(projectResult.project.description);
        setProjectOwnerMemberId(projectResult.project.projectOwner?.id ?? '');
        setState({ status: 'available', project: projectResult.project });
      } catch (caughtError) {
        if (cancelled) return;
        const rawMessage =
          caughtError instanceof Error ? caughtError.message : 'Unable to load Project settings.';
        setState({
          status: 'error',
          message: humanizeAuthError(null, rawMessage, 'Unable to load Project settings.'),
        });
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [organizationSlug, projectSlug]);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!organizationSlug || !projectSlug || !canManageProjects(currentRole)) return;

    setIsSaving(true);
    setSaveError(null);
    setStatus(null);

    try {
      const project = await updateProjectSettings({
        description,
        name,
        organizationSlug,
        projectOwnerMemberId: projectOwnerMemberId || null,
        projectSlug,
      });

      setState({ status: 'available', project });
      setName(project.name);
      setDescription(project.description);
      setProjectOwnerMemberId(project.projectOwner?.id ?? '');
      setStatus('Project settings saved.');
    } catch (caughtError) {
      const rawMessage =
        caughtError instanceof Error ? caughtError.message : 'Unable to save Project settings.';
      setSaveError(humanizeAuthError(null, rawMessage, 'Unable to save Project settings.'));
    } finally {
      setIsSaving(false);
    }
  };

  if (state.status === 'loading') {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (state.status === 'unavailable' || state.status === 'error') {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <Alert variant={state.status === 'error' ? 'destructive' : 'default'}>
          <AlertCircle className="size-4" />
          <AlertTitle>Project settings unavailable</AlertTitle>
          <AlertDescription>
            {state.status === 'error'
              ? state.message
              : 'This Project could not be found, or you do not have access to it.'}
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline">
          <Link to={projectsPath}>Back to Projects</Link>
        </Button>
      </div>
    );
  }

  const { project } = state;
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
          <form className="space-y-4" onSubmit={handleSave}>
            <div className="space-y-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={!canEdit || isSaving}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-description">Description</Label>
              <Input
                id="project-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={!canEdit || isSaving}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-owner">Project Owner</Label>
              <select
                id="project-owner"
                value={projectOwnerMemberId}
                onChange={(event) => setProjectOwnerMemberId(event.target.value)}
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
    </div>
  );
}
