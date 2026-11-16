# CADNA Mart API

Milestone 0: Node.js 22+, Express 5, strict TypeScript, Prisma 6.19.3, MariaDB, zod, Vitest and Supertest.

## Local setup with XAMPP

1. Install current Node 22 LTS (`nvm use`; tooling requires 22.12+; validated on 22.15.0) and start MySQL in XAMPP Manager. XAMPP ships MariaDB; Apache is not required.
2. Create two databases in phpMyAdmin or the XAMPP MySQL client:

   ```sql
   CREATE DATABASE cadna_mart CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE DATABASE cadna_mart_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

3. Copy `.env.example` to `.env` only if you do not already have one. Set the actual host, port, username and password. Percent-encode URL credentials. XAMPP commonly uses port 3306 and local root without a password; use a dedicated password-protected account outside local development.
4. Run `npm ci`, `npm run db:deploy`, `npm run db:seed`, then `npm run dev`.
5. Open `http://localhost:3000/api/v1/health` and development Swagger UI at `http://localhost:3000/api/docs/`. Generated JSON is at `/api/docs/openapi.json`.

Prisma is constrained to version 6 (lockfile: 6.19.3) to retain the requested schema-based `DATABASE_URL` datasource configuration. See [Prisma datasource documentation](https://www.prisma.io/docs/orm/v6/prisma-schema/overview/data-sources). Migrations target MySQL/MariaDB, not SQLite. Only `settings` exists at this milestone. The seed is idempotent and does not overwrite existing store settings.

## Configuration

`DATABASE_URL` and `CORS_ORIGINS` are required. Missing or malformed required configuration fails during import, with field names only in errors. `DATABASE_URL_TEST` is mandatory for tests; its database name must end in `_test` and differ from the application database. Other defaults are documented in `.env.example`. Existing JWT, email, payment and upload values are not used until their features exist.

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

Tests deploy migrations to `DATABASE_URL_TEST`, delete settings rows before each integration test and after the suite, and disconnect. They never reset the development schema. Use a disposable test database: all its settings are removed. A missing server is a test failure. CI runs MariaDB 10.11 and the complete validation command.

Husky runs lint-staged before commits, conventional commit validation for commit messages and full validation before pushes. Project policy is **never push**. `npm ci` installs hooks automatically in a Git checkout.

See [API contract](docs/api-contract.md), [engineering rules](AGENTS.md), and [M0 report](docs/milestones/M0.md).
