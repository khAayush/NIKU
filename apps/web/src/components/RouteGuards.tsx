import { Navigate, Outlet, useLocation } from 'react-router';
import { useMe } from '../api/auth';

function FullPageMessage({ text }: { text: string }) {
  return <div className="flex min-h-dvh items-center justify-center text-neutral-500">{text}</div>;
}

/** Renders child routes only for signed-in users; otherwise sends them to /login. */
export function RequireAuth() {
  const { data: me, isPending, isError } = useMe();
  const location = useLocation();
  if (isPending) return <FullPageMessage text="Loading…" />;
  if (isError) return <FullPageMessage text="Can't reach the server. Please try again shortly." />;
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Login/sign-up pages: signed-in users go straight to the app. */
export function RedirectIfSignedIn() {
  const { data: me, isPending } = useMe();
  if (isPending) return <FullPageMessage text="Loading…" />;
  if (me) return <Navigate to="/today" replace />;
  return <Outlet />;
}
