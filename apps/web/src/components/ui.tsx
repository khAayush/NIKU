import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import { useId } from 'react';
import type { ZodType } from 'zod';
import { ApiRequestError } from '../api/client';

/** Shared look for text inputs and selects: hairline border, black focus, soft halo. */
export const inputClass =
  'mt-1.5 block w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm ' +
  'text-neutral-950 placeholder:text-neutral-400 transition-colors ' +
  'hover:border-neutral-300 focus:border-neutral-950 focus:outline-none focus:ring-4 focus:ring-neutral-950/5 ' +
  'aria-invalid:border-rose-400 disabled:bg-neutral-50 disabled:text-neutral-500';

const labelClass = 'block text-[13px] font-medium text-neutral-800';

export function Field({
  label,
  error,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input id={id} aria-invalid={error ? true : undefined} className={inputClass} {...props} />
      {error ? (
        <p className="mt-1.5 text-xs text-rose-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-neutral-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function SelectField({
  label,
  error,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <select id={id} aria-invalid={error ? true : undefined} className={inputClass} {...props}>
        {children}
      </select>
      {error && <p className="mt-1.5 text-xs text-rose-600">{error}</p>}
    </div>
  );
}

type Variant = 'primary' | 'secondary' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-neutral-950 text-white shadow-sm hover:bg-neutral-800',
  secondary:
    'border border-neutral-200 bg-white text-neutral-900 hover:border-neutral-300 hover:bg-neutral-50',
  danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700',
};

const sizes = {
  md: 'px-5 py-2.5',
  sm: 'px-4 py-2',
  /** Square button for a single icon; give it an aria-label. */
  icon: 'h-10 w-10',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof sizes }) {
  return (
    <button
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full text-sm font-medium tracking-tight transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Alert({
  kind = 'error',
  children,
}: {
  kind?: 'error' | 'success';
  children: ReactNode;
}) {
  const style =
    kind === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : 'border-neutral-200 bg-neutral-50 text-neutral-800';
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={`rounded-xl border px-3.5 py-2.5 text-sm ${style}`}
    >
      {children}
    </div>
  );
}

/** Validates form values with a shared Zod schema; returns the first message per field. */
export function validate<T>(schema: ZodType<T>, values: unknown) {
  const result = schema.safeParse(values);
  if (result.success) return { data: result.data, errors: {} as Record<string, string> };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? 'form');
    errors[key] ??= issue.message;
  }
  return { data: null, errors };
}

/** A user-facing message for a failed request. */
export function errorMessage(err: unknown) {
  if (err instanceof ApiRequestError) {
    if (err.status === 429) return 'Too many attempts. Please wait a while and try again.';
    return err.message;
  }
  return 'Something went wrong. Please check your connection and try again.';
}
