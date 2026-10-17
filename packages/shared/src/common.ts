import { z } from 'zod';

/** Every non-2xx API response has this shape. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const prioritySchema = z.enum(PRIORITIES);
export type Priority = z.infer<typeof prioritySchema>;

export const RECURRENCES = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'] as const;
export const recurrenceSchema = z.enum(RECURRENCES);
export type Recurrence = z.infer<typeof recurrenceSchema>;

export const TASK_STATUSES = ['OPEN', 'COMPLETED'] as const;
export const taskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof taskStatusSchema>;
