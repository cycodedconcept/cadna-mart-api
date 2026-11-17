import express from 'express';
import { authRouter } from '@/modules/auth/auth.routes.js';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { env } from '@/config/env.js';
import { openapi } from '@/config/openapi.js';
import { logger } from '@/lib/logger.js';
import { AppError, errorHandler } from '@/lib/errors.js';
import { requestId } from '@/middleware/request-id.js';
import { createRateLimiter } from '@/middleware/rate-limit.js';
import {
  healthRouter,
  type DatabaseProbe,
} from '@/modules/health/health.routes.js';
export function createApp(
  options: {
    probe?: DatabaseProbe;
    rateLimit?: number;
    mode?: typeof env.NODE_ENV;
  } = {},
) {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (_req, res) => String(res.getHeader('x-request-id')),
      serializers: {
        req: (req) => ({ id: req.id, method: req.method }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || env.CORS_ORIGINS.includes(origin)) callback(null, true);
        else
          callback(new AppError(403, 'Origin not allowed', 'CORS_FORBIDDEN'));
      },
      credentials: true,
    }),
  );
  app.use('/api/v1', createRateLimiter(options.rateLimit));
  app.use(express.json({ limit: env.JSON_BODY_LIMIT }));
  app.use('/api/v1/health', healthRouter(options.probe));
  app.use('/api/v1', authRouter());
  if ((options.mode ?? env.NODE_ENV) === 'development') {
    app.get('/api/docs/openapi.json', (_req, res) => res.json(openapi));
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi));
  }
  app.use((_req, _res, next) =>
    next(new AppError(404, 'Route not found', 'NOT_FOUND')),
  );
  app.use(errorHandler);
  return app;
}
export const app = createApp();
