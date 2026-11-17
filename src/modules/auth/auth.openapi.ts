import { z } from 'zod';
import * as s from './auth.schema.js';
import { errorSchema } from '@/lib/errors.js';
export const authOperations: {
  method: 'get' | 'post' | 'patch';
  path: string;
  body?: z.ZodType;
  response: z.ZodType;
  status?: number;
  protected?: boolean;
  summary: string;
}[] = [
  {
    method: 'post',
    path: '/auth/register',
    body: s.registerBody,
    response: z.object({ profile: s.profileSchema }),
    status: 201,
    summary: 'Register a customer; does not create a session',
  },
  {
    method: 'post',
    path: '/auth/login',
    body: s.loginBody,
    response: s.sessionSchema,
    summary: 'Create a customer session',
  },
  ...[false, true].flatMap((admin) => {
    const prefix = admin ? '/admin/auth' : '/auth';
    return [
      {
        method: 'post' as const,
        path: `${prefix}/forgot-password`,
        body: s.forgotBody,
        response: s.messageSchema,
        status: 202,
        summary:
          'Queue password recovery instructions without disclosing account existence',
      },
      {
        method: 'post' as const,
        path: `${prefix}/reset-password`,
        body: s.resetBody,
        response: s.messageSchema,
        summary:
          'Consume a reset token and revoke all sessions; admin MFA remains required',
      },
      {
        method: 'get' as const,
        path: `${prefix}/session`,
        response: admin ? s.adminSessionSchema : s.sessionSchema,
        protected: true,
        summary: 'Read the current session and CSRF token',
      },
      {
        method: 'post' as const,
        path: `${prefix}/logout`,
        body: s.emptyBody,
        response: s.messageSchema,
        protected: true,
        summary: 'Revoke the current session',
      },
    ];
  }),
  {
    method: 'post',
    path: '/admin/auth/login',
    body: s.adminLoginBody,
    response: s.challengeSchema,
    summary:
      'Verify admin password and create a five-minute MFA challenge; rememberDevice does not bypass MFA or extend sessions',
  },
  {
    method: 'post',
    path: '/admin/auth/mfa/enroll',
    body: s.challengeBody,
    response: s.enrollmentSchema,
    summary: 'Begin first-time TOTP enrollment; no session is issued',
  },
  {
    method: 'post',
    path: '/admin/auth/mfa/verify',
    body: s.verifyBody,
    response: s.adminSessionSchema,
    summary:
      'Verify TOTP and create an admin session; first enrollment returns ten recovery codes once',
  },
  {
    method: 'post',
    path: '/admin/auth/mfa/recover',
    body: s.recoveryBody,
    response: s.adminSessionSchema,
    summary:
      'Consume one recovery code and create an admin session after password verification',
  },
  {
    method: 'get',
    path: '/account/profile',
    response: s.profileSchema,
    protected: true,
    summary: 'Read the authenticated customer profile',
  },
  {
    method: 'patch',
    path: '/account/profile',
    body: s.profileBody,
    response: z.object({
      profile: s.profileSchema,
      reauthenticate: z.boolean(),
    }),
    protected: true,
    summary:
      'Update own profile; changing email requires currentPassword and revokes sessions',
  },
];
const content = (schema: z.ZodType, request = false) => ({
  'application/json': {
    schema: z.toJSONSchema(schema, {
      target: 'draft-2020-12',
      io: request ? 'input' : 'output',
    }),
  },
});
export const authPaths: Record<string, Record<string, unknown>> = {};
for (const op of authOperations) {
  const write = op.method !== 'get';
  const parameters = [];
  if (write)
    parameters.push({
      name: 'X-CADNA-Client',
      in: 'header',
      required: true,
      schema: { type: 'string', enum: ['web'] },
    });
  if (write && op.protected)
    parameters.push({
      name: 'X-CSRF-Token',
      in: 'header',
      required: true,
      schema: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    });
  (authPaths[`/api/v1${op.path}`] ??= {})[op.method] = {
    tags: [
      op.path.startsWith('/admin')
        ? 'Admin authentication'
        : 'Customer authentication',
    ],
    summary: op.summary,
    parameters,
    ...(op.protected
      ? {
          security: [
            {
              [op.path.startsWith('/admin')
                ? 'adminSession'
                : 'customerSession']: [],
            },
          ],
        }
      : {}),
    ...(op.body
      ? {
          requestBody: {
            required: op.body !== s.emptyBody,
            content: content(
              op.body === s.emptyBody ? z.strictObject({}) : op.body,
              true,
            ),
          },
        }
      : {}),
    responses: {
      [op.status ?? 200]: {
        description:
          'Success; session tokens are delivered only in HttpOnly cookies',
        content: content(s.success(op.response)),
      },
      ...Object.fromEntries(
        [400, 401, 403, 409, 429, 500].map((status) => [
          status,
          { description: 'Request failed', content: content(errorSchema) },
        ]),
      ),
    },
  };
}
