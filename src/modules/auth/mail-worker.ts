import { setTimeout } from 'node:timers/promises';
import { authDb } from './auth.repository.js';
import { processMailBatch } from './auth.mail.js';
import { logger } from '@/lib/logger.js';
let stopping = false;
process.on('SIGINT', () => {
  stopping = true;
});
process.on('SIGTERM', () => {
  stopping = true;
});
try {
  do {
    await processMailBatch();
    await authDb.authThrottle.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    await authDb.session.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    await authDb.passwordReset.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    await authDb.mfaChallenge.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    if (process.argv.includes('--once')) break;
    await setTimeout(5000);
  } while (!stopping);
} catch {
  logger.error('Authentication mail worker failed');
  process.exitCode = 1;
} finally {
  await authDb.$disconnect();
}
