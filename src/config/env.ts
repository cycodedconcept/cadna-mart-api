import 'dotenv/config';
import { z } from 'zod';
const databaseUrl = z
  .string()
  .url()
  .refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return url.protocol === 'mysql:' && url.pathname.length > 1;
  }, 'Expected a mysql URL with a database name');
export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: databaseUrl,
    DATABASE_URL_TEST: databaseUrl.optional(),
    CORS_ORIGINS: z
      .string()
      .min(1)
      .transform((value) => value.split(',').map((origin) => origin.trim()))
      .pipe(
        z
          .array(
            z
              .string()
              .url()
              .refine((value) => {
                if (!URL.canParse(value)) return false;
                const url = new URL(value);
                return (
                  ['http:', 'https:'].includes(url.protocol) &&
                  url.origin === value
                );
              }, 'Expected an HTTP origin without a path'),
          )
          .min(1),
      ),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    JSON_BODY_LIMIT: z
      .string()
      .regex(/^\d+(b|kb|mb)$/i)
      .default('100kb'),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === 'test' && !value.DATABASE_URL_TEST)
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL_TEST'],
        message: 'Required in test mode',
      });
  });
export function parseEnv(input: NodeJS.ProcessEnv) {
  const result = envSchema.safeParse(input);
  if (!result.success)
    throw new Error(
      `Invalid environment: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
  return result.data;
}
export const env = parseEnv(process.env);
