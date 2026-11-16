import { z } from 'zod';
export const healthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  database: z.enum(['connected', 'disconnected']),
});
export const healthInputSchema = z.object({
  query: z.strictObject({}),
  params: z.strictObject({}),
  body: z.undefined(),
});
