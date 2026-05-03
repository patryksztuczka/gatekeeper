import { useLocation } from 'react-router';

const TITLES: Record<string, string> = {
  audit: 'Audit log',
  checklists: 'Checklists',
  controls: 'Controls',
  exceptions: 'Exceptions',
  projects: 'Projects',
};

export function StaticAppPage() {
  const location = useLocation();
  const section = location.pathname.split('/')[2] ?? '';
  const title = TITLES[section] ?? 'Workspace';

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          This organization-scoped area is ready for the next governance workflow.
        </p>
      </header>
    </div>
  );
}
