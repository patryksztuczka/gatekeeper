import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Plus } from 'lucide-react';
import { useParams } from 'react-router';
import {
  createDraftControl,
  listDraftControls,
  type DraftControlListItem,
} from '../../features/auth/auth-api';
import { humanizeAuthError } from '../../features/auth/auth-errors';
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

export function ControlsPage() {
  const { organizationSlug } = useParams();
  const [draftControls, setDraftControls] = useState<DraftControlListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [controlCode, setControlCode] = useState('');
  const [title, setTitle] = useState('');

  useEffect(() => {
    const refresh = async () => {
      if (!organizationSlug) return;

      setIsLoading(true);
      setError(null);
      try {
        const response = await listDraftControls(organizationSlug);
        setDraftControls(response.draftControls);
      } catch (caughtError) {
        const rawMessage =
          caughtError instanceof Error ? caughtError.message : 'Unable to load Draft Controls.';
        setError(humanizeAuthError(null, rawMessage, 'Unable to load Draft Controls.'));
      } finally {
        setIsLoading(false);
      }
    };

    void refresh();
  }, [organizationSlug]);

  const handleCreateDraftControl = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organizationSlug) return;

    setIsCreating(true);
    setError(null);
    setStatus(null);
    try {
      const response = await createDraftControl(organizationSlug, { controlCode, title });
      setDraftControls((currentDrafts) => [...currentDrafts, response.draftControl]);
      setControlCode('');
      setTitle('');
      setStatus('Draft Control saved.');
    } catch (caughtError) {
      const rawMessage =
        caughtError instanceof Error ? caughtError.message : 'Unable to save Draft Control.';
      setError(humanizeAuthError(null, rawMessage, 'Unable to save Draft Control.'));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Controls</h1>
        <p className="text-sm text-muted-foreground">
          Save Draft Controls before they are ready for the Control Library.
        </p>
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

      <section className="rounded-xl border bg-card p-5">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Create Draft Control</h2>
          <p className="text-sm text-muted-foreground">
            Only Control Code and title are required while a Control is still a draft.
          </p>
        </div>
        <form
          className="mt-5 grid gap-4 sm:grid-cols-[12rem_1fr_auto]"
          onSubmit={handleCreateDraftControl}
        >
          <div className="space-y-2">
            <Label htmlFor="control-code">Control Code</Label>
            <Input
              id="control-code"
              value={controlCode}
              onChange={(event) => setControlCode(event.target.value)}
              placeholder="AUTH-001"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="control-title">Title</Label>
            <Input
              id="control-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Require multi-factor authentication"
              required
            />
          </div>
          <Button className="self-end" type="submit" disabled={isCreating}>
            <Plus />
            {isCreating ? 'Saving...' : 'Save Draft'}
          </Button>
        </form>
      </section>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading Draft Controls...</p>
      ) : draftControls.length === 0 ? (
        <section className="rounded-xl border border-dashed p-8 text-center">
          <h2 className="text-lg font-medium">No Draft Controls yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Draft Controls you can access will appear here after they are saved.
          </p>
        </section>
      ) : (
        <section className="grid gap-3">
          {draftControls.map((draftControl) => (
            <article key={draftControl.id} className="rounded-xl border bg-card p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {draftControl.controlCode}
                  </p>
                  <h2 className="text-base font-semibold">{draftControl.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    Author: {draftControl.author.name} ({draftControl.author.email})
                  </p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">
                  Saved {formatDate(draftControl.createdAt)}
                </p>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
