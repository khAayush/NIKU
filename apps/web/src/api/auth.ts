import type {
  DeleteAccountInput,
  Me,
  RequestPasswordResetInput,
  ResetPasswordInput,
  SignInInput,
  SignUpInput,
  UpdateMeInput,
} from '@todo/shared';
import { useQuery } from '@tanstack/react-query';
import { api, ApiRequestError } from './client';

const post = (path: string, body?: unknown) =>
  api<unknown>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });

export const signUp = (input: SignUpInput) => post('/auth/sign-up/email', input);
export const signIn = (input: SignInInput) => post('/auth/sign-in/email', input);
export const signOut = () => post('/auth/sign-out');
export const requestPasswordReset = (input: RequestPasswordResetInput) =>
  post('/auth/request-password-reset', input);
export const resetPassword = (input: ResetPasswordInput) => post('/auth/reset-password', input);
export const deleteAccount = (input: DeleteAccountInput) => post('/auth/delete-user', input);

export const getMe = () => api<Me>('/me');
export const updateMe = (input: UpdateMeInput) =>
  api<Me>('/me', { method: 'PATCH', body: JSON.stringify(input) });

export const ME_KEY = ['me'] as const;

/** The signed-in user, or null when signed out. */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await getMe();
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
  });
}

/** The browser's IANA timezone, e.g. "Europe/London". */
export const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
