import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import { useId, useState } from 'react';
import type { ZodType } from 'zod';
import { ApiRequestError, OfflineError } from '../api/client';

/** Shared look for text inputs and selects: hairline border, black focus, soft halo. */
export const inputClass =
  'mt-1.5 block w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm ' +
  'text-neutral-950 placeholder:text-neutral-400 transition-colors ' +
  'hover:border-neutral-300 focus:border-neutral-950 focus:outline-none focus:ring-4 focus:ring-neutral-950/5 ' +
  'aria-invalid:border-rose-400 disabled:bg-neutral-50 disabled:text-neutral-500';

const labelClass = 'block text-[13px] font-medium text-neutral-800';

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
      {crossed && <path d="M4 20 20 4" />}
    </svg>
  );
}

/** Text input with a label. Password inputs get a button to show or hide what's typed. */
export function Field({
  label,
  error,
  hint,
  type,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';
  const input = (
    <input
      id={id}
      type={isPassword && revealed ? 'text' : type}
      aria-invalid={error ? true : undefined}
      className={isPassword ? `${inputClass} pr-12` : inputClass}
      {...props}
    />
  );
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {isPassword ? (
        <div className="relative">
          {input}
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-pressed={revealed}
            aria-controls={id}
            disabled={props.disabled}
            className="absolute right-1.5 bottom-[5px] flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-950 disabled:pointer-events-none"
          >
            <EyeIcon crossed={revealed} />
          </button>
        </div>
      ) : (
        input
      )}
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
  if (err instanceof OfflineError) return err.message;
  if (err instanceof ApiRequestError) {
    if (err.status === 429) return 'Too many attempts. Please wait a while and try again.';
    return err.message;
  }
  return 'Something went wrong. Please check your connection and try again.';
}

/** Round checkbox (tasks, checklist items): a real input for keyboard and screen readers. */
export function RoundCheckbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <span className="relative mt-0.5 flex h-5 w-5 shrink-0">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-label={label}
        className="peer h-5 w-5 cursor-pointer appearance-none rounded-full border-[1.5px] border-neutral-300 transition-colors checked:border-neutral-950 checked:bg-neutral-950 hover:border-neutral-950"
      />
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 m-auto h-3 w-3 text-white opacity-0 peer-checked:opacity-100"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3.5 8.5l3 3 6-7" />
      </svg>
    </span>
  );
}
