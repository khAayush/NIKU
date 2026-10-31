/*
 * The app's only service worker:
 * - caches the app shell (HTML, JS, CSS, fonts, icons) so the app opens fast and works offline
 *   far enough to say so. API responses (user data) are never cached.
 * - shows reminder push notifications.
 */

// Replaced at build time with { version, urls } (see vite.config.ts). In development it stays a
// string, which turns caching off.
const APP_SHELL = '__APP_SHELL__';
const CACHE_PREFIX = 'app-shell-';
const CACHE = typeof APP_SHELL === 'object' ? CACHE_PREFIX + APP_SHELL.version : null;
// How long a page load waits for the network before using the cached app.
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      if (CACHE) {
        const cache = await caches.open(CACHE);
        // `reload` skips the HTTP cache so a deploy never mixes old and new files.
        await cache.addAll(APP_SHELL.urls.map((url) => new Request(url, { cache: 'reload' })));
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop the previous deploy's files.
      for (const key of await caches.keys()) {
        if (key.startsWith(CACHE_PREFIX) && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  if (!CACHE) return;
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // User data: always straight to the network, never cached.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(openPage(request));
  } else if (url.pathname !== '/' && APP_SHELL.urls.includes(url.pathname)) {
    event.respondWith(fromCache(url.pathname, request));
  }
});

/**
 * Page loads: the network first, so a deploy shows up straight away. Offline, when the server
 * is down, or when the network is too slow, the cached app opens instead and shows that it's
 * offline.
 */
async function openPage(request) {
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    if (response.status < 500) return response;
  } catch {
    // Offline or timed out: fall through to the cache.
  }
  return (await caches.match('/', { cacheName: CACHE })) ?? offlinePage();
}

/** Build files: from the cache (their names change with their content), else the network. */
async function fromCache(path, request) {
  return (await caches.match(path, { cacheName: CACHE })) ?? fetch(request);
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Last resort when nothing is cached yet. */
function offlinePage() {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>You're offline</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;color:#0a0a0a;background:#fff;text-align:center;padding:24px">
<div><h1 style="font-size:24px;margin:0 0 8px">You're offline</h1>
<p style="color:#737373;margin:0 0 24px">Check your connection and try again.</p>
<button onclick="location.reload()" style="border:0;border-radius:999px;background:#0a0a0a;color:#fff;padding:12px 24px;font-size:14px">Try again</button></div>
</body></html>`;
  return new Response(html, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : '' };
  }

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // A focused tab with in-app reminders on already shows this reminder.
      if (data.inApp && windows.some((w) => w.focused && w.visibilityState === 'visible')) return;

      await self.registration.showNotification(data.title || 'Reminder', {
        body: data.dueLabel ? `Reminder · due ${data.dueLabel}` : 'Reminder',
        tag: data.taskId,
        renotify: true,
        icon: '/icons/icon-192.png',
        data: { url: data.url || '/today' },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/today';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
