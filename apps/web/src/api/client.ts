import type { ApiError } from '@todo/shared';

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiError | null,
  ) {
    super(body?.error.message ?? `Request failed with status ${status}`);
  }
}

/** Thin JSON fetch wrapper for the API. Cookies are sent automatically (same origin). */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiRequestError(res.status, body as ApiError | null);
  return body as T;
}
