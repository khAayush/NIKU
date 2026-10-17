import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { ME_KEY, signOut, useMe } from '../api/auth';
import { useLists } from '../api/tasks';
import { QuickAdd } from './QuickAdd';

/** Pages that show the quick-add bar. */
const QUICK_ADD_PAGES = ['/today', '/overdue', '/calendar', '/all'];

const NAV = [
  { to: '/today', label: 'Today' },
  { to: '/overdue', label: 'Overdue' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/all', label: 'All tasks' },
  { to: '/settings', label: 'Settings' },
];

const itemClass = (active: boolean) =>
  `flex items-center justify-between gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ${
    active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
  }`;

/** Desktop-first: sidebar on wide screens, top bar on phones. */
export function Layout() {
  const { data: me } = useMe();
  const { data: lists = [] } = useLists();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const activeList =
    location.pathname === '/all' ? new URLSearchParams(location.search).get('list') : null;
  const [search, setSearch] = useState('');

  async function onSignOut() {
    try {
      await signOut();
    } finally {
      queryClient.clear();
      queryClient.setQueryData(ME_KEY, null);
      navigate('/login', { replace: true });
    }
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    navigate(`/all?completed=1&q=${encodeURIComponent(q)}`);
    setSearch('');
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 md:flex">
      <aside className="border-b border-slate-200 bg-white md:sticky md:top-0 md:h-dvh md:w-60 md:shrink-0 md:overflow-y-auto md:border-r md:border-b-0">
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
        <form onSubmit={onSearch} className="hidden px-3 pb-3 md:block" role="search">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks…"
            aria-label="Search tasks by title"
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 focus:outline-none"
          />
        </form>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-4">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) => itemClass(isActive && !activeList)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden px-2 pb-6 md:block">
          <div className="flex items-center justify-between px-3 pb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">
            Lists
            <Link
              to="/lists"
              className="font-normal tracking-normal text-indigo-600 normal-case hover:underline"
            >
              Manage
            </Link>
          </div>
          {lists.map((l) => (
            <Link key={l.id} to={`/all?list=${l.id}`} className={itemClass(activeList === l.id)}>
              <span className="truncate">{l.name}</span>
              {l.openTaskCount > 0 && (
                <span className="text-xs text-slate-400">{l.openTaskCount}</span>
              )}
            </Link>
          ))}
          {!lists.length && <p className="px-3 text-xs text-slate-400">No lists yet</p>}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <main
          className={`mx-auto w-full flex-1 px-4 py-6 md:px-8 ${location.pathname === '/calendar' ? 'max-w-7xl' : 'max-w-4xl'}`}
        >
          {QUICK_ADD_PAGES.includes(location.pathname) && <QuickAdd />}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
