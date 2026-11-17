import { execFileSync } from 'node:child_process';
import { prisma } from '@/lib/prisma.js';
export function migrateTestDatabase() {
  execFileSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    { env: process.env, stdio: 'pipe' },
  );
}
export async function resetTestDatabase() {
  await prisma.$transaction([
    prisma.mailJob.deleteMany(),
    prisma.authThrottle.deleteMany(),
    prisma.session.deleteMany(),
    prisma.passwordReset.deleteMany(),
    prisma.mfaChallenge.deleteMany(),
    prisma.recoveryCode.deleteMany(),
    prisma.user.deleteMany(),
    prisma.setting.deleteMany(),
  ]);
}
