import { requestPasswordResetSchema } from '@todo/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { requestPasswordReset } from '../api/auth';
import { AuthLayout } from '../components/AuthLayout';
import { Alert, Button, Field, errorMessage, validate } from '../components/ui';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { data, errors } = validate(requestPasswordResetSchema, { email });
    setErrors(errors);
    setFormError('');
    if (!data) return;
    setBusy(true);
    try {
      await requestPasswordReset(data);
      setSent(true);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Reset your password">
      {sent ? (
        <Alert kind="success">
          If an account exists for {email}, we've sent a link to reset your password. It expires in
          30 minutes.
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {formError && <Alert>{formError}</Alert>}
          <p className="text-sm text-neutral-600">
            Enter your email and we'll send you a link to choose a new password.
          </p>
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            autoFocus
          />
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
      <p className="mt-4 text-center text-sm">
        <Link to="/login" className="text-neutral-950 hover:underline">
          Back to log in
        </Link>
      </p>
    </AuthLayout>
  );
}
