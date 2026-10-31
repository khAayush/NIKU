import { useOnline } from '../lib/pwa';
import { Button } from './ui';

/** Full-page message when the app can't load: offline, or the server can't be reached. */
export function OfflineScreen({ onRetry }: { onRetry: () => void }) {
  const online = useOnline();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-white px-6 text-center">
      <div className="max-w-xs">
        <svg
          viewBox="0 0 64 64"
          aria-hidden="true"
          className="mx-auto mb-6 h-16 w-16 text-neutral-950"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* A cloud, crossed out when offline. */}
          <path d="M20 46h26a10 10 0 0 0 1-19.95A14 14 0 0 0 20.2 24 11 11 0 0 0 20 46z" />
          {!online && <path d="M12 12l40 40" />}
        </svg>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">
          {online ? "Can't reach the server" : "You're offline"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-500">
          {online
            ? 'It may be restarting. Try again in a moment.'
            : "Check your connection. Your tasks will be right here when you're back."}
        </p>
        <Button className="mt-6" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  );
}

/** Slim notice while the connection drops during use. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="mb-6 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm text-neutral-700"
    >
      You're offline. Nothing new will load or save until you're back online.
    </div>
  );
}
