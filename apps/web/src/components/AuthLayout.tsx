import type { ReactNode } from 'react';

/** Signed-out pages: black brand panel on wide screens, form on white. */
export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-white">
      <aside className="relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden bg-neutral-950 p-12 text-white lg:flex">
        <div className="text-[15px] font-semibold tracking-[0.35em]">NIKU</div>
        <div>
          <p className="text-4xl leading-tight font-semibold tracking-tight">
            Everything you need to do.
            <br />
            <span className="text-neutral-500">Nothing you don't.</span>
          </p>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-neutral-400">
            Tasks, reminders and a calendar, kept quietly in order.
          </p>
        </div>
        <p className="text-xs text-neutral-600">© Surgience LLC</p>
        {/* Soft concentric rings as a subtle texture. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 400 400"
          className="pointer-events-none absolute -right-32 -bottom-32 h-112 w-md text-white/6"
          fill="none"
          stroke="currentColor"
        >
          {[60, 100, 140, 180].map((r) => (
            <circle key={r} cx="200" cy="200" r={r} />
          ))}
        </svg>
      </aside>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-10 text-center text-[15px] font-semibold tracking-[0.35em] text-neutral-950 lg:hidden">
            NIKU
          </div>
          <h1 className="mb-8 text-3xl font-semibold tracking-tight text-neutral-950">{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}
