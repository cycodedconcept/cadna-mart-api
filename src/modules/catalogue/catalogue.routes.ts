import { Router } from 'express';
import { validate } from '@/middleware/validate.js';
import * as schema from './catalogue.schema.js';
import * as service from './catalogue.service.js';
export function catalogueRouter() {
  const router = Router();
  router.get('/categories', validate(schema.emptyInput), async (_req, res) =>
    res.json({ success: true, data: await service.categories() }),
  );
  router.get('/products', validate(schema.listInput), async (_req, res) =>
    res.json({
      success: true,
      data: await service.products(res.locals.input.query),
    }),
  );
  router.get('/products/:id', validate(schema.detailInput), async (_req, res) =>
    res.json({
      success: true,
      data: await service.product(res.locals.input.params.id),
    }),
  );
  router.get('/home', validate(schema.emptyInput), async (_req, res) =>
    res.json({ success: true, data: await service.home() }),
  );
  return router;
}
