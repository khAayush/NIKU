import { Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { RedirectIfSignedIn, RequireAuth } from './components/RouteGuards';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LoginPage } from './pages/LoginPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { SettingsPage } from './pages/SettingsPage';
import { SignupPage } from './pages/SignupPage';

export function App() {
  return (
    <Routes>
      <Route element={<RedirectIfSignedIn />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="signup" element={<SignupPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
      </Route>
      {/* Reachable signed in or out: the link comes from an email. */}
      <Route path="reset-password" element={<ResetPasswordPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/today" replace />} />
          <Route path="today" element={<PlaceholderPage title="Today" />} />
          <Route path="overdue" element={<PlaceholderPage title="Overdue" />} />
          <Route path="calendar" element={<PlaceholderPage title="Calendar" />} />
          <Route path="all" element={<PlaceholderPage title="All tasks" />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<PlaceholderPage title="Page not found" />} />
        </Route>
      </Route>
    </Routes>
  );
}
