import { Navigate, Outlet, useLocation } from 'react-router';
import { useMe } from '../api/auth';
import { OfflineScreen } from './OfflineScreen';

function FullPageMessage({ text }: { text: string }) {
  return <div className="flex min-h-dvh items-center justify-center text-neutral-500">{text}</div>;
}

/**
 * The signed-in user, plus whether they couldn't be loaded. TanStack Query pauses requests while
 * offline, so "paused" counts as offline rather than loading forever.
 */
function useMeOrOffline() {
  const query = useMe();
  // Only when there's nothing to show yet; a failed background refresh keeps the app on screen.
  const unreachable =
    query.data === undefined &&
    (query.isError || (query.isPending && query.fetchStatus === 'paused'));
  return { ...query, unreachable };
}

/** Renders child routes only for signed-in users; otherwise sends them to /login. */
export function RequireAuth() {
  const { data: me, isPending, unreachable, refetch } = useMeOrOffline();
  const location = useLocation();
  if (unreachable) return <OfflineScreen onRetry={() => void refetch()} />;
  if (isPending) return <FullPageMessage text="Loading…" />;
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Login/sign-up pages: signed-in users go straight to the app. */
export function RedirectIfSignedIn() {
  const { data: me, isPending, unreachable, refetch } = useMeOrOffline();
  if (unreachable) return <OfflineScreen onRetry={() => void refetch()} />;
  if (isPending) return <FullPageMessage text="Loading…" />;
  if (me) return <Navigate to="/today" replace />;
  return <Outlet />;
}
