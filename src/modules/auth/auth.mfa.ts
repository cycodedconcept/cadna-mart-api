import { randomBytes } from 'node:crypto';
import { TOTP, Secret } from 'otpauth';
import { AppError } from '@/lib/errors.js';
import { authDb, invalidChallenge, throttle } from './auth.repository.js';
import { credentials } from './auth.service.js';
import { digest, opaqueToken, seal, unseal } from './auth.crypto.js';
import { newSession } from './auth.session.js';
export const totp = (secret: string, email: string) =>
  new TOTP({
    issuer: 'CADNA Mart',
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
export async function adminLogin(email: string, password: string) {
  const user = await credentials(email, password, true);
  const raw = opaqueToken();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await authDb.$transaction(async (tx) => {
    const locked = await tx.user.updateMany({
      where: {
        id: user.id,
        authVersion: user.authVersion,
        active: true,
        role: { not: 'CUSTOMER' },
      },
      data: { authVersion: { increment: 0 } },
    });
    if (!locked.count) throw invalidChallenge();
    await tx.mfaChallenge.create({
      data: {
        tokenHash: digest(raw),
        userId: user.id,
        authVersion: user.authVersion,
        expiresAt,
      },
    });
  });
  return {
    requiresMfa: true,
    enrollmentRequired: !user.mfaSecret,
    challengeToken: raw,
    expiresAt: expiresAt.toISOString(),
  };
}
async function challenge(raw: string, attempt = false) {
  const tokenHash = digest(raw);
  if (attempt) {
    const count = await authDb.mfaChallenge.updateMany({
      where: { tokenHash, expiresAt: { gt: new Date() }, attempts: { lt: 5 } },
      data: { attempts: { increment: 1 } },
    });
    if (!count.count) throw invalidChallenge();
  }
  const result = await authDb.mfaChallenge.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (
    !result ||
    result.expiresAt <= new Date() ||
    result.attempts > (attempt ? 5 : 4) ||
    !result.user.active ||
    result.user.role === 'CUSTOMER' ||
    result.authVersion !== result.user.authVersion
  )
    throw invalidChallenge();
  if (attempt) await throttle('mfa', result.userId, 15);
  return result;
}
export async function enrollMfa(raw: string) {
  const current = await challenge(raw);
  if (current.user.mfaSecret)
    throw new AppError(409, 'MFA is already enrolled', 'MFA_ALREADY_ENROLLED');
  const secret = new Secret({ size: 20 }).base32;
  await authDb.mfaChallenge.updateMany({
    where: { tokenHash: current.tokenHash, pendingSecret: null },
    data: { pendingSecret: seal(secret, `mfa:${current.userId}`) },
  });
  const updated = await challenge(raw);
  const plain = unseal(updated.pendingSecret!, `mfa:${updated.userId}`);
  return {
    secret: plain,
    otpauthUri: totp(plain, updated.user.email).toString(),
  };
}
export async function verifyMfa(raw: string, code: string, recovery = false) {
  const current = await challenge(raw, true);
  const user = current.user;
  let step: bigint | undefined;
  const enrollment = !user.mfaSecret;
  if (recovery) {
    if (enrollment) throw invalidChallenge();
  } else {
    const encrypted = user.mfaSecret ?? current.pendingSecret;
    if (!encrypted) throw invalidChallenge();
    const timestamp = Date.now();
    const delta = totp(
      unseal(encrypted, `mfa:${user.id}`),
      user.email,
    ).validate({ token: code, window: 1, timestamp });
    if (delta === null)
      throw new AppError(401, 'Invalid MFA code', 'INVALID_MFA_CODE');
    step = BigInt(Math.floor(timestamp / 30000) + delta);
    if (step <= user.mfaLastStep)
      throw new AppError(401, 'Invalid MFA code', 'INVALID_MFA_CODE');
  }
  const recoveryCodes = enrollment
    ? Array.from({ length: 10 }, () => randomBytes(16).toString('hex'))
    : undefined;
  const session = newSession(user, true);
  await authDb.$transaction(async (tx) => {
    const locked = await tx.user.updateMany({
      where: {
        id: user.id,
        authVersion: current.authVersion,
        active: true,
        role: { not: 'CUSTOMER' },
        mfaSecret: user.mfaSecret,
        ...(step !== undefined ? { mfaLastStep: { lt: step } } : {}),
      },
      data: {
        authVersion: { increment: 0 },
        ...(step !== undefined ? { mfaLastStep: step } : {}),
        ...(enrollment ? { mfaSecret: current.pendingSecret } : {}),
      },
    });
    if (!locked.count) throw invalidChallenge();
    const consumed = await tx.mfaChallenge.deleteMany({
      where: { tokenHash: current.tokenHash, expiresAt: { gt: new Date() } },
    });
    if (!consumed.count) throw invalidChallenge();
    if (recovery) {
      const used = await tx.recoveryCode.deleteMany({
        where: { userId: user.id, codeHash: digest(code) },
      });
      if (!used.count)
        throw new AppError(
          401,
          'Invalid recovery code',
          'INVALID_RECOVERY_CODE',
        );
    }
    if (recoveryCodes)
      await tx.recoveryCode.createMany({
        data: recoveryCodes.map((code) => ({
          userId: user.id,
          codeHash: digest(code),
        })),
      });
    await tx.session.create({ data: session.data });
  });
  return { user, session, recoveryCodes };
}
