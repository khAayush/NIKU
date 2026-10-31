import type { PushPublicKey } from '@todo/shared';
import { api } from '../api/client';

/** Web Push needs a service worker, the Push API and notifications. */
export const pushSupported =
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function base64UrlToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** This browser's current push subscription, if any. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

/** Asks for permission, subscribes this browser and registers it with the API. */
export async function subscribeToPush(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notifications are blocked for this site. Allow them in the browser settings.'
        : 'Notification permission was not granted.',
    );
  }
  const { publicKey } = await api<PushPublicKey>('/push/public-key');
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(publicKey),
    }));
  await api('/push/subscriptions', { method: 'POST', body: JSON.stringify(subscription.toJSON()) });
}

/** Unsubscribes this browser and removes it from the API. */
export async function unsubscribeFromPush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await api('/push/subscriptions', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  await subscription.unsubscribe();
}
