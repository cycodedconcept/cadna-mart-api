import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { z } from 'zod';
import { createApp } from '@/app.js';
import { parseEnv } from '@/config/env.js';
import { addKobo, nairaToKobo, multiplyKobo } from '@/lib/money.js';
import { lagosDateKey } from '@/lib/dates.js';
import { validate } from '@/middleware/validate.js';
import { errorHandler } from '@/lib/errors.js';
import { assertTestDatabase } from '../test-database.js';
const app = () => createApp({ probe: async () => 1 });
describe('HTTP foundation', () => {
  it('reports readiness and a generated request id', async () => {
    const res = await request(app())
      .get('/api/v1/health')
      .set('X-Request-Id', 'untrusted');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      database: 'connected',
      version: '0.1.0',
    });
    expect(res.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
  it('returns 503 without leaking database errors', async () => {
    const res = await request(
      createApp({
        probe: async () => {
          throw new Error('secret');
        },
      }),
    ).get('/api/v1/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      status: 'degraded',
      database: 'disconnected',
      version: '0.1.0',
    });
  });
  it('uses the error envelope for unknown routes', async () => {
    const res = await request(app()).get('/missing');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      message: 'Route not found',
      code: 'NOT_FOUND',
      fieldErrors: {},
    });
  });
  it('rejects unexpected health query inputs', async () => {
    const res = await request(app()).get('/api/v1/health?bad=1');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
  it('enforces configured CORS', async () => {
    const allowed = process.env.CORS_ORIGINS!.split(',')[0]!.trim();
    expect(
      (await request(app()).get('/api/v1/health').set('Origin', allowed))
        .headers['access-control-allow-origin'],
    ).toBe(allowed);
    expect(
      (
        await request(app())
          .get('/api/v1/health')
          .set('Origin', 'https://untrusted.invalid')
      ).status,
    ).toBe(403);
  });
  it('handles malformed JSON and excessive bodies', async () => {
    const bad = await request(app())
      .post('/missing')
      .set('Content-Type', 'application/json')
      .send('{');
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('INVALID_JSON');
    const large = await request(app())
      .post('/missing')
      .send({ data: 'x'.repeat(2_000_000) });
    expect(large.status).toBe(413);
    expect(large.body.code).toBe('BODY_TOO_LARGE');
  });
  it('rate limits with the standard error envelope', async () => {
    const limited = createApp({ probe: async () => 1, rateLimit: 1 });
    await request(limited).get('/api/v1/health');
    const res = await request(limited).get('/api/v1/health');
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMITED');
  });
  it('serves generated docs only in development', async () => {
    const dev = createApp({ mode: 'development' });
    const res = await request(dev).get('/api/docs/openapi.json');
    expect(res.status).toBe(200);
    expect(
      res.body.paths['/api/v1/health'].get.responses['200'].content[
        'application/json'
      ].schema.properties.database.enum,
    ).toContain('connected');
    expect((await request(dev).get('/api/docs/')).status).toBe(200);
    expect(
      (await request(createApp({ mode: 'production' })).get('/api/docs'))
        .status,
    ).toBe(404);
  });
  it('validates and transforms inputs without assigning req.query', async () => {
    const test = express();
    test.use(express.json());
    test.post(
      '/',
      validate(
        z.object({
          body: z.object({ quantity: z.coerce.number().int().positive() }),
          query: z.object({ page: z.coerce.number().default(1) }),
        }),
      ),
      (_req, res) => res.json(res.locals.input),
    );
    test.use(errorHandler);
    expect(
      (await request(test).post('/?page=2').send({ quantity: '3' })).body,
    ).toEqual({ body: { quantity: 3 }, query: { page: 2 } });
    const invalid = await request(test).post('/').send({ quantity: -1 });
    expect(invalid.status).toBe(400);
    expect(invalid.body.fieldErrors['body.quantity']).toBeDefined();
  });
  it('redacts unexpected errors', async () => {
    const test = express();
    test.get('/', () => {
      throw new Error('password=secret');
    });
    test.use(errorHandler);
    const res = await request(test).get('/');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Internal server error');
  });
});
describe('configuration and value helpers', () => {
  it('fails fast without exposing values', () => {
    expect(() => parseEnv({ DATABASE_URL: 'secret' })).toThrow(
      'Invalid environment',
    );
    expect(() => parseEnv({ DATABASE_URL: 'secret' })).not.toThrow('secret');
  });
  it('rejects unsafe test databases', () => {
    expect(() => assertTestDatabase(undefined, undefined)).toThrow();
    expect(() =>
      assertTestDatabase('mysql://root@localhost/store', undefined),
    ).toThrow();
    expect(() =>
      assertTestDatabase(
        'mysql://root@localhost/store_test',
        'mysql://other@127.0.0.1/store_test',
      ),
    ).toThrow();
  });
  it('calculates exact kobo and rejects precision loss', () => {
    expect(nairaToKobo('12.01')).toBe(1201);
    expect(addKobo(10, 20)).toBe(30);
    expect(multiplyKobo(101, 3)).toBe(303);
    expect(() => nairaToKobo('1.001')).toThrow();
    expect(() => addKobo(Number.MAX_SAFE_INTEGER, 1)).toThrow();
    expect(() => multiplyKobo(1, -1)).toThrow();
  });
  it('uses Lagos date boundaries', () => {
    expect(lagosDateKey(new Date('2026-11-15T23:30:00Z'))).toBe('2026-11-16');
    expect(() => lagosDateKey(new Date('invalid'))).toThrow();
  });
});
