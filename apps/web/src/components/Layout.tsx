import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { ME_KEY, signOut, useMe } from '../api/auth';
import { useLists } from '../api/tasks';
import { APP_NAME } from '../lib/app-name';
import { isStandalone } from '../lib/pwa';
import { OfflineBanner } from './OfflineScreen';
import { QuickAdd } from './QuickAdd';
import { ReminderToasts } from './ReminderToasts';

/** Pages that show the quick-add bar. */
const QUICK_ADD_PAGES = ['/today', '/overdue', '/calendar', '/all'];

const NAV = [
  { to: '/today', label: 'Today' },
  { to: '/overdue', label: 'Overdue' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/all', label: 'All tasks' },
  // Already running as the installed app: nothing to get.
  ...(isStandalone ? [] : [{ to: '/get-app', label: 'Get the app' }]),
  { to: '/settings', label: 'Settings' },
];

const itemClass = (active: boolean) =>
  `flex items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    active
      ? 'bg-neutral-950 text-white'
      : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950'
  }`;

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
    </svg>
  );
}

/** Desktop-first: sidebar on wide screens; on phones the same sidebar opens from a menu button. */
export function Layout() {
  const { data: me } = useMe();
  const { data: lists = [] } = useLists();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const activeList =
    location.pathname === '/all' ? new URLSearchParams(location.search).get('list') : null;
  const [search, setSearch] = useState('');
  // Phone menu (the sidebar slides in). Always shown on wide screens.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (menuOpen) {
      wasOpen.current = true;
      closeButton.current?.focus();
      // Keep the page behind the menu from scrolling.
      document.body.style.overflow = 'hidden';
      const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
      document.addEventListener('keydown', onKey);
      return () => {
        document.body.style.overflow = '';
        document.removeEventListener('keydown', onKey);
      };
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      menuButton.current?.focus();
    }
  }, [menuOpen]);

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
    setMenuOpen(false);
  }

  return (
    <div className="min-h-dvh bg-white text-neutral-950 md:flex">
      {/* Phone top bar. */}
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-neutral-200/80 bg-white/90 px-3 py-2.5 backdrop-blur md:hidden">
        <button
          ref={menuButton}
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-controls="app-menu"
          className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-950 hover:bg-neutral-100"
        >
          <MenuIcon open={false} />
        </button>
        <Link to="/today" className="text-[15px] font-semibold tracking-[0.35em] text-neutral-950">
          {APP_NAME}
        </Link>
      </header>

      {/* Dims the page behind the open phone menu; tapping it closes the menu. */}
      <div
        aria-hidden="true"
        onClick={() => setMenuOpen(false)}
        className={`fixed inset-0 z-30 bg-neutral-950/30 transition-opacity duration-200 md:hidden ${
          menuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        id="app-menu"
        aria-label="Menu"
        // Picking a page or list closes the phone menu.
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('a')) setMenuOpen(false);
        }}
        className={`fixed top-0 left-0 z-40 flex h-dvh w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-neutral-200/80 bg-neutral-50 shadow-xl transition-[translate,visibility] duration-200 ${
          menuOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'
        } md:visible md:sticky md:z-auto md:w-64 md:max-w-none md:shrink-0 md:translate-x-0 md:bg-neutral-50/60 md:shadow-none md:transition-none`}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-5 md:pt-8 md:pb-6">
          <Link
            to="/today"
            className="text-[15px] font-semibold tracking-[0.35em] text-neutral-950"
          >
            {APP_NAME}
          </Link>
          <button
            ref={closeButton}
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
            className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-neutral-950 hover:bg-neutral-100 md:hidden"
          >
            <MenuIcon open />
          </button>
        </div>

        <form onSubmit={onSearch} className="px-4 pb-4" role="search">
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

        <nav className="flex flex-col gap-1 px-4">
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

        <div className="px-4 pt-6 pb-6">
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

        {/* Account, pinned to the bottom of the sidebar. */}
        <div className="mt-auto flex items-center gap-3 border-t border-neutral-200/80 px-6 py-5">
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
          <OfflineBanner />
          {QUICK_ADD_PAGES.includes(location.pathname) && <QuickAdd />}
          <Outlet />
        </main>
        <ReminderToasts />
      </div>
    </div>
  );
}
