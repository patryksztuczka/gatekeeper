import { ShieldCheck } from 'lucide-react';
import { Outlet } from 'react-router';

export function AuthLayout() {
  return (
    <main className="grid min-h-svh bg-background lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)',
            backgroundSize: '18px 18px',
          }}
        />

        <div className="relative flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="size-5" />
          <span>Gatekeeper</span>
        </div>

        <div className="relative flex flex-1 items-center justify-center py-12">
          <ShieldCheck className="size-40 opacity-90" strokeWidth={1.25} />
        </div>

        <div className="relative max-w-md space-y-3">
          <h2 className="text-3xl font-semibold tracking-tight">Release decisions, evidenced.</h2>
          <p className="text-sm text-primary-foreground/70">
            One system for checklists, controls, and exceptions — so every release is verified on
            evidence, not memory, and stays audit-ready.
          </p>
        </div>
      </aside>

      <div className="flex items-center justify-center px-6 py-12 sm:px-10">
        <Outlet />
      </div>
    </main>
  );
}
