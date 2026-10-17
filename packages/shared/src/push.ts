import { z } from 'zod';

/** A browser push subscription, as `PushSubscription.toJSON()` returns it. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const pushUnsubscribeSchema = z.object({ endpoint: z.url().max(2000) });

export const pushPublicKeySchema = z.object({ publicKey: z.string() });
export type PushPublicKey = z.infer<typeof pushPublicKeySchema>;

/** Payload of the Socket.IO `reminder` event and of push messages. */
export const reminderPayloadSchema = z.object({
  taskId: z.string(),
  title: z.string(),
  dueAt: z.string().nullable(),
  dueAllDay: z.boolean(),
  remindAt: z.string(),
  dueLabel: z.string().nullable(),
  url: z.string(),
});
export type ReminderPayload = z.infer<typeof reminderPayloadSchema>;
