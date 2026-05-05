import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router';
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  LockKeyhole,
  RotateCcw,
  Trash2,
  UserPlus,
} from 'lucide-react';
import type { ProjectDetail } from '@/features/projects/api/project-api';
import {
  useProjectArchiveActions,
  useProjectAssignmentActions,
  useProjectAssignments,
  useProjectDetail,
  useProjectOwnerOptions,
  useProjectSettingsMutation,
} from '@/features/projects/api/project-workspace';
import {
  projectSettingsFormSchema,
  type ProjectSettingsFormValues,
} from '@/features/projects/schemas/project-form-schemas';
import { buildProjectPath, buildProjectsPath } from '@/features/projects/routing/project-routing';
import { humanizeAuthError } from '@/features/auth/api/auth-errors';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

export function ProjectSettingsPage() {
  const { organizationSlug = '', projectSlug = '' } = useParams();
  const [projectOverride, setProjectOverride] = useState<ProjectDetail | null>(null);
  const [newAssignmentMemberId, setNewAssignmentMemberId] = useState('');
  const [newAssignmentRole, setNewAssignmentRole] = useState<
    'project_contributor' | 'project_owner'
  >('project_contributor');
  const projectSettingsForm = useForm<ProjectSettingsFormValues>({
    resolver: zodResolver(projectSettingsFormSchema),
    defaultValues: { name: '', description: '' },
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const projectsPath = organizationSlug ? buildProjectsPath(organizationSlug) : '/';
  const hasProjectIdentity = Boolean(organizationSlug && projectSlug);

  const detailQuery = useProjectDetail({ organizationSlug, projectSlug });
  const projectOptions = useProjectOwnerOptions(organizationSlug);
  const assignmentsQuery = useProjectAssignments({
    enabled: projectOptions.canManageProjects,
    organizationSlug,
    projectSlug,
  });
  const updateProjectMutation = useProjectSettingsMutation({
    onError: (message) => {
      setSaveError(humanizeAuthError(null, message, 'Unable to save Project settings.'));
    },
    onSuccess: (response) => {
      const updatedProject = response.project;

      setProjectOverride(updatedProject);
      projectSettingsForm.reset({
        name: updatedProject.name,
        description: updatedProject.description,
      });
      setStatus('Project settings saved.');
    },
    organizationSlug,
    projectSlug,
  });
  const projectArchiveActions = useProjectArchiveActions({
    onArchived: (response) => {
      setProjectOverride(response.project);
      setStatus('Project archived.');
    },
    onError: (message) => {
      setSaveError(humanizeAuthError(null, message, 'Unable to update Project lifecycle.'));
    },
    onRestored: (response) => {
      setProjectOverride(response.project);
      setStatus('Project restored.');
    },
    organizationSlug,
  });
  const assignmentActions = useProjectAssignmentActions({
    onError: (message) => {
      setSaveError(humanizeAuthError(null, message, 'Unable to update Project Assignments.'));
    },
    onSuccess: (message) => {
      setNewAssignmentMemberId('');
      setNewAssignmentRole('project_contributor');
      setStatus(message);
    },
    organizationSlug,
    projectSlug,
  });

  const queryProject = detailQuery.data?.status === 'available' ? detailQuery.data.project : null;
  const project = projectOverride ?? queryProject;
  const members = projectOptions.members;
  const assignments = assignmentsQuery.data?.assignments ?? [];
  const assignedMemberIds = new Set(
    assignments.map((assignment) => assignment.organizationMemberId),
  );
  const assignableMembers = members.filter((member) => !assignedMemberIds.has(member.id));
  const loadError = detailQuery.error ?? projectOptions.error;
  const loadErrorMessage = loadError
    ? humanizeAuthError(null, loadError.message, 'Unable to load Project settings.')
    : null;
  const assignmentLoadErrorMessage = assignmentsQuery.error
    ? humanizeAuthError(null, assignmentsQuery.error.message, 'Unable to load Project Assignments.')
    : null;
  const isSaving = updateProjectMutation.isPending;
  const isArchiving = projectArchiveActions.isPending;
  const isAssignmentSaving = assignmentActions.isPending;
  const assignmentsLocked = Boolean(project?.archivedAt) || isAssignmentSaving;

  useEffect(() => {
    if (!queryProject) return;

    setProjectOverride(null);
    projectSettingsForm.reset({
      name: queryProject.name,
      description: queryProject.description,
    });
  }, [projectSettingsForm, queryProject]);

  const handleSave = (values: ProjectSettingsFormValues) => {
    if (!organizationSlug || !projectSlug || !projectOptions.canManageProjects) return;

    setSaveError(null);
    setStatus(null);
    updateProjectMutation.updateProjectSettings(values);
  };

  const handleArchiveStateChange = () => {
    if (!organizationSlug || !projectSlug || !projectOptions.canManageProjects || !project) return;

    setSaveError(null);
    setStatus(null);
    projectArchiveActions.setProjectArchived(projectSlug, !project.archivedAt);
  };

  const handleAddAssignment = () => {
    if (!newAssignmentMemberId || assignmentsLocked) return;

    setSaveError(null);
    setStatus(null);
    assignmentActions.addAssignment(newAssignmentMemberId, newAssignmentRole);
  };

  if (
    hasProjectIdentity &&
    (detailQuery.isPending ||
      projectOptions.isPending ||
      (projectOptions.canManageProjects && assignmentsQuery.isPending)) &&
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
  const canEdit = projectOptions.canManageProjects;

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
            Name and description can change. The slug remains immutable.
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
            <CardTitle>Project Assignments</CardTitle>
            <CardDescription>
              Manage Project visibility and the Project Owner role separately from Project details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {project.archivedAt ? (
              <Alert>
                <Archive className="size-4" />
                <AlertTitle>Assignments locked</AlertTitle>
                <AlertDescription>
                  Restore this Archived Project before changing Project Assignments.
                </AlertDescription>
              </Alert>
            ) : null}
            {assignmentLoadErrorMessage ? (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertTitle>Unable to load assignments</AlertTitle>
                <AlertDescription>{assignmentLoadErrorMessage}</AlertDescription>
              </Alert>
            ) : null}

            {assignmentLoadErrorMessage ? null : assignments.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                No Organization Members are assigned to this Project.
              </p>
            ) : (
              <div className="divide-y rounded-md border">
                {assignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="grid gap-3 p-4 md:grid-cols-[1fr_220px_auto] md:items-center"
                  >
                    <div>
                      <p className="text-sm font-medium">{assignment.name}</p>
                      <p className="text-xs text-muted-foreground">{assignment.email}</p>
                    </div>
                    <select
                      value={assignment.role}
                      disabled={assignmentsLocked}
                      onChange={(event) => {
                        setSaveError(null);
                        setStatus(null);
                        assignmentActions.updateAssignmentRole(
                          assignment.id,
                          event.target.value as 'project_contributor' | 'project_owner',
                        );
                      }}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                    >
                      <option value="project_contributor">Contributor</option>
                      <option value="project_owner">Project Owner</option>
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={assignmentsLocked}
                      onClick={() => {
                        setSaveError(null);
                        setStatus(null);
                        assignmentActions.removeAssignment(assignment.id);
                      }}
                    >
                      <Trash2 />
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {assignmentLoadErrorMessage ? null : (
              <div className="grid gap-3 rounded-md border p-4 md:grid-cols-[1fr_220px_auto] md:items-end">
                <div className="space-y-2">
                  <Label htmlFor="new-project-assignment-member">Organization Member</Label>
                  <select
                    id="new-project-assignment-member"
                    value={newAssignmentMemberId}
                    disabled={assignmentsLocked || assignableMembers.length === 0}
                    onChange={(event) => setNewAssignmentMemberId(event.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                  >
                    <option value="">
                      {assignableMembers.length === 0 ? 'All members assigned' : 'Select member'}
                    </option>
                    {assignableMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} ({member.email})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-project-assignment-role">Role</Label>
                  <select
                    id="new-project-assignment-role"
                    value={newAssignmentRole}
                    disabled={assignmentsLocked}
                    onChange={(event) =>
                      setNewAssignmentRole(
                        event.target.value as 'project_contributor' | 'project_owner',
                      )
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                  >
                    <option value="project_contributor">Contributor</option>
                    <option value="project_owner">Project Owner</option>
                  </select>
                </div>
                <Button
                  type="button"
                  disabled={assignmentsLocked || !newAssignmentMemberId}
                  onClick={handleAddAssignment}
                >
                  <UserPlus />
                  Add
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

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
