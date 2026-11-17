import { randomUUID } from 'node:crypto';
import type { User } from '@prisma/client';
import type { z } from 'zod';
import { env } from '@/config/env.js';
import { AppError } from '@/lib/errors.js';
import {
  authDb,
  invalidCredentials,
  profile,
  throttle,
  uniqueConflict,
} from './auth.repository.js';
import {
  digest,
  opaqueToken,
  hashPassword,
  verifyPassword,
  dummyPassword,
  seal,
} from './auth.crypto.js';
import { newSession } from './auth.session.js';
import type { registerBody, profileBody } from './auth.schema.js';
export async function register(data: z.infer<typeof registerBody>) {
  const passwordHash = await hashPassword(data.password);
  try {
    const user = await authDb.user.create({
      data: {
        email: data.email,
        fullName: data.fullName,
        phone: data.phone,
        passwordHash,
      },
    });
    return profile(user);
  } catch (error) {
    if (uniqueConflict(error))
      throw new AppError(409, 'Email is already registered', 'EMAIL_IN_USE');
    throw error;
  }
}
export async function credentials(
  email: string,
  password: string,
  admin: boolean,
) {
  await throttle('login', email);
  const user = await authDb.user.findUnique({ where: { email } });
  const valid = await verifyPassword(
    password,
    user?.passwordHash ?? (await dummyPassword()),
  );
  if (
    !valid ||
    !user ||
    !user.active ||
    (admin ? user.role === 'CUSTOMER' : user.role !== 'CUSTOMER')
  )
    throw invalidCredentials();
  return user;
}
export async function customerLogin(email: string, password: string) {
  const user = await credentials(email, password, false);
  const session = newSession(user, false);
  await authDb.$transaction(async (tx) => {
    const locked = await tx.user.updateMany({
      where: {
        id: user.id,
        authVersion: user.authVersion,
        active: true,
        role: 'CUSTOMER',
      },
      data: { authVersion: { increment: 0 } },
    });
    if (!locked.count) throw invalidCredentials();
    await tx.session.create({ data: session.data });
  });
  return { user, session };
}
export async function forgotPassword(email: string, admin: boolean) {
  await throttle('reset-request', email, 5);
  const user = await authDb.user.findUnique({ where: { email } });
  if (
    !user ||
    !user.active ||
    (admin ? user.role === 'CUSTOMER' : user.role !== 'CUSTOMER')
  )
    return;
  const raw = opaqueToken();
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const url = new URL(
    '/reset-password',
    admin ? env.ADMIN_APP_URL : env.APP_URL,
  );
  url.hash = new URLSearchParams({ token: raw }).toString();
  await authDb.$transaction(async (tx) => {
    const locked = await tx.user.updateMany({
      where: { id: user.id, authVersion: user.authVersion, active: true },
      data: { authVersion: { increment: 0 } },
    });
    if (!locked.count) return;
    await tx.passwordReset.deleteMany({ where: { userId: user.id } });
    await tx.passwordReset.create({
      data: {
        tokenHash: digest(raw),
        userId: user.id,
        authVersion: user.authVersion,
        expiresAt,
      },
    });
    await tx.mailJob.create({
      data: {
        id,
        expiresAt,
        payload: seal(
          JSON.stringify({
            to: user.email,
            subject: 'Reset your CADNA Mart password',
            text: `Use this link within 30 minutes: ${url.toString()}\nIf you did not request this, ignore this email.`,
          }),
          `mail:${id}`,
        ),
      },
    });
  });
}
export async function resetPassword(
  raw: string,
  password: string,
  admin: boolean,
) {
  const reset = await authDb.passwordReset.findUnique({
    where: { tokenHash: digest(raw) },
    include: { user: true },
  });
  const invalid = () =>
    new AppError(400, 'Invalid or expired reset token', 'INVALID_RESET_TOKEN');
  if (
    !reset ||
    reset.expiresAt <= new Date() ||
    !reset.user.active ||
    reset.authVersion !== reset.user.authVersion ||
    (admin ? reset.user.role === 'CUSTOMER' : reset.user.role !== 'CUSTOMER')
  )
    throw invalid();
  const passwordHash = await hashPassword(password);
  await authDb.$transaction(async (tx) => {
    const changed = await tx.user.updateMany({
      where: { id: reset.userId, authVersion: reset.authVersion, active: true },
      data: { passwordHash, authVersion: { increment: 1 } },
    });
    if (!changed.count) throw invalid();
    const consumed = await tx.passwordReset.deleteMany({
      where: { tokenHash: reset.tokenHash, expiresAt: { gt: new Date() } },
    });
    if (!consumed.count) throw invalid();
    await tx.passwordReset.deleteMany({ where: { userId: reset.userId } });
    await tx.session.deleteMany({ where: { userId: reset.userId } });
    await tx.mfaChallenge.deleteMany({ where: { userId: reset.userId } });
  });
}
export async function updateProfile(
  user: User,
  data: z.infer<typeof profileBody>,
) {
  const emailChanged = data.email !== undefined && data.email !== user.email;
  if (emailChanged) await throttle('profile-email', user.id);
  if (
    emailChanged &&
    (!data.currentPassword ||
      !(await verifyPassword(data.currentPassword, user.passwordHash)))
  )
    throw invalidCredentials();
  try {
    return await authDb.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({
        where: {
          id: user.id,
          authVersion: user.authVersion,
          active: true,
          role: 'CUSTOMER',
        },
        data: {
          fullName: data.fullName,
          phone: data.phone,
          email: data.email,
          authVersion: { increment: emailChanged ? 1 : 0 },
        },
      });
      if (!changed.count) throw invalidCredentials();
      if (emailChanged) {
        await tx.session.deleteMany({ where: { userId: user.id } });
        await tx.passwordReset.deleteMany({ where: { userId: user.id } });
      }
      return {
        profile: profile(
          await tx.user.findUniqueOrThrow({ where: { id: user.id } }),
        ),
        reauthenticate: emailChanged,
      };
    });
  } catch (error) {
    if (uniqueConflict(error))
      throw new AppError(409, 'Email is already registered', 'EMAIL_IN_USE');
    throw error;
  }
}
