import { z } from 'zod';
import { errorSchema } from '@/lib/errors.js';
import * as s from './catalogue.schema.js';
const json = (schema: z.ZodType) => ({
  'application/json': {
    schema: z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input' }),
  },
});
const parameter = (name: string, schema: z.ZodType, location = 'query') => ({
  name,
  in: location,
  required: location === 'path',
  schema: z.toJSONSchema(schema, { io: 'input', target: 'draft-2020-12' }),
});
export const cataloguePaths = Object.fromEntries(
  [
    {
      path: '/categories',
      summary: 'List active categories',
      response: z.array(s.categorySchema),
      parameters: [],
    },
    {
      path: '/products',
      summary:
        'Published products; integer-kobo price bounds, min <= max, eight per page; page clamps to last page',
      response: s.listSchema,
      parameters: Object.entries(s.queryFields).map(([name, schema]) =>
        parameter(name, schema),
      ),
    },
    {
      path: '/products/{id}',
      summary: 'Read a published product in an active category',
      response: s.productSchema,
      parameters: [parameter('id', z.uuid(), 'path')],
    },
    {
      path: '/home',
      summary:
        'Active categories and up to eight featured published products; banners reserved as empty array',
      response: s.homeSchema,
      parameters: [],
    },
  ].map((op) => [
    `/api/v1${op.path}`,
    {
      get: {
        tags: ['Catalogue'],
        summary: op.summary,
        security: [],
        parameters: op.parameters,
        responses: {
          200: {
            description: 'Success',
            content: json(
              z.object({ success: z.literal(true), data: op.response }),
            ),
          },
          ...Object.fromEntries(
            [400, 404, 429, 500].map((status) => [
              status,
              { description: 'Request failed', content: json(errorSchema) },
            ]),
          ),
        },
      },
    },
  ]),
);
