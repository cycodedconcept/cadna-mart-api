import { randomUUID } from 'node:crypto';
import {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  it,
  expect,
  vi,
} from 'vitest';
import request from 'supertest';
import { prisma } from '@/lib/prisma.js';
import { createApp } from '@/app.js';
import * as repository from '@/modules/catalogue/catalogue.repository.js';
import { migrateTestDatabase, resetTestDatabase } from './database.js';
const app = createApp({ rateLimit: 10000 });
let migrated = false;
beforeAll(() => {
  migrateTestDatabase();
  migrated = true;
});
beforeEach(resetTestDatabase);
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  try {
    if (migrated) await resetTestDatabase();
  } finally {
    await prisma.$disconnect();
  }
});
const get = (path: string) => request(app).get('/api/v1' + path);
const category = (name = 'Electronics', active = true) =>
  prisma.category.create({
    data: { name, active, image: 'https://example.test/category.png' },
  });
async function product(
  categoryId: string,
  overrides: {
    name?: string;
    price?: bigint;
    originalPrice?: bigint;
    stock?: number;
    published?: boolean;
    featured?: boolean;
  } = {},
) {
  return prisma.product.create({
    data: {
      categoryId,
      name: 'Laptop',
      price: 123370000n,
      originalPrice: 130000000n,
      description: 'A laptop',
      stock: 2,
      published: true,
      ...overrides,
    },
  });
}
it('serves empty catalogue and home without authentication', async () => {
  expect((await get('/categories')).body).toEqual({ success: true, data: [] });
  expect((await get('/products')).body.data).toEqual({
    items: [],
    total: 0,
    page: 1,
    pages: 1,
  });
  const home = await get('/home');
  expect(home.status).toBe(200);
  expect(home.body.data).toEqual({
    categories: [],
    featuredProducts: [],
    banners: [],
  });
});
it('lists only active categories in stable name order, including empty categories', async () => {
  const z = await category('Z');
  const a = await category('A');
  await category('Hidden', false);
  const response = await get('/categories');
  expect(response.status).toBe(200);
  expect(response.body.data).toEqual(
    [a, z].map(({ id, name, image }) => ({ id, name, image })),
  );
});
it('returns exact kobo, ordered images and specifications without internal publication fields', async () => {
  const cat = await category();
  const item = await product(cat.id, {
    price: 9007199254740991n,
    originalPrice: 9007199254740991n,
  });
  await prisma.productImage.createMany({
    data: [
      { productId: item.id, position: 2, url: 'https://example.test/2.png' },
      { productId: item.id, position: 1, url: 'https://example.test/1.png' },
    ],
  });
  await prisma.productSpecification.create({
    data: { productId: item.id, name: 'RAM', value: '16 GB' },
  });
  const detail = await get(`/products/${item.id}`);
  expect(detail.status).toBe(200);
  expect(detail.body.data).toEqual({
    id: item.id,
    name: item.name,
    categoryId: cat.id,
    price: Number.MAX_SAFE_INTEGER,
    originalPrice: Number.MAX_SAFE_INTEGER,
    description: item.description,
    stock: 2,
    images: ['https://example.test/1.png', 'https://example.test/2.png'],
    specifications: { RAM: '16 GB' },
  });
  expect((await get('/products')).body.data.items).toEqual([detail.body.data]);
});
it('hides unpublished products and products in inactive categories across list/detail/home', async () => {
  const cat = await category();
  const hiddenCat = await category('Hidden', false);
  const publicItem = await product(cat.id, { featured: true });
  const draft = await product(cat.id, { published: false, featured: true });
  const hidden = await product(hiddenCat.id, { featured: true });
  expect(
    (await get('/products')).body.data.items.map((p: { id: string }) => p.id),
  ).toEqual([publicItem.id]);
  expect(
    (await get('/home')).body.data.featuredProducts.map(
      (p: { id: string }) => p.id,
    ),
  ).toEqual([publicItem.id]);
  for (const id of [draft.id, hidden.id, randomUUID()]) {
    const response = await get(`/products/${id}`);
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('PRODUCT_NOT_FOUND');
  }
});
it('combines case-insensitive name search, category, inclusive price and stock filters', async () => {
  const cat = await category();
  const other = await category('Other');
  const match = await product(cat.id, { name: 'Laptop A', price: 200n });
  await product(cat.id, { name: 'Laptop B', price: 200n, stock: 0 });
  await product(other.id, { name: 'Laptop C', price: 200n });
  await product(cat.id, { name: 'Laptop D', price: 201n });
  const response = await get('/products').query({
    q: ' laptop ',
    category: cat.id,
    min: '200',
    max: '200',
    available: '1',
  });
  expect(response.status).toBe(200);
  expect(response.body.data.items.map((p: { id: string }) => p.id)).toEqual([
    match.id,
  ]);
  expect(
    (await get('/products').query({ category: cat.id, available: '0' })).body
      .data.total,
  ).toBe(3);
  expect(
    (await get('/products').query({ category: randomUUID() })).body.data.total,
  ).toBe(0);
});
it('treats SQL wildcard characters as literal search text', async () => {
  const cat = await category();
  await product(cat.id, { name: '100%_value\\item' });
  await product(cat.id, { name: 'ordinary item' });
  for (const q of ['%', '_', '\\']) {
    const response = await get('/products').query({ q });
    expect(response.status).toBe(200);
    expect(response.body.data.total).toBe(1);
  }
});
it('sorts and paginates deterministically, clamping pages to the final page', async () => {
  const cat = await category();
  for (let i = 0; i < 10; i++)
    await product(cat.id, {
      name: `Item ${i}`,
      price: BigInt(i),
      featured: true,
    });
  const first = (await get('/products')).body.data;
  expect(first).toMatchObject({ total: 10, page: 1, pages: 2 });
  expect(first.items).toHaveLength(8);
  const last = (await get('/products?page=999')).body.data;
  expect(last).toMatchObject({ total: 10, page: 2, pages: 2 });
  expect(last.items).toHaveLength(2);
  expect((await get('/products?sort=price-asc')).body.data.items[0].price).toBe(
    0,
  );
  expect(
    (await get('/products?sort=price-desc')).body.data.items[0].price,
  ).toBe(9);
  expect((await get('/home')).body.data.featuredProducts).toHaveLength(8);
  await prisma.product.updateMany({ data: { name: 'Same', price: 0 } });
  const stable = (await get('/products?sort=price-asc')).body.data.items.map(
    (p: { id: string }) => p.id,
  );
  const again = (await get('/products?sort=price-asc')).body.data.items.map(
    (p: { id: string }) => p.id,
  );
  expect(stable).toEqual(again);
  expect(stable).toEqual([...stable].sort());
});
it.each([
  'page=0',
  'page=-1',
  'page=1.5',
  'page=1000001',
  'page=1&page=2',
  'min=-1',
  'min=1.1',
  'min=1e3',
  'min=',
  'max=9007199254740992',
  'min=2&max=1',
  'available=true',
  'sort=invalid',
  'category=bad',
  'q=',
  'q=' + 'a'.repeat(121),
  'unexpected=true',
])('rejects invalid product query %s', async (query) => {
  const response = await get('/products?' + query);
  expect(response.status).toBe(400);
  expect(response.body.code).toBe('VALIDATION_ERROR');
});
it.each([
  '/categories?extra=1',
  '/home?extra=1',
  '/products/bad',
  '/products/' + randomUUID() + '?extra=1',
])('validates read input for %s', async (path) => {
  expect((await get(path)).status).toBe(400);
});
it.each(['/categories', '/products', '/home', '/products/' + randomUUID()])(
  'rejects unexpected GET bodies for %s',
  async (path) => {
    expect((await get(path).send({ extra: true })).status).toBe(400);
  },
);
it.each([
  ['/categories', 'categories'],
  ['/products', 'products'],
  ['/home', 'home'],
  ['/products/' + randomUUID(), 'product'],
] as const)('sanitizes repository failures for %s', async (path, method) => {
  vi.spyOn(repository, method).mockRejectedValueOnce(
    new Error('secret database credentials'),
  );
  const response = await get(path);
  expect(response.status).toBe(500);
  expect(response.body.success).toBe(false);
  expect(JSON.stringify(response.body)).not.toContain('secret');
});
it('enforces database money bounds, reference-price ordering and nonnegative stock', async () => {
  const cat = await category();
  for (const overrides of [
    { price: -1n },
    { price: 9007199254740992n, originalPrice: 9007199254740992n },
    { originalPrice: 1n },
    { stock: -1 },
  ]) {
    await expect(product(cat.id, overrides)).rejects.toThrow();
  }
});
it('documents all public endpoints and input schemas in OpenAPI', async () => {
  const response = await request(createApp({ mode: 'development' })).get(
    '/api/docs/openapi.json',
  );
  expect(response.status).toBe(200);
  for (const path of ['/categories', '/products', '/products/{id}', '/home']) {
    expect(response.body.paths['/api/v1' + path].get.security).toEqual([]);
    expect(
      response.body.paths['/api/v1' + path].get.responses['200'],
    ).toBeDefined();
  }
  expect(
    response.body.paths['/api/v1/products'].get.parameters.map(
      (p: { name: string }) => p.name,
    ),
  ).toContain('min');
});
