import { pushSubscriptionSchema, pushUnsubscribeSchema, type PushPublicKey } from '@todo/shared';
import type { FastifyInstance } from 'fastify';
import { currentUser } from '../auth/authenticate.js';
import { env } from '../lib/env.js';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { pushEnabled } from '../reminders/deliver.js';

/** Web Push opt-in: the VAPID public key and this browser's subscription. */
export async function pushRoutes(app: FastifyInstance) {
  const assertEnabled = () => {
    if (!pushEnabled)
      throw new AppError(404, 'PUSH_DISABLED', 'Push notifications are not configured');
  };

  app.get('/push/public-key', async (): Promise<PushPublicKey> => {
    assertEnabled();
    return { publicKey: env.VAPID_PUBLIC_KEY! };
  });

  app.post('/push/subscriptions', async (request, reply) => {
    assertEnabled();
    const { endpoint, keys } = pushSubscriptionSchema.parse(request.body);
    const userId = currentUser(request).id;
    // An endpoint identifies one browser; if another account used it before, it moves here.
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      update: { userId, p256dh: keys.p256dh, auth: keys.auth },
    });
    return reply.status(204).send();
  });

  app.delete('/push/subscriptions', async (request, reply) => {
    const { endpoint } = pushUnsubscribeSchema.parse(request.body);
    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: currentUser(request).id },
    });
    return reply.status(204).send();
  });
}
