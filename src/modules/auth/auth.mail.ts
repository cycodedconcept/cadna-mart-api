import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { env } from '@/config/env.js';
import { logger } from '@/lib/logger.js';
import { authDb } from './auth.repository.js';
import { unseal } from './auth.crypto.js';
export const mailSchema = z.strictObject({
  to: z.string().email(),
  subject: z.string(),
  text: z.string(),
});
export type Mail = z.infer<typeof mailSchema>;
export type Deliver = (mail: Mail, id: string) => Promise<void>;
export const deliverMail: Deliver = async (mail, id) => {
  if (env.MAIL_TRANSPORT === 'file') {
    const directory = resolve('.local-mail');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(
      resolve(directory, `${id}.json`),
      JSON.stringify(mail, null, 2),
      { mode: 0o600 },
    );
    return;
  }
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    requireTLS: !env.SMTP_SECURE,
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 15000,
    logger: false,
    debug: false,
  });
  try {
    await transport.sendMail({
      ...mail,
      from: env.MAIL_FROM,
      messageId: `<${id}@cadna.local>`,
    });
  } finally {
    transport.close();
  }
};
// Claim by conditional update; a crashed worker's lease expires in one minute.
export async function processMailBatch(deliver: Deliver = deliverMail) {
  await authDb.mailJob.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
  const jobs = await authDb.mailJob.findMany({
    where: { availableAt: { lte: new Date() }, attempts: { lt: 5 } },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });
  for (const job of jobs) {
    const claim = await authDb.mailJob.updateMany({
      where: {
        id: job.id,
        attempts: job.attempts,
        availableAt: { lte: new Date() },
      },
      data: {
        attempts: { increment: 1 },
        availableAt: new Date(Date.now() + 60000),
      },
    });
    if (!claim.count) continue;
    try {
      await deliver(
        mailSchema.parse(JSON.parse(unseal(job.payload, `mail:${job.id}`))),
        job.id,
      );
      await authDb.mailJob.deleteMany({ where: { id: job.id } });
    } catch {
      logger.warn(
        { jobId: job.id },
        'Authentication email delivery failed; retry scheduled',
      );
    }
  }
}
