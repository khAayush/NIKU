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
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {subtitle && (
          <p className="mb-1.5 text-xs font-medium tracking-[0.15em] text-neutral-400 uppercase">
            {subtitle}
          </p>
        )}
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-950 md:text-4xl">
          {title}
        </h1>
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
    <p className="rounded-2xl border border-dashed border-neutral-200 px-4 py-12 text-center text-sm text-neutral-500">
      {children}
    </p>
  );
}

export function LoadError() {
  return <EmptyMessage>Couldn't load tasks. Please refresh the page.</EmptyMessage>;
}
