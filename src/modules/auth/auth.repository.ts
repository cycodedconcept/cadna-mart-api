import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.js';
import { AppError } from '@/lib/errors.js';
import { digest } from './auth.crypto.js';
export { prisma as authDb };
export const invalidCredentials = () =>
  new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
export const invalidChallenge = () =>
  new AppError(
    401,
    'Invalid or expired MFA challenge',
    'INVALID_MFA_CHALLENGE',
  );
export function uniqueConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
// Atomic database counter shared across processes. Fixed 15-minute windows.
export async function throttle(scope: string, identity: string, limit = 10) {
  const bucket = Math.floor(Date.now() / 900000);
  const key = digest(`${scope}:${identity}:${bucket}`);
  const expiresAt = new Date((bucket + 1) * 900000);
  // Prisma's emulated MySQL upsert can race on first creation. Use one native statement.
  await prisma.$executeRaw`INSERT INTO auth_throttles (\`key\`, attempts, expiresAt)
    VALUES (${key}, 1, ${expiresAt}) ON DUPLICATE KEY UPDATE attempts = attempts + 1`;
  const result = await prisma.authThrottle.findUniqueOrThrow({
    where: { key },
  });
  if (result.attempts > limit)
    throw new AppError(
      429,
      'Too many attempts. Try again later.',
      'AUTH_RATE_LIMITED',
    );
}
export const profile = (user: {
  id: string;
  fullName: string;
  email: string;
  phone: string;
}) => ({
  id: user.id,
  fullName: user.fullName,
  email: user.email,
  phone: user.phone,
});
