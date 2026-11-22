import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.js';
import { PAGE_SIZE, type ProductQuery } from './catalogue.schema.js';
export const visible: Prisma.ProductWhereInput = {
  published: true,
  category: { active: true },
};
const include = {
  images: { orderBy: { position: 'asc' as const } },
  specifications: { orderBy: { name: 'asc' as const } },
} satisfies Prisma.ProductInclude;
export type ProductRecord = Prisma.ProductGetPayload<{
  include: typeof include;
}>;
const categorySelect = { id: true, name: true, image: true } as const;
const categoryArgs = {
  where: { active: true },
  select: categorySelect,
  orderBy: [{ name: 'asc' as const }, { id: 'asc' as const }],
};
export const categories = () => prisma.category.findMany(categoryArgs);
export const product = (id: string) =>
  prisma.product.findFirst({ where: { ...visible, id }, include });
export function products(query: ProductQuery) {
  const where: Prisma.ProductWhereInput = {
    ...visible,
    ...(query.q
      ? { name: { contains: query.q.replace(/[\\%_]/g, '\\$&') } }
      : {}),
    ...(query.category ? { categoryId: query.category } : {}),
    price: { gte: query.min, lte: query.max },
    ...(query.available === '1' ? { stock: { gt: 0 } } : {}),
  };
  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    query.sort === 'name'
      ? [{ name: 'asc' }, { id: 'asc' }]
      : [{ price: query.sort === 'price-asc' ? 'asc' : 'desc' }, { id: 'asc' }];
  return prisma.$transaction(
    async (tx) => {
      const total = await tx.product.count({ where });
      const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const page = Math.min(query.page, pages);
      const items = await tx.product.findMany({
        where,
        include,
        orderBy,
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      });
      return { items, total, page, pages };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
export function home() {
  return prisma.$transaction(
    async (tx) => ({
      categories: await tx.category.findMany(categoryArgs),
      featuredProducts: await tx.product.findMany({
        where: { ...visible, featured: true },
        include,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: PAGE_SIZE,
      }),
    }),
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
