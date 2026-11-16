# CADNA Mart API engineering rules

- Use Node.js 22+, Express 5, strict TypeScript and Prisma with MariaDB.
- Keep features under `src/modules/<feature>/` with routes, schemas, services and repositories as complexity requires. Shared infrastructure belongs in config, lib or middleware. Keep app creation separate from process startup.
- Represent all money as non-negative safe integer kobo. Never use floating point naira for accounting. Recalculate prices and totals on the server.
- Validate every input (body, query, route params, relevant headers and external callbacks) with zod. Use parsed values from `res.locals.input`.
- Enforce authentication and explicit role checks on every admin route; enforce ownership on customer resources.
- Add tests for every endpoint, including invalid input, failures, authentication and authorization where applicable. Use only DATABASE_URL_TEST with a database name ending in `_test`; never reset development or production databases.
- Return consistent AppError envelopes; never expose internal errors or credentials. Log no request bodies, tokens or secrets.
- Never commit secrets. Keep `.env` ignored and `.env.example` documented.
- Generate OpenAPI from zod schemas and update docs/api-contract.md as contracts become real.
- Write `docs/milestones/M<n>.md` at the end of each milestone with scope, validation results and limitations.
- Run `npm run validate` before completing work. Keep migrations and package-lock.json committed.
- Use conventional commits. Never push.
