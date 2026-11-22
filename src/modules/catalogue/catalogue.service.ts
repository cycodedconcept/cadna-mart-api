import { AppError } from '@/lib/errors.js';
import { kobo } from '@/lib/money.js';
import * as repository from './catalogue.repository.js';
import type { ProductQuery } from './catalogue.schema.js';
const serialize = (product: repository.ProductRecord) => ({
  id: product.id,
  name: product.name,
  categoryId: product.categoryId,
  price: kobo(Number(product.price)),
  originalPrice: kobo(Number(product.originalPrice)),
  description: product.description,
  stock: product.stock,
  images: product.images.map((image) => image.url),
  specifications: Object.fromEntries(
    product.specifications.map((spec) => [spec.name, spec.value]),
  ),
});
export const categories = () => repository.categories();
export async function product(id: string) {
  const result = await repository.product(id);
  if (!result)
    throw new AppError(404, 'Product not found', 'PRODUCT_NOT_FOUND');
  return serialize(result);
}
export async function products(query: ProductQuery) {
  const result = await repository.products(query);
  return { ...result, items: result.items.map(serialize) };
}
export async function home() {
  const result = await repository.home();
  return {
    ...result,
    featuredProducts: result.featuredProducts.map(serialize),
    banners: [],
  };
}
