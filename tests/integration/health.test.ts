import { migrateTestDatabase, resetTestDatabase } from './database.js';
import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import request from 'supertest';
import { prisma } from '@/lib/prisma.js';
import { app } from '@/app.js';
let migrated = false;
beforeAll(() => {
  migrateTestDatabase();
  migrated = true;
});
// Clear only application rows in the isolated test database, preserving migration history.
beforeEach(async () => {
  await resetTestDatabase();
});
afterAll(async () => {
  try {
    if (migrated) await resetTestDatabase();
  } finally {
    await prisma.$disconnect();
  }
});
it('connects to MariaDB through the health endpoint', async () => {
  const res = await request(app).get('/api/v1/health');
  expect(res.status).toBe(200);
  expect(res.body.database).toBe('connected');
});
it('persists settings and resets between tests', async () => {
  expect(await prisma.setting.count()).toBe(0);
  await prisma.setting.create({
    data: { key: 'test', value: { currency: 'NGN' } },
  });
  expect(
    (await prisma.setting.findUniqueOrThrow({ where: { key: 'test' } })).value,
  ).toEqual({ currency: 'NGN' });
});
it('starts with an empty settings table again', async () => {
  expect(await prisma.setting.count()).toBe(0);
});
