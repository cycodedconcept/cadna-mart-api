# CADNA Mart API

Milestones 0–2: Node.js 22+, Express 5, strict TypeScript, Prisma 6.19.3, MariaDB, zod, Vitest and Supertest.

## Local setup with XAMPP

1. Install current Node 22 LTS (`nvm use`; tooling requires 22.12+; validated on 22.15.0) and start MySQL in XAMPP Manager. XAMPP ships MariaDB; Apache is not required.
2. Create two databases in phpMyAdmin or the XAMPP MySQL client:

   ```sql
   CREATE DATABASE cadna_mart CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE DATABASE cadna_mart_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

3. Copy `.env.example` to `.env` only if you do not already have one. Set the actual host, port, username and password. Percent-encode URL credentials. XAMPP commonly uses port 3306 and local root without a password; use a dedicated password-protected account outside local development.
4. Generate `AUTH_ENCRYPTION_KEY` using the command in `.env.example` and add it to your existing `.env`. Run `npm ci`, `npm run db:deploy`, `npm run db:seed`, then `npm run dev`.
5. Open `http://localhost:3000/api/v1/health` and development Swagger UI at `http://localhost:3000/api/docs/`. Generated JSON is at `/api/docs/openapi.json`.

Prisma is constrained to version 6 (lockfile: 6.19.3) to retain the requested schema-based `DATABASE_URL` datasource configuration. See [Prisma datasource documentation](https://www.prisma.io/docs/orm/v6/prisma-schema/overview/data-sources). Migrations target MySQL/MariaDB, not SQLite. The schema includes settings, users, sessions, password resets, MFA challenges, recovery codes, authentication throttles the encrypted mail outbox, categories, products, ordered images and named specifications. The seed is idempotent and does not overwrite existing store settings.

## Configuration

`DATABASE_URL`, `CORS_ORIGINS` and `AUTH_ENCRYPTION_KEY` (64 hexadecimal characters) are required. Missing or malformed required configuration fails during import, with field names only in errors. `DATABASE_URL_TEST` is mandatory for tests; its database name must end in `_test` and differ from the application database. Other defaults are documented in `.env.example`. Authentication uses opaque database sessions rather than JWTs. SMTP configuration is documented in `.env.example`.

CORS origins are comma-separated exact origins without trailing slashes. JSON bodies default to 100kb. The API uses `/api/v1`, Helmet headers, generated request IDs, structured Pino logging and an in-memory per-IP rate limiter (100 requests/minute by default). Proxy trust is disabled; configure trusted proxy topology explicitly before deployment. Multiple replicas will need a shared rate-limit store. Request bodies and query strings are excluded from access logs.

Errors have `{ success: false, message, code, fieldErrors }`. Health returns `{ status, version, database }`, HTTP 200 when connected or 503 when disconnected. Startup requires a successful database connection. SIGINT/SIGTERM stop accepting requests and disconnect Prisma, with a ten-second shutdown deadline.

## Development and validation

- `npm run dev`: tsx watch.
- `npm run build` / `npm start`: compile, rewrite `@/` imports and run output.
- `npm run lint`, `npm run format`, `npm run format:check`, `npm run typecheck`.
- `npm test`: unit and real MariaDB integration tests. No automatic skips or mock fallback.
- `npm run test:unit`: HTTP middleware and helper tests without a live DB; test URL safety checks still apply.
- `npm run validate`: formatting, lint, types, tests, production build.
- `npm run db:migrate -- --name <change>`: author a development migration.
- `npm run db:deploy`: apply committed migrations.

Tests deploy migrations to `DATABASE_URL_TEST`, delete catalogue, authentication and settings rows before each integration test and after the suite, and disconnect. They never reset the development schema. Use a disposable test database: all its catalogue, authentication and settings data is removed. A missing server is a test failure. CI runs MariaDB 10.11 and the complete validation command.

Husky runs lint-staged before commits, conventional commit validation for commit messages and full validation before pushes. Project policy is **never push**. `npm ci` installs hooks automatically in a Git checkout.

See [API contract](docs/api-contract.md), [engineering rules](AGENTS.md), and [M0 report](docs/milestones/M0.md).

## Authentication operations

Run `npm run mail:work` alongside the development API to process password-recovery messages. With `MAIL_TRANSPORT=file`, messages are written to the ignored `.local-mail/` directory; they contain sensitive recovery links. Production requires HTTPS application URLs and SMTP; use `npm run mail:start` after building. Keep the encryption key stable and secret: replacing it makes existing encrypted MFA secrets and queued mail unreadable.

Create an administrator using `npm run admin:create`, supplying a JSON object on stdin with `email`, `fullName`, `password` (15–128 characters) and `role` (`SUPER_ADMIN`, `OPERATIONS_LEAD` or `CUSTOMER_CARE`). Use a secure input source; do not put passwords in command arguments or shell history. The first login requires TOTP enrollment and returns ten single-use recovery codes after verification. No default administrator is seeded.

Browser clients must use credentials-included requests and send `X-CADNA-Client: web` for writes. Authenticated writes also require `X-CSRF-Token` from login or the session endpoint. See the implemented M1 contracts in [API contract](docs/api-contract.md) and [M1 report](docs/milestones/M1.md).

## Catalogue

M2 exposes public categories, filtered/paginated products, product detail and home data under `/api/v1`. Apply migrations with `npm run db:deploy` before using these routes. No demo catalogue is seeded: an empty database returns empty lists. Products must be published and belong to active categories to appear. Prices and price filters are integer kobo; identifiers are UUID strings. Admin catalogue management is planned for M7. See [implemented contracts](docs/api-contract.md) and [M2 report](docs/milestones/M2.md).

## Terminal startup and Postman

Run `npm run dev` after starting MariaDB and applying migrations with `npm run db:deploy`. With `LOG_LEVEL=info` (or `debug`/`trace`) in your `.env`, startup logs include `Database connected successfully` followed by `API listening` and the port. Logs remain structured JSON. Connection failures log `Database connection failed during startup` and exit without starting HTTP. No database URL or credentials are logged.

Import `docs/postman/M2.postman_collection.json` into Postman. Its collection variable `baseUrl` defaults to `http://localhost:3000/api/v1`; change the port if your API uses a different one. Send **Health — database connection** first, then **Categories**, **Products**, and **Home**. No authentication or request body is needed. The Products request saves the first returned UUID as `productId` for **Product detail**. With no catalogue records, lists are empty and detail returns 404; create a published product in an active category before expecting the detail check to pass. The collection also includes invalid-input requests with expected 400/404 assertions. Prices are integer kobo.
