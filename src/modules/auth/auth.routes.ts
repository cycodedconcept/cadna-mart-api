import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AppError } from '@/lib/errors.js';
import { validate } from '@/middleware/validate.js';
import * as schema from './auth.schema.js';
import * as service from './auth.service.js';
import * as mfa from './auth.mfa.js';
import { authDb, profile } from './auth.repository.js';
import {
  authenticate,
  requireRoles,
  adminRoles,
  browserWrite,
  csrf,
  identity,
  setSessionCookie,
  clearSessionCookie,
  sessionResponse,
} from './auth.session.js';
export function authRouter() {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(browserWrite);
  const limiter = rateLimit({
    windowMs: 900000,
    limit: 50,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(
        new AppError(
          429,
          'Too many authentication attempts',
          'AUTH_RATE_LIMITED',
        ),
      ),
  });
  router.use(['/auth', '/admin/auth'], limiter);
  router.post(
    '/auth/register',
    validate(schema.input(schema.registerBody)),
    async (_req, res) => {
      res.status(201).json({
        success: true,
        data: { profile: await service.register(res.locals.input.body) },
      });
    },
  );
  router.post(
    '/auth/login',
    validate(schema.input(schema.loginBody)),
    async (_req, res) => {
      const { user, session } = await service.customerLogin(
        res.locals.input.body.email,
        res.locals.input.body.password,
      );
      setSessionCookie(res, false, session.raw, session.data.expiresAt);
      res.json({
        success: true,
        data: sessionResponse(user, session.data, false),
      });
    },
  );
  for (const admin of [false, true]) {
    const prefix = admin ? '/admin/auth' : '/auth';
    const protectedRoute = [
      authenticate(admin),
      requireRoles(...(admin ? adminRoles : (['CUSTOMER'] as const))),
    ];
    router.post(
      `${prefix}/forgot-password`,
      validate(schema.input(schema.forgotBody)),
      async (_req, res) => {
        await service.forgotPassword(res.locals.input.body.email, admin);
        res.status(202).json({
          success: true,
          data: {
            message:
              'If the account exists, password recovery instructions will be sent.',
          },
        });
      },
    );
    router.post(
      `${prefix}/reset-password`,
      validate(schema.input(schema.resetBody)),
      async (_req, res) => {
        await service.resetPassword(
          res.locals.input.body.token,
          res.locals.input.body.password,
          admin,
        );
        clearSessionCookie(res, admin);
        res.json({
          success: true,
          data: { message: 'Password reset. Sign in again.' },
        });
      },
    );
    router.get(
      `${prefix}/session`,
      ...protectedRoute,
      validate(schema.input(schema.emptyBody)),
      (_req, res) => {
        const { user, session } = identity(res);
        res.json({
          success: true,
          data: sessionResponse(user, session, admin),
        });
      },
    );
    router.post(
      `${prefix}/logout`,
      ...protectedRoute,
      csrf,
      validate(schema.input(schema.emptyBody)),
      async (_req, res) => {
        await authDb.session.deleteMany({
          where: { tokenHash: identity(res).session.tokenHash },
        });
        clearSessionCookie(res, admin);
        res.json({ success: true, data: { message: 'Signed out.' } });
      },
    );
  }
  router.post(
    '/admin/auth/login',
    validate(schema.input(schema.adminLoginBody)),
    async (_req, res) =>
      res.json({
        success: true,
        data: await mfa.adminLogin(
          res.locals.input.body.email,
          res.locals.input.body.password,
        ),
      }),
  );
  router.post(
    '/admin/auth/mfa/enroll',
    validate(schema.input(schema.challengeBody)),
    async (_req, res) =>
      res.json({
        success: true,
        data: await mfa.enrollMfa(res.locals.input.body.challengeToken),
      }),
  );
  for (const recovery of [false, true])
    router.post(
      `/admin/auth/mfa/${recovery ? 'recover' : 'verify'}`,
      validate(
        schema.input(recovery ? schema.recoveryBody : schema.verifyBody),
      ),
      async (_req, res) => {
        const body = res.locals.input.body;
        const { user, session, recoveryCodes } = await mfa.verifyMfa(
          body.challengeToken,
          recovery ? body.recoveryCode : body.code,
          recovery,
        );
        setSessionCookie(res, true, session.raw, session.data.expiresAt);
        res.json({
          success: true,
          data: {
            ...sessionResponse(user, session.data, true),
            ...(recoveryCodes ? { recoveryCodes } : {}),
          },
        });
      },
    );
  router.get(
    '/account/profile',
    authenticate(false),
    requireRoles('CUSTOMER'),
    validate(schema.input(schema.emptyBody)),
    (_req, res) =>
      res.json({ success: true, data: profile(identity(res).user) }),
  );
  router.patch(
    '/account/profile',
    authenticate(false),
    requireRoles('CUSTOMER'),
    csrf,
    validate(schema.input(schema.profileBody)),
    async (_req, res) => {
      const result = await service.updateProfile(
        identity(res).user,
        res.locals.input.body,
      );
      if (result.reauthenticate) clearSessionCookie(res, false);
      res.json({ success: true, data: result });
    },
  );
  return router;
}
