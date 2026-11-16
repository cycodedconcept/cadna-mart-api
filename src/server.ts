import { app } from './app.js';
import { env } from '@/config/env.js';
import { prisma } from '@/lib/prisma.js';
import { logger } from '@/lib/logger.js';
try {
  await prisma.$connect();
  const server = app.listen(env.PORT, () =>
    logger.info({ port: env.PORT }, 'API listening'),
  );
  server.on('error', async () => {
    logger.error('HTTP server failed');
    await prisma.$disconnect();
    process.exitCode = 1;
  });
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
    server.close(() => {
      void prisma.$disconnect().then(() => {
        clearTimeout(timeout);
      });
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch {
  logger.fatal('Database connection failed during startup');
  await prisma.$disconnect();
  process.exitCode = 1;
}
