import { Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { PlaceholderPage } from './pages/PlaceholderPage';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/today" replace />} />
        <Route path="today" element={<PlaceholderPage title="Today" />} />
        <Route path="overdue" element={<PlaceholderPage title="Overdue" />} />
        <Route path="calendar" element={<PlaceholderPage title="Calendar" />} />
        <Route path="all" element={<PlaceholderPage title="All tasks" />} />
        <Route path="settings" element={<PlaceholderPage title="Settings" />} />
        <Route path="*" element={<PlaceholderPage title="Page not found" />} />
      </Route>
    </Routes>
  );
}
