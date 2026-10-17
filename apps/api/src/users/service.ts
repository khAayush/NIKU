import type { Me, UpdateMeInput } from '@todo/shared';
import { notFound } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

const meSelect = {
  id: true,
  name: true,
  email: true,
  timezone: true,
  notifyInApp: true,
  notifyPush: true,
  notifyEmail: true,
  createdAt: true,
} as const;

type MeRow = Omit<Me, 'createdAt'> & { createdAt: Date };
const toMe = (row: MeRow): Me => ({ ...row, createdAt: row.createdAt.toISOString() });

export async function getMe(userId: string): Promise<Me> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: meSelect });
  if (!row) throw notFound('User not found');
  return toMe(row);
}

export async function updateMe(userId: string, input: UpdateMeInput): Promise<Me> {
  const row = await prisma.user.update({ where: { id: userId }, data: input, select: meSelect });
  return toMe(row);
}
