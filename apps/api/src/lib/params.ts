import { z } from 'zod';
import { notFound } from './errors.js';

const idParams = z.object({ id: z.uuid() });

/** The `:id` route param; anything that isn't a UUID can't exist, so it's a 404. */
export function parseId(params: unknown, what = 'Not found'): string {
  const result = idParams.safeParse(params);
  if (!result.success) throw notFound(what);
  return result.data.id;
}
