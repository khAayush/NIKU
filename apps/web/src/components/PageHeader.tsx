import type { ReactNode } from 'react';
import { Button } from './ui';

export function PageHeader({
  title,
  subtitle,
  onAdd,
  children,
}: {
  title: string;
  subtitle?: string;
  onAdd?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {children}
        {onAdd && <Button onClick={onAdd}>+ Add task</Button>}
      </div>
    </div>
  );
}

export function EmptyMessage({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
      {children}
    </p>
  );
}

export function LoadError() {
  return <EmptyMessage>Couldn't load tasks. Please refresh the page.</EmptyMessage>;
}
