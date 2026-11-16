import { rateLimit } from 'express-rate-limit';
import { env } from '@/config/env.js';
import { AppError } from '@/lib/errors.js';
export const createRateLimiter = (limit = env.RATE_LIMIT_MAX) =>
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new AppError(429, 'Too many requests', 'RATE_LIMITED')),
  });
