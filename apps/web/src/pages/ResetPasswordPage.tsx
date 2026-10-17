import { PASSWORD_MIN_LENGTH, resetPasswordSchema } from '@todo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ME_KEY, resetPassword } from '../api/auth';
import { ApiRequestError } from '../api/client';
import { AuthLayout } from '../components/AuthLayout';
import { Alert, Button, Field, errorMessage, validate } from '../components/ui';

export function ResetPasswordPage() {
  const token = useSearchParams()[0].get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { data, errors } = validate(resetPasswordSchema, { token, newPassword });
    setErrors(errors);
    setFormError('');
    if (!data) return;
    setBusy(true);
    try {
      await resetPassword(data);
      // Every session was signed out by the reset, including this browser's.
      queryClient.setQueryData(ME_KEY, null);
      setDone(true);
    } catch (err) {
      setFormError(
        err instanceof ApiRequestError && err.status === 400
          ? 'This reset link is invalid or has expired. Please request a new one.'
          : errorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout title="Reset your password">
        <Alert>This reset link is incomplete. Please use the link from the email.</Alert>
        <p className="mt-4 text-center text-sm">
          <Link to="/forgot-password" className="text-indigo-600 hover:underline">
            Request a new link
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password">
      {done ? (
        <>
          <Alert kind="success">
            Your password has been changed and you've been signed out everywhere.
          </Alert>
          <p className="mt-4 text-center text-sm">
            <Link to="/login" className="text-indigo-600 hover:underline">
              Log in with your new password
            </Link>
          </p>
        </>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {formError && <Alert>{formError}</Alert>}
          <Field
            label="New password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            error={errors.newPassword}
            hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
            autoFocus
          />
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Saving…' : 'Set new password'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
