import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Role } from '@prisma/client';
import { createApp } from '@/app.js';
import { prisma } from '@/lib/prisma.js';
import { errorHandler } from '@/lib/errors.js';
import { hashPassword, seal, unseal } from '@/modules/auth/auth.crypto.js';
import { totp } from '@/modules/auth/auth.mfa.js';
import { processMailBatch, type Mail } from '@/modules/auth/auth.mail.js';
import { authenticate, requireRoles } from '@/modules/auth/auth.session.js';
import { migrateTestDatabase, resetTestDatabase } from './database.js';
const password = 'a sufficiently long test passphrase';
const replacement = 'a different sufficiently long passphrase';
const email = 'customer@example.test';
let passwordHash: string;
let app: ReturnType<typeof createApp>;
let migrated = false;
beforeAll(async () => {
  migrateTestDatabase();
  migrated = true;
  passwordHash = await hashPassword(password);
});
beforeEach(async () => {
  await resetTestDatabase();
  app = createApp({ probe: async () => 1, rateLimit: 1000 });
});
afterAll(async () => {
  try {
    if (migrated) await resetTestDatabase();
  } finally {
    await prisma.$disconnect();
  }
});
const post = (path: string, body: object = {}) =>
  request(app)
    .post('/api/v1' + path)
    .set('X-CADNA-Client', 'web')
    .send(body);
const user = (role: Role = 'CUSTOMER', mail = email) =>
  prisma.user.create({
    data: { email: mail, fullName: 'Test Customer', passwordHash, role },
  });
const cookie = (res: { headers: Record<string, unknown> }) =>
  (res.headers['set-cookie'] as string[])[0]!.split(';')[0]!;
