import { useMutation, useQuery } from '@tanstack/react-query';
import { queryClient, trpc, type RouterOutputs } from '@/lib/trpc';

type ProjectListStatus = 'active' | 'archived';

type ProjectCreateValues = {
  description: string;
  name: string;
  projectOwnerMemberId?: string | null;
  slug: string;
};

type ProjectSettingsValues = {
  description: string;
  name: string;
  projectOwnerMemberId?: string | null;
};

type ProjectMutationResult = RouterOutputs['projects']['create'];
type ProjectUpdateResult = RouterOutputs['projects']['update'];

export function canManageProjects(role: string | null) {
  return role === 'owner' || role === 'admin';
}

export function useProjectAccess(organizationSlug: string | undefined) {
  const hasOrganization = Boolean(organizationSlug);
  const resolutionQuery = useQuery(
    trpc.organizations.membershipResolution.queryOptions(undefined, { enabled: hasOrganization }),
  );
  const organization = resolutionQuery.data?.organizations.find(
    (org) => org.slug === organizationSlug,
  );
  const currentRole = organization?.role ?? null;

  return {
    canManageProjects: canManageProjects(currentRole),
    currentRole,
    error: resolutionQuery.error,
    isPending: hasOrganization && resolutionQuery.isPending,
  };
}

export function useProjectOwnerOptions(organizationSlug: string | undefined) {
  const hasOrganization = Boolean(organizationSlug);
  const access = useProjectAccess(organizationSlug);
  const memberQuery = useQuery(
    trpc.organizations.members.queryOptions(
      { organizationSlug: organizationSlug ?? '' },
      { enabled: hasOrganization },
    ),
  );

  return {
    ...access,
    error: memberQuery.error ?? access.error,
    isPending: hasOrganization && (memberQuery.isPending || access.isPending),
    members: memberQuery.data?.members ?? [],
  };
}

export function useProjectList(input: {
  organizationSlug: string | undefined;
  status: ProjectListStatus;
}) {
  const hasOrganization = Boolean(input.organizationSlug);

  return useQuery(
    trpc.projects.list.queryOptions(
      { organizationSlug: input.organizationSlug ?? '', status: input.status },
      { enabled: hasOrganization },
    ),
  );
}

export function useProjectDetail(input: {
  organizationSlug: string | undefined;
  projectSlug: string | undefined;
}) {
  const hasProjectIdentity = Boolean(input.organizationSlug && input.projectSlug);

  return useQuery(
    trpc.projects.detail.queryOptions(
      { organizationSlug: input.organizationSlug ?? '', projectSlug: input.projectSlug ?? '' },
      { enabled: hasProjectIdentity },
    ),
  );
}

export function useCreateProject(input: {
  onError?: (message: string) => void;
  onSuccess?: (response: ProjectMutationResult) => void;
  organizationSlug: string | undefined;
}) {
  const mutation = useMutation(
    trpc.projects.create.mutationOptions({
      onError: (caughtError) => {
        input.onError?.(caughtError.message);
      },
      onSuccess: (response) => {
        void queryClient.invalidateQueries();
        input.onSuccess?.(response);
      },
    }),
  );

  return {
    createProject: (values: ProjectCreateValues) => {
      if (!input.organizationSlug) return;

      mutation.mutate({
        description: values.description,
        name: values.name,
        organizationSlug: input.organizationSlug,
        projectOwnerMemberId: values.projectOwnerMemberId || null,
        slug: values.slug,
      });
    },
    isPending: mutation.isPending,
  };
}

export function useProjectSettingsMutation(input: {
  onError?: (message: string) => void;
  onSuccess?: (response: ProjectUpdateResult) => void;
  organizationSlug: string | undefined;
  projectSlug: string | undefined;
}) {
  const mutation = useMutation(
    trpc.projects.update.mutationOptions({
      onError: (caughtError) => {
        input.onError?.(caughtError.message);
      },
      onSuccess: (response) => {
        void queryClient.invalidateQueries();
        input.onSuccess?.(response);
      },
    }),
  );

  return {
    isPending: mutation.isPending,
    updateProjectSettings: (values: ProjectSettingsValues) => {
      if (!input.organizationSlug || !input.projectSlug) return;

      mutation.mutate({
        description: values.description,
        name: values.name,
        organizationSlug: input.organizationSlug,
        projectOwnerMemberId: values.projectOwnerMemberId || null,
        projectSlug: input.projectSlug,
      });
    },
  };
}

export function useProjectArchiveActions(input: {
  onArchived?: (response: ProjectUpdateResult) => void;
  onError?: (message: string) => void;
  onRestored?: (response: ProjectUpdateResult) => void;
  organizationSlug: string | undefined;
}) {
  const archiveMutation = useMutation(
    trpc.projects.archive.mutationOptions({
      onError: (caughtError) => {
        input.onError?.(caughtError.message);
      },
      onSuccess: (response) => {
        void queryClient.invalidateQueries();
        input.onArchived?.(response);
      },
    }),
  );
  const restoreMutation = useMutation(
    trpc.projects.restore.mutationOptions({
      onError: (caughtError) => {
        input.onError?.(caughtError.message);
      },
      onSuccess: (response) => {
        void queryClient.invalidateQueries();
        input.onRestored?.(response);
      },
    }),
  );

  return {
    isPending: archiveMutation.isPending || restoreMutation.isPending,
    setProjectArchived: (projectSlug: string, archived: boolean) => {
      if (!input.organizationSlug) return;

      const payload = { organizationSlug: input.organizationSlug, projectSlug };

      if (archived) {
        archiveMutation.mutate(payload);
      } else {
        restoreMutation.mutate(payload);
      }
    },
  };
}
