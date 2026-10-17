import { signInSchema } from '@todo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ME_KEY, signIn } from '../api/auth';
import { AuthLayout } from '../components/AuthLayout';
import { Alert, Button, Field, errorMessage, validate } from '../components/ui';

export function LoginPage() {
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/today';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { data, errors } = validate(signInSchema, values);
    setErrors(errors);
    setFormError('');
    if (!data) return;
    setBusy(true);
    try {
      await signIn(data);
      await queryClient.invalidateQueries({ queryKey: ME_KEY });
      navigate(from, { replace: true });
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Log in">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && <Alert>{formError}</Alert>}
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(e) => setValues({ ...values, email: e.target.value })}
          error={errors.email}
          autoFocus
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          value={values.password}
          onChange={(e) => setValues({ ...values, password: e.target.value })}
          error={errors.password}
        />
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
      <div className="mt-4 flex justify-between text-sm">
        <Link to="/forgot-password" className="text-indigo-600 hover:underline">
          Forgot password?
        </Link>
        <Link to="/signup" className="text-indigo-600 hover:underline">
          Create an account
        </Link>
      </div>
    </AuthLayout>
  );
}
