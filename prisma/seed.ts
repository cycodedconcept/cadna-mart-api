import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
try {
  await prisma.setting.upsert({
    where: { key: 'store' },
    update: {},
    create: {
      key: 'store',
      value: { name: 'CADNA Mart', currency: 'NGN', timeZone: 'Africa/Lagos' },
    },
  });
} finally {
  await prisma.$disconnect();
}
