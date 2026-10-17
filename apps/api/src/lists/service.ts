import type { List } from '@todo/shared';
import { AppError, notFound } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

const withOpenCount = {
  _count: { select: { tasks: { where: { status: 'OPEN' as const } } } },
};

type ListRow = { id: string; name: string; _count: { tasks: number } };
const toList = (row: ListRow): List => ({
  id: row.id,
  name: row.name,
  openTaskCount: row._count.tasks,
});

async function assertNameFree(userId: string, name: string, exceptId?: string) {
  const clash = await prisma.list.findFirst({
    where: {
      userId,
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (clash) throw new AppError(409, 'LIST_NAME_TAKEN', `You already have a list called "${name}"`);
}

export async function listLists(userId: string): Promise<List[]> {
  const rows = await prisma.list.findMany({
    where: { userId },
    orderBy: { name: 'asc' },
    include: withOpenCount,
  });
  return rows.map(toList);
}

export async function createList(userId: string, name: string): Promise<List> {
  await assertNameFree(userId, name);
  const row = await prisma.list.create({ data: { userId, name }, include: withOpenCount });
  return toList(row);
}

export async function renameList(userId: string, id: string, name: string): Promise<List> {
  const existing = await prisma.list.findFirst({ where: { id, userId }, select: { id: true } });
  if (!existing) throw notFound('List not found');
  await assertNameFree(userId, name, id);
  const row = await prisma.list.update({ where: { id }, data: { name }, include: withOpenCount });
  return toList(row);
}

/** Deletes the list; its tasks move to "no list" (ON DELETE SET NULL). */
export async function deleteList(userId: string, id: string): Promise<void> {
  const { count } = await prisma.list.deleteMany({ where: { id, userId } });
  if (count === 0) throw notFound('List not found');
}

/** Throws unless `listId` is null or one of the user's lists. */
export async function assertOwnList(userId: string, listId: string | null | undefined) {
  if (!listId) return;
  const list = await prisma.list.findFirst({ where: { id: listId, userId }, select: { id: true } });
  if (!list) throw new AppError(400, 'INVALID_LIST', 'List not found');
}
