import type { ErrorRequestHandler } from 'express';
import { z } from 'zod';
import { logger } from '@/lib/logger.js';
export const errorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  code: z.string(),
  fieldErrors: z.record(z.string(), z.array(z.string())),
});
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
    public fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
  }
}
export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _req,
  res,
  _next,
) => {
  let known = error instanceof AppError ? error : null;
  if (error instanceof SyntaxError && 'status' in error && error.status === 400)
    known = new AppError(400, 'Invalid JSON body', 'INVALID_JSON');
  if (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'entity.too.large'
  )
    known = new AppError(413, 'Request body too large', 'BODY_TOO_LARGE');
  if (!known)
    logger.error(
      {
        requestId: res.getHeader('x-request-id'),
        errorType: error instanceof Error ? error.name : 'Unknown',
      },
      'Unhandled request error',
    );
  res.status(known?.status ?? 500).json({
    success: false,
    message: known?.message ?? 'Internal server error',
    code: known?.code ?? 'INTERNAL_ERROR',
    fieldErrors: known?.fieldErrors ?? {},
  });
};
