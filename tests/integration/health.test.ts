import { execFileSync } from 'node:child_process';
import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import request from 'supertest';
import { prisma } from '@/lib/prisma.js';
import { app } from '@/app.js';
let migrated = false;
beforeAll(() => {
  execFileSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    { env: process.env, stdio: 'pipe' },
  );
  migrated = true;
});
// Clear only application rows in the isolated test database, preserving migration history.
beforeEach(async () => {
  await prisma.setting.deleteMany();
});
afterAll(async () => {
  try {
    if (migrated) await prisma.setting.deleteMany();
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
