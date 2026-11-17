import type { RequestHandler, Response, Request } from 'express';
import type { Role, User, Session } from '@prisma/client';
import { env } from '@/config/env.js';
import { AppError } from '@/lib/errors.js';
import { authDb, profile } from './auth.repository.js';
import { digest, opaqueToken } from './auth.crypto.js';
import { clientHeader, token } from './auth.schema.js';
export const adminRoles: Role[] = [
  'SUPER_ADMIN',
  'OPERATIONS_LEAD',
  'CUSTOMER_CARE',
];
export const cookieName = (admin: boolean) =>
  `${env.NODE_ENV === 'production' ? '__Host-' : ''}cadna_${admin ? 'admin' : 'customer'}`;
const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};
export function setSessionCookie(
  res: Response,
  admin: boolean,
  raw: string,
  expires: Date,
) {
  res.cookie(cookieName(admin), raw, { ...cookieOptions, expires });
}
export const clearSessionCookie = (res: Response, admin: boolean) =>
  res.clearCookie(cookieName(admin), cookieOptions);
function readCookie(req: Request, admin: boolean) {
  const values = (req.headers.cookie ?? '')
    .split(';')
    .map((v) => v.trim())
    .filter((v) => v.startsWith(`${cookieName(admin)}=`));
  if (values.length !== 1) return null;
  const parsed = token.safeParse(
    values[0]!.slice(cookieName(admin).length + 1),
  );
  return parsed.success ? parsed.data : null;
}
export type Identity = { user: User; session: Session };
export const identity = (res: Response) => res.locals.identity as Identity;
export function authenticate(admin: boolean): RequestHandler {
  return async (req, res, next) => {
    const raw = readCookie(req, admin);
    const session = raw
      ? await authDb.session.findUnique({
          where: { tokenHash: digest(raw) },
          include: { user: true },
        })
      : null;
    if (
      !session ||
      session.expiresAt <= new Date() ||
      !session.user.active ||
      session.authVersion !== session.user.authVersion
    )
      throw new AppError(401, 'Authentication required', 'UNAUTHENTICATED');
    if (
      admin
        ? session.user.role === 'CUSTOMER' || !session.mfaVerified
        : session.user.role !== 'CUSTOMER'
    )
      throw new AppError(403, 'Access denied', 'FORBIDDEN');
    res.locals.identity = { user: session.user, session };
    next();
  };
}
export const requireRoles =
  (...roles: Role[]): RequestHandler =>
  (_req, res, next) => {
    if (!roles.includes(identity(res).user.role))
      throw new AppError(403, 'Access denied', 'FORBIDDEN');
    next();
  };
export const csrf: RequestHandler = (req, res, next) => {
  const parsed = token.safeParse(req.headers['x-csrf-token']);
  if (!parsed.success || parsed.data !== identity(res).session.csrfToken)
    throw new AppError(403, 'Invalid CSRF token', 'CSRF_INVALID');
  next();
};
// A custom header makes browser writes require a CORS preflight, including login.
export const browserWrite: RequestHandler = (req, _res, next) => {
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
    !clientHeader.safeParse(req.headers['x-cadna-client']).success
  )
    throw new AppError(
      403,
      'X-CADNA-Client: web is required',
      'CLIENT_HEADER_REQUIRED',
    );
  next();
};
export function newSession(user: User, admin: boolean) {
  const raw = opaqueToken();
  return {
    raw,
    data: {
      tokenHash: digest(raw),
      userId: user.id,
      authVersion: user.authVersion,
      mfaVerified: admin,
      csrfToken: opaqueToken(),
      expiresAt: new Date(Date.now() + (admin ? 30 * 60 : 24 * 60 * 60) * 1000),
    },
  };
}
export function sessionResponse(
  user: User,
  session: Pick<Session, 'csrfToken' | 'expiresAt'>,
  admin: boolean,
) {
  return {
    ...(admin
      ? { admin: { ...profile(user), role: user.role } }
      : { profile: profile(user) }),
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt.toISOString(),
  };
}
