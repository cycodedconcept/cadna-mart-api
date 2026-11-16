import { Router } from 'express';
import { prisma } from '@/lib/prisma.js';
import { version } from '@/config/version.js';
import { validate } from '@/middleware/validate.js';
import { healthInputSchema } from './health.schema.js';
export type DatabaseProbe = () => Promise<unknown>;
export const probeDatabase: DatabaseProbe = () => prisma.$queryRaw`SELECT 1`;
export function healthRouter(probe: DatabaseProbe = probeDatabase) {
  const router = Router();
  router.get('/', validate(healthInputSchema), async (_req, res) => {
    try {
      await probe();
      res.json({ status: 'ok', version, database: 'connected' });
    } catch {
      res
        .status(503)
        .json({ status: 'degraded', version, database: 'disconnected' });
    }
  });
  return router;
}
