import {
  CHECKLIST_ITEMS_LIMIT,
  sortChecklists,
  type Checklist,
  type ChecklistItem,
} from '@todo/shared';
import { AppError, notFound } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

const withItems = {
  items: {
    // Two items added at the same moment can share a position; then creation time decides.
    orderBy: [{ position: 'asc' as const }, { createdAt: 'asc' as const }],
    select: { id: true, text: true, done: true },
  },
};

type ChecklistRow = {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  items: ChecklistItem[];
};

const toChecklist = (row: ChecklistRow): Checklist => ({
  id: row.id,
  title: row.title,
  items: row.items,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const NOT_FOUND = 'Checklist not found';

/** Throws 404 unless the checklist exists and belongs to the user. */
async function assertOwn(userId: string, id: string) {
  const found = await prisma.checklist.findFirst({ where: { id, userId }, select: { id: true } });
  if (!found) throw notFound(NOT_FOUND);
}

/** The user's checklists with their items: incomplete first, then completed; newest first in each. */
export async function listChecklists(userId: string): Promise<Checklist[]> {
  const rows = await prisma.checklist.findMany({ where: { userId }, include: withItems });
  return sortChecklists(rows.map(toChecklist));
}

export async function createChecklist(userId: string, title: string): Promise<Checklist> {
  return toChecklist(
    await prisma.checklist.create({ data: { userId, title }, include: withItems }),
  );
}

export async function renameChecklist(
  userId: string,
  id: string,
  title: string,
): Promise<Checklist> {
  await assertOwn(userId, id);
  return toChecklist(
    await prisma.checklist.update({ where: { id }, data: { title }, include: withItems }),
  );
}

export async function deleteChecklist(userId: string, id: string): Promise<void> {
  const { count } = await prisma.checklist.deleteMany({ where: { id, userId } });
  if (count === 0) throw notFound(NOT_FOUND);
}

/** Adds an item at the end of the checklist. */
export async function addItem(userId: string, checklistId: string, text: string) {
  await assertOwn(userId, checklistId);
  const { _count, _max } = await prisma.checklistItem.aggregate({
    where: { checklistId },
    _count: true,
    _max: { position: true },
  });
  if (_count >= CHECKLIST_ITEMS_LIMIT) {
    throw new AppError(
      409,
      'CHECKLIST_FULL',
      `A checklist can hold up to ${CHECKLIST_ITEMS_LIMIT} items`,
    );
  }
  const [item] = await prisma.$transaction([
    prisma.checklistItem.create({
      data: { checklistId, text, position: (_max.position ?? -1) + 1 },
      select: { id: true, text: true, done: true },
    }),
    // Keeps "recently changed" meaningful.
    prisma.checklist.update({ where: { id: checklistId }, data: { updatedAt: new Date() } }),
  ]);
  return item;
}

/** Changes an item's text and/or checks or unchecks it. */
export async function updateItem(
  userId: string,
  checklistId: string,
  itemId: string,
  data: { text?: string; done?: boolean },
): Promise<ChecklistItem> {
  await assertOwn(userId, checklistId);
  const { count } = await prisma.checklistItem.updateMany({
    where: { id: itemId, checklistId },
    data,
  });
  if (count === 0) throw notFound('Item not found');
  await prisma.checklist.update({ where: { id: checklistId }, data: { updatedAt: new Date() } });
  return prisma.checklistItem.findUniqueOrThrow({
    where: { id: itemId },
    select: { id: true, text: true, done: true },
  });
}

export async function deleteItem(userId: string, checklistId: string, itemId: string) {
  await assertOwn(userId, checklistId);
  const { count } = await prisma.checklistItem.deleteMany({ where: { id: itemId, checklistId } });
  if (count === 0) throw notFound('Item not found');
}
