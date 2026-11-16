import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '@/lib/errors.js';
// Parsed inputs live in res.locals.input; Express 5 req.query is a getter.
export function validate(schema: z.ZodType): RequestHandler {
  return async (req, res, next) => {
    const parsed = await schema.safeParseAsync({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    if (!parsed.success) {
      const fields: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || '_root';
        (fields[key] ??= []).push(issue.message);
      }
      throw new AppError(400, 'Validation failed', 'VALIDATION_ERROR', fields);
    }
    res.locals.input = parsed.data;
    next();
  };
}
