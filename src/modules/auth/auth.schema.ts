import { z } from 'zod';
export const email = z.string().trim().toLowerCase().email().max(254);
export const password = z.string().min(15).max(128);
export const token = z.string().regex(/^[a-f0-9]{64}$/);
export const clientHeader = z.literal('web');
const fullName = z.string().trim().min(2).max(120);
const phone = z
  .string()
  .trim()
  .max(32)
  .refine(
    (v) => v === '' || /^\+?[0-9 ()-]{7,32}$/.test(v),
    'Invalid phone number',
  );
export const registerBody = z
  .strictObject({
    fullName,
    email,
    phone: phone.default(''),
    password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords must match',
  });
export const loginBody = z.strictObject({
  email,
  password: z.string().min(1).max(128),
});
export const adminLoginBody = loginBody.extend({
  rememberDevice: z.boolean().default(false),
});
export const forgotBody = z.strictObject({ email });
export const resetBody = z
  .strictObject({ token, password, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords must match',
  });
export const profileBody = z
  .strictObject({
    fullName: fullName.optional(),
    phone: phone.optional(),
    email: email.optional(),
    currentPassword: z.string().min(1).max(128).optional(),
  })
  .refine(
    (v) =>
      v.fullName !== undefined ||
      v.phone !== undefined ||
      v.email !== undefined,
    { message: 'Provide a profile field' },
  );
export const challengeBody = z.strictObject({ challengeToken: token });
export const verifyBody = challengeBody.extend({
  code: z.string().regex(/^\d{6}$/),
});
export const recoveryBody = challengeBody.extend({
  recoveryCode: z.string().regex(/^[a-f0-9]{32}$/),
});
export const emptyBody = z.strictObject({}).optional();
export const input = (body: z.ZodType) =>
  z.object({ body, query: z.strictObject({}), params: z.strictObject({}) });
export const profileSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  email: z.string(),
  phone: z.string(),
});
export const adminSchema = profileSchema.extend({
  role: z.enum(['SUPER_ADMIN', 'OPERATIONS_LEAD', 'CUSTOMER_CARE']),
});
export const messageSchema = z.object({ message: z.string() });
export const sessionSchema = z.object({
  profile: profileSchema,
  csrfToken: token,
  expiresAt: z.string(),
});
export const adminSessionSchema = z.object({
  admin: adminSchema,
  csrfToken: token,
  expiresAt: z.string(),
  recoveryCodes: z.array(z.string()).optional(),
});
export const challengeSchema = z.object({
  requiresMfa: z.literal(true),
  enrollmentRequired: z.boolean(),
  challengeToken: token,
  expiresAt: z.string(),
});
export const enrollmentSchema = z.object({
  secret: z.string(),
  otpauthUri: z.string(),
});
export const success = (data: z.ZodType) =>
  z.object({ success: z.literal(true), data });
