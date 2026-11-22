import { z } from 'zod';
import { cataloguePaths } from '@/modules/catalogue/catalogue.openapi.js';
import { authPaths } from '@/modules/auth/auth.openapi.js';
import { cookieName } from '@/modules/auth/auth.session.js';
import { healthSchema } from '@/modules/health/health.schema.js';
import { errorSchema } from '@/lib/errors.js';
import { version } from './version.js';
const json = (schema: z.ZodType) => ({
  'application/json': {
    schema: z.toJSONSchema(schema, { target: 'draft-2020-12' }),
  },
});
export const openapi = {
  openapi: '3.1.0',
  info: { title: 'CADNA Mart API', version },
  components: {
    securitySchemes: {
      customerSession: {
        type: 'apiKey',
        in: 'cookie',
        name: cookieName(false),
      },
      adminSession: { type: 'apiKey', in: 'cookie', name: cookieName(true) },
    },
  },
  paths: {
    ...authPaths,
    ...cataloguePaths,
    '/api/v1/health': {
      get: {
        tags: ['Health'],
        summary: 'API readiness and database connectivity',
        responses: {
          '200': { description: 'Ready', content: json(healthSchema) },
          '503': {
            description: 'Database unavailable',
            content: json(healthSchema),
          },
          '400': { description: 'Invalid input', content: json(errorSchema) },
          '429': { description: 'Rate limited', content: json(errorSchema) },
        },
      },
    },
  },
};
