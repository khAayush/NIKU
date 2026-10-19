import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { ME_KEY, signOut, useMe } from '../api/auth';
import { useLists } from '../api/tasks';
import { APP_NAME } from '../lib/app-name';
import { QuickAdd } from './QuickAdd';
import { ReminderToasts } from './ReminderToasts';

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
  `flex items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    active
      ? 'bg-neutral-950 text-white'
      : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950'
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
    <div className="min-h-dvh bg-white text-neutral-950 md:flex">
      <aside className="border-b border-neutral-200/80 bg-neutral-50/60 md:sticky md:top-0 md:flex md:h-dvh md:w-64 md:shrink-0 md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center justify-between px-5 py-5 md:px-6 md:pt-8 md:pb-6">
          <Link
            to="/today"
            className="text-[15px] font-semibold tracking-[0.35em] text-neutral-950"
          >
            {APP_NAME}
          </Link>
          <button
            onClick={onSignOut}
            className="text-sm text-neutral-500 hover:text-neutral-950 md:hidden"
          >
            Log out
          </button>
        </div>

        <form onSubmit={onSearch} className="hidden px-4 pb-4 md:block" role="search">
          <div className="relative">
            <svg
              viewBox="0 0 20 20"
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <circle cx="9" cy="9" r="5.5" />
              <path d="M13 13l3.5 3.5" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              aria-label="Search tasks by title"
              className="w-full rounded-lg border border-neutral-200 bg-white py-2 pr-3 pl-9 text-sm placeholder:text-neutral-400 focus:border-neutral-950 focus:ring-4 focus:ring-neutral-950/5 focus:outline-none"
            />
          </div>
        </form>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:px-4">
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

        <div className="hidden px-4 pt-4 pb-6 md:block">
          <div className="flex items-center justify-between px-3 pb-2 text-[11px] font-medium tracking-[0.15em] text-neutral-400 uppercase">
            Lists
            <Link
              to="/lists"
              className="tracking-normal text-neutral-500 normal-case hover:text-neutral-950"
            >
              Manage
            </Link>
          </div>
          {lists.map((l) => (
            <Link key={l.id} to={`/all?list=${l.id}`} className={itemClass(activeList === l.id)}>
              <span className="truncate">{l.name}</span>
              {l.openTaskCount > 0 && (
                <span className="text-xs text-neutral-400 tabular-nums">{l.openTaskCount}</span>
              )}
            </Link>
          ))}
          {!lists.length && <p className="px-3 text-xs text-neutral-400">No lists yet</p>}
        </div>

        {/* Account, pinned to the bottom of the sidebar on desktop. */}
        <div className="mt-auto hidden items-center gap-3 border-t border-neutral-200/80 px-6 py-5 md:flex">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-xs font-semibold text-white">
            {me?.name.trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-neutral-950">{me?.name}</div>
            <button onClick={onSignOut} className="text-xs text-neutral-500 hover:text-neutral-950">
              Log out
            </button>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <main
          className={`mx-auto w-full flex-1 px-5 py-8 md:px-12 md:py-12 ${location.pathname === '/calendar' ? 'max-w-7xl' : 'max-w-4xl'}`}
        >
          {QUICK_ADD_PAGES.includes(location.pathname) && <QuickAdd />}
          <Outlet />
        </main>
        <ReminderToasts />
      </div>
    </div>
  );
}
