import type { ReactNode } from 'react';

/** Centered card used by the signed-out pages. */
export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center text-2xl font-semibold text-indigo-600">NIKU</div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="mb-4 text-lg font-semibold text-slate-900">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}
