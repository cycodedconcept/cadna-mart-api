import { PrismaClient } from '@prisma/client';
import { env } from '@/config/env.js';
export const prisma = new PrismaClient({
  datasourceUrl:
    env.NODE_ENV === 'test' ? env.DATABASE_URL_TEST : env.DATABASE_URL,
});
