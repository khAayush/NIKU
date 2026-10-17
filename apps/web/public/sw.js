/* Service worker: shows reminder push notifications. No offline caching (not a PWA). */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

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
        icon: '/favicon.svg',
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
