import { useSyncExternalStore } from 'react';

/** iPhone, iPad or iPod (iPadOS reports itself as a Mac with a touch screen). */
export const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Safari on iOS (other iOS browsers have their own names in the user agent). */
export const isIOSSafari = isIOS && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(navigator.userAgent);

/** Running as the installed app (opened from the Home Screen / app list), not in a browser tab. */
export const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Registers the service worker (app-shell cache + push) and applies updates after a deploy. */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  let updated = false;

  navigator.serviceWorker
    .register('/sw.js', { updateViaCache: 'none' })
    .then((registration) => {
      // An installed app can stay open for days: look for a new version whenever it comes back.
      document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState !== 'visible') return;
        // A new version took over while the app was in use: reload now that the user is back,
        // rather than in the middle of typing.
        if (updated && (await pageIsOutdated())) window.location.reload();
        else void registration.update().catch(() => {});
      });
    })
    .catch((err) => console.warn('Service worker registration failed', err));

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // The first install isn't an update.
    if (hadController) updated = true;
  });
}

/**
 * Whether a newer build is deployed than the one running. The page's script name contains a
 * content hash, so it differs between builds. (A tab opened after the deploy is already new.)
 */
async function pageIsOutdated(): Promise<boolean> {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
  if (!script) return false;
  try {
    const html = await (await fetch('/', { cache: 'no-store' })).text();
    return !html.includes(new URL(script.src).pathname);
  } catch {
    return false; // offline: keep the running version
  }
}

// ---- Install prompt (Chrome, Edge, Samsung Internet) ----

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type InstallState = { prompt: BeforeInstallPromptEvent | null; installed: boolean };
let installState: InstallState = { prompt: null, installed: false };
const listeners = new Set<() => void>();

function setInstallState(next: Partial<InstallState>) {
  installState = { ...installState, ...next };
  listeners.forEach((l) => l());
}

// Listen from the start: the browser fires this once, often before the page that uses it renders.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // we show our own button on the Get the app page
  setInstallState({ prompt: e as BeforeInstallPromptEvent });
});
window.addEventListener('appinstalled', () => setInstallState({ prompt: null, installed: true }));

/** The browser's install prompt (null when it doesn't offer one) and whether we just installed. */
export function useInstallPrompt() {
  const state = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => installState,
  );

  async function install() {
    if (!state.prompt) return;
    await state.prompt.prompt();
    const { outcome } = await state.prompt.userChoice;
    // A prompt can only be used once.
    setInstallState({ prompt: null, installed: outcome === 'accepted' });
  }

  return { canInstall: Boolean(state.prompt), installed: state.installed, install };
}

// ---- Connection status ----

function subscribeOnline(listener: () => void) {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

/** False while the device has no network connection. */
export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine);
}
