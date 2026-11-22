import { z } from 'zod';
export const PAGE_SIZE = 8;
const integer = (max: number) =>
  z
    .string()
    .regex(/^\d+$/)
    .refine(
      (v) => Number.isSafeInteger(Number(v)) && Number(v) <= max,
      'Integer out of range',
    )
    .transform(Number);
export const queryFields = {
  q: z.string().trim().min(1).max(120).optional(),
  category: z.uuid().optional(),
  min: integer(Number.MAX_SAFE_INTEGER).optional(),
  max: integer(Number.MAX_SAFE_INTEGER).optional(),
  available: z.enum(['0', '1']).default('0'),
  sort: z.enum(['price-asc', 'price-desc', 'name']).default('name'),
  page: integer(1000000)
    .refine((v) => v >= 1, 'Page must be positive')
    .prefault('1'),
};
export const productQuery = z
  .strictObject(queryFields)
  .refine((v) => v.min === undefined || v.max === undefined || v.min <= v.max, {
    path: ['max'],
    message: 'Must be at least min',
  });
export type ProductQuery = z.infer<typeof productQuery>;
const empty = z.strictObject({});
const input = (query: z.ZodType, params: z.ZodType = empty) =>
  z.object({ body: empty.optional(), query, params });
export const listInput = input(productQuery);
export const emptyInput = input(empty);
export const detailInput = input(empty, z.strictObject({ id: z.uuid() }));
const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const categorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  image: z.string(),
});
export const productSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  categoryId: z.uuid(),
  price: money,
  originalPrice: money,
  images: z.array(z.string()),
  description: z.string(),
  stock: z.number().int().nonnegative(),
  specifications: z.record(z.string(), z.string()),
});
export const listSchema = z.object({
  items: z.array(productSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pages: z.number().int().positive(),
});
export const homeSchema = z.object({
  featuredProducts: z.array(productSchema),
  categories: z.array(categorySchema),
  banners: z.array(z.never()),
});
