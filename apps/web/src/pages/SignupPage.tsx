import { PASSWORD_MIN_LENGTH, signUpSchema } from '@todo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ME_KEY, browserTimezone, signUp } from '../api/auth';
import { AuthLayout } from '../components/AuthLayout';
import { Alert, Button, Field, errorMessage, validate } from '../components/ui';

export function SignupPage() {
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { data, errors } = validate(signUpSchema, { ...values, timezone: browserTimezone() });
    setErrors(errors);
    setFormError(errors.timezone ? 'Your browser reported an unknown timezone.' : '');
    if (!data) return;
    setBusy(true);
    try {
      await signUp(data);
      await queryClient.invalidateQueries({ queryKey: ME_KEY });
      navigate('/today', { replace: true });
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Create your account">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && <Alert>{formError}</Alert>}
        <Field
          label="Name"
          autoComplete="name"
          value={values.name}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
          error={errors.name}
          autoFocus
        />
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(e) => setValues({ ...values, email: e.target.value })}
          error={errors.email}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={(e) => setValues({ ...values, password: e.target.value })}
          error={errors.password}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters. A long phrase is best.`}
        />
        <p className="text-xs text-slate-500">
          Timezone: {browserTimezone()} (you can change it later in Settings)
        </p>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Creating account…' : 'Sign up'}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link to="/login" className="text-indigo-600 hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
