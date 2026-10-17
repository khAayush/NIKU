import { z } from 'zod';

export const LIST_NAME_MAX = 50;

export const listSchema = z.object({
  id: z.string(),
  name: z.string(),
  openTaskCount: z.number().int(),
});
export type List = z.infer<typeof listSchema>;

export const listInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(LIST_NAME_MAX),
});
export type ListInput = z.infer<typeof listInputSchema>;
