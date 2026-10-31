import { Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { AllTasksPage } from './pages/AllTasksPage';
import { CalendarPage } from './pages/CalendarPage';
import { ListsPage } from './pages/ListsPage';
import { OverduePage } from './pages/OverduePage';
import { TodayPage } from './pages/TodayPage';
import { RedirectIfSignedIn, RequireAuth } from './components/RouteGuards';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { GetAppPage } from './pages/GetAppPage';
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
          <Route path="today" element={<TodayPage />} />
          <Route path="overdue" element={<OverduePage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="all" element={<AllTasksPage />} />
          <Route path="lists" element={<ListsPage />} />
          <Route path="get-app" element={<GetAppPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<PlaceholderPage title="Page not found" />} />
        </Route>
      </Route>
    </Routes>
  );
}
