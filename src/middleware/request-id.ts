import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
export const requestId: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Request-Id', randomUUID());
  next();
};
