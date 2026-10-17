import { useQueryClient } from '@tanstack/react-query';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { ME_KEY, signOut, useMe } from '../api/auth';
import { HealthBadge } from './HealthBadge';

const NAV = [
  { to: '/today', label: 'Today' },
  { to: '/overdue', label: 'Overdue' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/all', label: 'All tasks' },
  { to: '/settings', label: 'Settings' },
];

/** Desktop-first: sidebar on wide screens, top bar on phones. */
export function Layout() {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function onSignOut() {
    try {
      await signOut();
    } finally {
      queryClient.clear();
      queryClient.setQueryData(ME_KEY, null);
      navigate('/login', { replace: true });
    }
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 md:flex">
      <aside className="border-b border-slate-200 bg-white md:w-56 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex items-center justify-between px-4 py-4 md:block">
          <div className="text-lg font-semibold text-indigo-600">Tasks</div>
          <div className="flex items-center gap-3 text-sm md:mt-3 md:block">
            <div className="truncate text-slate-600 md:mb-1">{me?.name}</div>
            <button
              onClick={onSignOut}
              className="text-slate-500 hover:text-slate-800 hover:underline"
            >
              Log out
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-4">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ${
                  isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 md:px-8">
          <Outlet />
        </main>
        <footer className="px-4 py-3 text-xs text-slate-500 md:px-8">
          <HealthBadge />
        </footer>
      </div>
    </div>
  );
}
