# Frontend API contract inventory

Inspected 2026-11-16: `../cadna-mart/src`, including App routes, auth adapter/types, catalogue types/query/data, cart persistence/slice, checkout slice, order repository/types, account pages and footer.

## Observed calls

**The CADNA storefront makes zero HTTP API calls.** There is no fetch, axios, RTK Query or API client. Auth uses delayed mocks; catalogue uses static arrays; cart/orders use localStorage; newsletter only changes component state. Image assets are not API calls. Logout clears local state. No real payment, delivery, seller or investor integration exists.

**Admin frontend: not built yet, confirmed by the user.** There are therefore zero admin API calls to inventory. Admin UI screenshots/designs may be supplied later to propose routes and fields; no admin contracts are claimed as observed. Nearby unrelated frontend folders were excluded.

## Proposed contracts replacing storefront mocks

Paths below are **proposed**, relative to `/api/v1`, and unimplemented in M0. Milestones are a proposed roadmap; no backend M1–M9 specification was supplied. Success responses use `{success:true,data:...}` except health. Errors use `{success:false,message,code,fieldErrors}`. All API money is integer kobo; current catalogue mock prices are naira and will require frontend conversion changes.

Shared response shapes:

- Profile: `id, fullName, email, phone` (server id is absent from mock).
- Category: `id, name, image`.
- Product: `id, name, categoryId, price, originalPrice, images[], description, stock, specifications{string:string}`.
- CartLine input: `productId, variantId, quantity`; current variant is `default`.
- OrderItem: `productId, name, image, quantity, unitPrice, total`.
- CustomerDelivery: `fullName, email, phone, address, city, state, instructions`.
- Order: `id, customerId, reference, createdAt, items:OrderItem[], subtotal, total, status, delivery{address,city,state}`. Status is pending/processing/shipped/delivered/cancelled; timestamps are UTC ISO, displayed in Africa/Lagos.

| Method | Proposed path             | Request fields                                                        | Response data                                                  | Page / source                                                                   | Milestone |
| ------ | ------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------- |
| POST   | /auth/register            | fullName, email, phone, password, confirmPassword                     | message (mock returns void)                                    | AuthPage register; auth/types.ts                                                | 1         |
| POST   | /auth/login               | email, password                                                       | profile: Profile; session cookie                               | AuthPage login; auth/adapter.ts                                                 | 1         |
| POST   | /auth/logout              | session cookie                                                        | message                                                        | AccountLayout; auth/slice.ts                                                    | 1         |
| POST   | /auth/forgot-password     | email                                                                 | generic message                                                | AuthPage forgot                                                                 | 1         |
| POST   | /auth/reset-password      | token, password, confirmPassword                                      | message                                                        | AuthPage reset; token is a required addition absent from mock                   | 1         |
| GET    | /account/profile          | session cookie                                                        | Profile                                                        | AccountPage /account; Redux profile                                             | 1         |
| PATCH  | /account/profile          | fullName, email, phone                                                | Profile                                                        | AccountPage /account/profile; updateProfile                                     | 1         |
| GET    | /categories               | none                                                                  | Category[]                                                     | HomePage, CataloguePage; static data                                            | 2         |
| GET    | /products                 | q, category, min, max, available, sort, page                          | items: Product[], total, page, pages                           | CataloguePage; catalogue/query.ts; 8 items/page; sort price-asc/price-desc/name | 2         |
| GET    | /products/:id             | id                                                                    | Product                                                        | CataloguePage detail; static lookup                                             | 2         |
| GET    | /home                     | none                                                                  | featuredProducts: Product[], categories: Category[], banners[] | HomePage; data/home.ts; grouping proposed                                       | 2         |
| POST   | /cart/quote               | items: CartLine[]                                                     | items: OrderItem[], subtotal, total, availability errors       | CartPage; OrderSummary; local selectors                                         | 3         |
| POST   | /orders                   | customer: CustomerDelivery, items: CartLine[]; Idempotency-Key header | Order                                                          | CheckoutPage; checkout/slice.ts submitCheckout                                  | 4         |
| GET    | /orders                   | pagination (proposed); session cookie                                 | orders: Order[], page, pages, total                            | OrdersPage, OrderDashboard; repository.list                                     | 4         |
| GET    | /orders/:id               | id; session cookie                                                    | Order                                                          | OrderDetailsPage, ConfirmationPage                                              | 4         |
| POST   | /newsletter/subscriptions | email                                                                 | message                                                        | StoreFooter; currently setSubscribed(true)                                      | 8         |

Cart add/change/remove/clear stay local in M3; no server cart CRUD is observed. Checkout sends product identifiers and quantities; the server calculates totals and assigns identity/reference. Never trust client totals, customerId or status. Ownership comes from the session. Browser repository `save` becomes server order creation, not an endpoint accepting arbitrary order records. Home/newsletter response shapes need agreement during integration.

## Proposed milestone ownership

| Milestone | Scope                                       | Evidence/status                                      |
| --------- | ------------------------------------------- | ---------------------------------------------------- |
| 1         | Authentication, sessions, customer profile  | Mock auth adapter                                    |
| 2         | Catalogue, categories, home data            | Static data                                          |
| 3         | Cart validation and pricing                 | Local cart selectors                                 |
| 4         | Order creation/history/details              | Demo checkout and local repository                   |
| 5         | Payments and verified webhooks              | No calls; provider contract pending                  |
| 6         | Delivery and fulfilment                     | No calls; provider contract pending                  |
| 7         | Admin roles and management                  | Admin not built; UI/design and routes/fields pending |
| 8         | Newsletter/content/settings                 | Footer mock; admin UI/design pending                 |
| 9         | Integration hardening and release readiness | No additional observed calls                         |

M0 implements `GET /api/v1/health`: no request fields; response `status: ok|degraded, version: string, database: connected|disconnected`. Development-only `GET /api/docs/` serves Swagger UI; `GET /api/docs/openapi.json` serves generated OpenAPI.
