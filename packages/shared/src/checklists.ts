import { z } from 'zod';

export const CHECKLIST_TITLE_MAX = 100;
export const CHECKLIST_ITEM_MAX = 200;
/** Most items one checklist can hold. */
export const CHECKLIST_ITEMS_LIMIT = 200;

export const checklistItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  done: z.boolean(),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const checklistSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** In the order they were added; checked items stay in place. */
  items: z.array(checklistItemSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Checklist = z.infer<typeof checklistSchema>;

export const checklistInputSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(CHECKLIST_TITLE_MAX),
});
export type ChecklistInput = z.infer<typeof checklistInputSchema>;

export const createChecklistItemSchema = z.object({
  text: z.string().trim().min(1, 'Write something to add').max(CHECKLIST_ITEM_MAX),
});
export type CreateChecklistItemInput = z.infer<typeof createChecklistItemSchema>;

export const updateChecklistItemSchema = z
  .object({
    text: createChecklistItemSchema.shape.text,
    done: z.boolean(),
  })
  .partial()
  .refine((v) => v.text !== undefined || v.done !== undefined, 'Nothing to change');
export type UpdateChecklistItemInput = z.infer<typeof updateChecklistItemSchema>;
