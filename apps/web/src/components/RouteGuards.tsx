import { Link, Navigate, Outlet, useLocation } from 'react-router';
import { useMe } from '../api/auth';
import { APP_NAME } from '../lib/app-name';
import { Layout } from './Layout';
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

/**
 * Pages anyone can open (Get the app): inside the app for signed-in users, otherwise in a simple
 * page with a Log in button. Offline it still renders, since the content is static.
 */
export function PublicOrAppLayout() {
  const { data: me, isPending, unreachable } = useMeOrOffline();
  if (isPending && !unreachable) return <FullPageMessage text="Loading…" />;
  if (me) return <Layout />;
  return (
    <div className="min-h-dvh bg-white text-neutral-950">
      <header className="flex items-center justify-between border-b border-neutral-200/80 bg-neutral-50/60 px-5 py-4 md:px-12">
        <Link to="/login" className="text-[15px] font-semibold tracking-[0.35em] text-neutral-950">
          {APP_NAME}
        </Link>
        <Link
          to="/login"
          className="rounded-full bg-neutral-950 px-4 py-2 text-sm font-medium tracking-tight text-white shadow-sm transition hover:bg-neutral-800"
        >
          Log in
        </Link>
      </header>
      <main className="mx-auto w-full max-w-4xl px-5 py-8 md:px-12 md:py-12">
        <Outlet />
      </main>
    </div>
  );
}