const login = () => post('/auth/login', { email, password });
async function resetToken(admin = false) {
  const prefix = admin ? '/admin/auth' : '/auth';
  expect((await post(`${prefix}/forgot-password`, { email })).status).toBe(202);
  const job = await prisma.mailJob.findFirstOrThrow({
    orderBy: { createdAt: 'desc' },
  });
  expect(job.payload).not.toContain(email);
  const mail = JSON.parse(unseal(job.payload, `mail:${job.id}`)) as Mail;
  const match = mail.text.match(/#token=([a-f0-9]{64})/);
  expect(match).not.toBeNull();
  return match![1]!;
}
async function adminChallenge() {
  const result = await post('/admin/auth/login', {
    email,
    password,
    rememberDevice: true,
  });
  expect(result.status).toBe(200);
  expect(result.headers['set-cookie']).toBeUndefined();
  return result.body.data.challengeToken as string;
}
async function enrolledAdmin(role: Role = 'SUPER_ADMIN') {
  await user(role);
  const challengeToken = await adminChallenge();
  const enrollment = await post('/admin/auth/mfa/enroll', { challengeToken });
  expect(enrollment.status).toBe(200);
  const result = await post('/admin/auth/mfa/verify', {
    challengeToken,
    code: totp(enrollment.body.data.secret, email).generate(),
  });
  expect(result.status).toBe(200);
  return {
    result,
    secret: enrollment.body.data.secret as string,
    challengeToken,
  };
}
describe('customer authentication', () => {
  it('registers only customers with salted password hashes and no auto-session', async () => {
    const body = {
      email: ' Customer@Example.Test ',
      fullName: 'Test User',
      phone: '+2348012345678',
      password,
      confirmPassword: password,
    };
    const res = await post('/auth/register', body);
    expect(res.status).toBe(201);
    expect(res.body.data.profile.email).toBe(email);
    expect(res.headers['set-cookie']).toBeUndefined();
    const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(stored.role).toBe('CUSTOMER');
    expect(stored.passwordHash).toMatch(/^scrypt\$/);
    expect(stored.passwordHash).not.toContain(password);
    expect((await post('/auth/register', body)).status).toBe(409);
    expect(
      (
        await post('/auth/register', {
          ...body,
          email: 'other@example.test',
          role: 'SUPER_ADMIN',
        })
      ).status,
    ).toBe(400);
  });
  it('rejects weak and mismatched passwords', async () => {
    expect(
      (
        await post('/auth/register', {
          email,
          fullName: 'Test User',
          password: 'short',
          confirmPassword: 'short',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post('/auth/register', {
          email,
          fullName: 'Test User',
          password,
          confirmPassword: 'wrong',
        })
      ).status,
    ).toBe(400);
  });
  it('requires the custom browser header and rejects disallowed origins', async () => {
    expect(
      (await request(app).post('/api/v1/auth/login').send({ email, password }))
        .status,
    ).toBe(403);
    expect(
      (
        await post('/auth/login', { email, password }).set(
          'Origin',
          'https://attacker.invalid',
        )
      ).status,
    ).toBe(403);
  });
  it('creates HttpOnly sessions, reads own profile and revokes on logout', async () => {
    const created = await user();
    const res = await login();
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']![0]!).toContain('HttpOnly');
    expect(res.headers['set-cookie']![0]!).toContain('SameSite=Lax');
    expect(res.headers['cache-control']).toBe('no-store');
    const session = await prisma.session.findFirstOrThrow();
    expect(cookie(res)).not.toContain(session.tokenHash);
    const own = await request(app)
      .get('/api/v1/account/profile')
      .set('Cookie', cookie(res));
    expect(own.body.data.id).toBe(created.id);
    expect(own.body.data.passwordHash).toBeUndefined();
    const read = await request(app)
      .get('/api/v1/auth/session')
      .set('Cookie', cookie(res));
    expect(read.body.data.csrfToken).toBe(res.body.data.csrfToken);
    expect((await post('/auth/logout').set('Cookie', cookie(res))).status).toBe(
      403,
    );
    expect(
      (
        await post('/auth/logout')
          .set('Cookie', cookie(res))
          .set('X-CSRF-Token', res.body.data.csrfToken)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .get('/api/v1/auth/session')
          .set('Cookie', cookie(res))
      ).status,
    ).toBe(401);
  });
  it('rejects invalid credentials, inactive users and customer/admin role crossover', async () => {
    const account = await user();
    const wrong = await post('/auth/login', { email, password: 'incorrect' });
    const missing = await post('/auth/login', {
      email: 'absent@example.test',
      password: 'incorrect',
    });
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual(missing.body);
    expect((await post('/admin/auth/login', { email, password })).status).toBe(
      401,
    );
    await prisma.user.update({
      where: { id: account.id },
      data: { active: false },
    });
    expect((await login()).status).toBe(401);
  });
  it('rejects expired, malformed and duplicate session cookies', async () => {
    await user();
    const res = await login();
    await prisma.session.updateMany({ data: { expiresAt: new Date(0) } });
    for (const value of [
      cookie(res),
      'cadna_customer=bad',
      `${cookie(res)}; ${cookie(res)}`,
    ])
      expect(
        (await request(app).get('/api/v1/account/profile').set('Cookie', value))
          .status,
      ).toBe(401);
  });
  it('updates own profile, rejects injection and requires current password for email changes', async () => {
    await user();
    const res = await login();
    const patch = (body: object) =>
      request(app)
        .patch('/api/v1/account/profile')
        .set('X-CADNA-Client', 'web')
        .set('Cookie', cookie(res))
        .set('X-CSRF-Token', res.body.data.csrfToken)
        .send(body);
    expect((await patch({ role: 'SUPER_ADMIN' })).status).toBe(400);
    expect(
      (await patch({ fullName: 'Updated Name', phone: '+2348000000000' })).body
        .data.profile.fullName,
    ).toBe('Updated Name');
    expect((await patch({ email: 'new@example.test' })).status).toBe(401);
    const updated = await patch({
      email: 'new@example.test',
      currentPassword: password,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.reauthenticate).toBe(true);
    expect(
      (
        await request(app)
          .get('/api/v1/auth/session')
          .set('Cookie', cookie(res))
      ).status,
    ).toBe(401);
  });
  it('does not overwrite another profile on duplicate email', async () => {
    await user();
    await user('CUSTOMER', 'other@example.test');
    const res = await login();
    const conflict = await request(app)
      .patch('/api/v1/account/profile')
      .set('X-CADNA-Client', 'web')
      .set('Cookie', cookie(res))
      .set('X-CSRF-Token', res.body.data.csrfToken)
      .send({ email: 'other@example.test', currentPassword: password });
    expect(conflict.status).toBe(409);
    expect(await prisma.session.count()).toBe(1);
  });
  it('applies persistent account throttling across app instances', async () => {
    await user();
    for (let i = 0; i < 10; i++)
      expect(
        (await post('/auth/login', { email, password: 'incorrect' })).status,
      ).toBe(401);
    app = createApp({ probe: async () => 1 });
    expect((await login()).status).toBe(429);
  });
});
describe('password recovery and outbox', () => {
  it('returns identical responses for absent/existing accounts and never exposes tokens', async () => {
    const absent = await post('/auth/forgot-password', { email });
    expect(await prisma.mailJob.count()).toBe(0);
    await user();
    const present = await post('/auth/forgot-password', { email });
    expect(present.status).toBe(202);
    expect(present.body).toEqual(absent.body);
    expect(JSON.stringify(present.body)).not.toContain('token');
    expect(await prisma.mailJob.count()).toBe(1);
  });
  it('consumes reset tokens exactly once and revokes all sessions', async () => {
    await user();
    const res = await login();
    const token = await resetToken();
    const results = await Promise.all([
      post('/auth/reset-password', {
        token,
        password: replacement,
        confirmPassword: replacement,
      }),
      post('/auth/reset-password', {
        token,
        password: replacement,
        confirmPassword: replacement,
      }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(
      (
        await request(app)
          .get('/api/v1/auth/session')
          .set('Cookie', cookie(res))
      ).status,
    ).toBe(401);
    expect((await login()).status).toBe(401);
    expect(
      (await post('/auth/login', { email, password: replacement })).status,
    ).toBe(200);
  });
  it('rejects expired tokens and invalidates older recovery links', async () => {
    await user();
    const first = await resetToken();
    const second = await resetToken();
    expect(
      (
        await post('/auth/reset-password', {
          token: first,
          password: replacement,
          confirmPassword: replacement,
        })
      ).status,
    ).toBe(400);
    await prisma.passwordReset.updateMany({ data: { expiresAt: new Date(0) } });
    expect(
      (
        await post('/auth/reset-password', {
          token: second,
          password: replacement,
          confirmPassword: replacement,
        })
      ).status,
    ).toBe(400);
  });
  it('delivers claimed outbox jobs once and retries failures without dropping mail', async () => {
    await user();
    await resetToken();
    const received: Mail[] = [];
    await Promise.all([
      processMailBatch(async (mail) => {
        received.push(mail);
      }),
      processMailBatch(async (mail) => {
        received.push(mail);
      }),
    ]);
    expect(received).toHaveLength(1);
    expect(await prisma.mailJob.count()).toBe(0);
    await post('/auth/forgot-password', { email });
    await processMailBatch(async () => {
      throw new Error('SMTP unavailable');
    });
    const job = await prisma.mailJob.findFirstOrThrow({
      orderBy: { createdAt: 'desc' },
    });
    expect(job.attempts).toBe(1);
    expect(job.availableAt.getTime()).toBeGreaterThan(Date.now());
  });
});
describe('mandatory admin MFA', () => {
  it('requires MFA enrollment before issuing an admin session and never accepts customer login', async () => {
    const { result, secret } = await enrolledAdmin();
    expect(result.body.data.recoveryCodes).toHaveLength(10);
    const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(stored.mfaSecret).not.toContain(secret);
    expect(await prisma.recoveryCode.count()).toBe(10);
    const read = await request(app)
      .get('/api/v1/admin/auth/session')
      .set('Cookie', cookie(result));
    expect(read.status).toBe(200);
    expect(read.body.data.admin.role).toBe('SUPER_ADMIN');
    expect((await login()).status).toBe(401);
    expect(
      (
        await request(app)
          .get('/api/v1/account/profile')
          .set('Cookie', cookie(result))
      ).status,
    ).toBe(401);
    expect(
      (
        await post('/admin/auth/logout')
          .set('Cookie', cookie(result))
          .set('X-CSRF-Token', result.body.data.csrfToken)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .get('/api/v1/admin/auth/session')
          .set('Cookie', cookie(result))
      ).status,
    ).toBe(401);
  });
  it('rejects reused challenges and TOTP steps across challenges', async () => {
    const { secret, challengeToken } = await enrolledAdmin();
    const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
    const code = totp(secret, email).generate({
      timestamp: Number(stored.mfaLastStep) * 30000,
    });
    expect(
      (await post('/admin/auth/mfa/verify', { challengeToken, code })).status,
    ).toBe(401);
    const second = await adminChallenge();
    expect(
      (await post('/admin/auth/mfa/enroll', { challengeToken: second })).status,
    ).toBe(409);
    expect(
      (await post('/admin/auth/mfa/verify', { challengeToken: second, code }))
        .status,
    ).toBe(401);
    expect(await prisma.session.count()).toBe(1);
  });
  it('accepts a fresh TOTP for an enrolled admin without returning recovery codes again', async () => {
    const { secret } = await enrolledAdmin();
    const challengeToken = await adminChallenge();
    const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
    const timestamp = Number(stored.mfaLastStep + 1n) * 30000;
    const result = await post('/admin/auth/mfa/verify', {
      challengeToken,
      code: totp(secret, email).generate({ timestamp }),
    });
    expect(result.status).toBe(200);
    expect(result.body.data.recoveryCodes).toBeUndefined();
    expect(await prisma.recoveryCode.count()).toBe(10);
  });
  it('atomically allows only one concurrent MFA completion', async () => {
    await user('SUPER_ADMIN');
    const challengeToken = await adminChallenge();
    const enrollment = await post('/admin/auth/mfa/enroll', { challengeToken });
    const code = totp(enrollment.body.data.secret, email).generate();
    const results = await Promise.all([
      post('/admin/auth/mfa/verify', { challengeToken, code }),
      post('/admin/auth/mfa/verify', { challengeToken, code }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    expect(await prisma.session.count()).toBe(1);
    expect(await prisma.recoveryCode.count()).toBe(10);
  });
  it('limits challenge attempts and rejects expired challenges', async () => {
    await user('SUPER_ADMIN');
    const challengeToken = await adminChallenge();
    await post('/admin/auth/mfa/enroll', { challengeToken });
    await prisma.mfaChallenge.updateMany({ data: { attempts: 5 } });
    expect(
      (await post('/admin/auth/mfa/verify', { challengeToken, code: '000000' }))
        .status,
    ).toBe(401);
    const expired = await adminChallenge();
    await prisma.mfaChallenge.updateMany({ data: { expiresAt: new Date(0) } });
    expect(
      (await post('/admin/auth/mfa/enroll', { challengeToken: expired }))
        .status,
    ).toBe(401);
  });
  it('recovery codes require password challenge and are single use', async () => {
    const { result } = await enrolledAdmin();
    const recoveryCode = result.body.data.recoveryCodes[0];
    expect(
      (
        await post('/admin/auth/mfa/recover', {
          challengeToken: 'a'.repeat(64),
          recoveryCode,
        })
      ).status,
    ).toBe(401);
    const challengeToken = await adminChallenge();
    expect(
      (await post('/admin/auth/mfa/recover', { challengeToken, recoveryCode }))
        .status,
    ).toBe(200);
    expect(await prisma.recoveryCode.count()).toBe(9);
    const second = await adminChallenge();
    expect(
      (
        await post('/admin/auth/mfa/recover', {
          challengeToken: second,
          recoveryCode,
        })
      ).status,
    ).toBe(401);
  });
  it('admin password reset cannot remove MFA or use the customer reset endpoint', async () => {
    const { result } = await enrolledAdmin();
    const token = await resetToken(true);
    expect(
      (
        await post('/auth/reset-password', {
          token,
          password: replacement,
          confirmPassword: replacement,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post('/admin/auth/reset-password', {
          token,
          password: replacement,
          confirmPassword: replacement,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .get('/api/v1/admin/auth/session')
          .set('Cookie', cookie(result))
      ).status,
    ).toBe(401);
    const challenge = await post('/admin/auth/login', {
      email,
      password: replacement,
    });
    expect(challenge.body.data.enrollmentRequired).toBe(false);
    expect(challenge.headers['set-cookie']).toBeUndefined();
  });
  it.each(['SUPER_ADMIN', 'OPERATIONS_LEAD', 'CUSTOMER_CARE'] as Role[])(
    'enforces current roles for %s',
    async (role) => {
      const { result } = await enrolledAdmin(role);
      const restricted = express();
      restricted.get(
        '/super',
        authenticate(true),
        requireRoles('SUPER_ADMIN'),
        (_req, res) => res.sendStatus(200),
      );
      restricted.use(errorHandler);
      expect(
        (await request(restricted).get('/super').set('Cookie', cookie(result)))
          .status,
      ).toBe(role === 'SUPER_ADMIN' ? 200 : 403);
      await prisma.user.updateMany({ data: { active: false } });
      expect(
        (await request(restricted).get('/super').set('Cookie', cookie(result)))
          .status,
      ).toBe(401);
    },
  );
});
describe('input and authorization boundaries', () => {
  it.each([
    '/auth/login',
    '/auth/register',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/admin/auth/login',
    '/admin/auth/forgot-password',
    '/admin/auth/reset-password',
    '/admin/auth/mfa/enroll',
    '/admin/auth/mfa/verify',
    '/admin/auth/mfa/recover',
  ])('validates %s', async (path) => {
    expect((await post(path, { unexpected: true })).status).toBe(400);
  });
  it.each(['/account/profile', '/auth/session', '/admin/auth/session'])(
    'requires a session for %s',
    async (path) => {
      expect((await request(app).get('/api/v1' + path)).status).toBe(401);
    },
  );
  it.each(['/auth/logout', '/admin/auth/logout'])(
    'requires a session for %s',
    async (path) => {
      expect((await post(path)).status).toBe(401);
    },
  );
  it('authenticates profile mutations before modifying data', async () => {
    expect(
      (
        await request(app)
          .patch('/api/v1/account/profile')
          .set('X-CADNA-Client', 'web')
          .send({ fullName: 'Changed' })
      ).status,
    ).toBe(401);
  });
  it('binds encrypted secrets to their user context', () => {
    const encrypted = seal('test-secret', 'mfa:user-1');
    expect(unseal(encrypted, 'mfa:user-1')).toBe('test-secret');
    expect(() => unseal(encrypted, 'mfa:user-2')).toThrow();
  });
});
