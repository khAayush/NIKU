import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'error']),
  database: z.enum(['ok', 'error']),
  time: z.iso.datetime(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
