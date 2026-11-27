# rentxplay-BE

The RentXPlay API: Node.js + Express 5 + TypeScript. Express runtime with PostgreSQL through Prisma 7; feature modules (auth, items, bookings, payments) come next.

## Run it

Needs Node.js 24 or newer (it runs the TypeScript files directly in development).

```bash
npm install
cp .env.example .env
npm run dev
```

Then open http://localhost:4000/health.

## Database (first time)

1. Install PostgreSQL (the EnterpriseDB installer for macOS works), then create the local login and database. It asks for the `postgres` password you set while installing:
   ```bash
   /Library/PostgreSQL/19/bin/psql -U postgres -h localhost -f scripts/create-local-db.sql
   ```
2. Set `SEED_PASSWORD` in `.env`, then create the tables and demo data:
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
3. Check: http://localhost:4000/health/ready returns `{"status":"ready"}`.

Browse the data with `npm run db:studio` (http://localhost:5555).

| Script | What it does |
| --- | --- |
| `npm run dev` | Runs `src/server.ts` and restarts on changes |
| `npm run typecheck` | Checks types without building |
| `npm test` | Jest + Supertest integration tests against your local database (cleans up after itself) |
| `npm run build` | Compiles to `dist/` |
| `npm start` | Runs the compiled build |
| `npm run db:migrate` | Applies migrations (creates new ones after schema changes) |
| `npm run db:seed` | Loads demo categories, users and items |
| `npm run db:studio` | Opens Prisma Studio to browse tables |

## Type safety

`npm run lint` uses typescript-eslint's strictest type-aware rules: no `any` (written or inferred from Express, Supertest or JSON), no `!` non-null assertions. Read untyped input as `unknown` and check it with Zod (`src/lib/validate.ts`, `src/lib/request.ts`). TypeScript is pinned to 5.9 because typescript-eslint does not support TypeScript 7 yet.

## CI

`.github/workflows/ci.yml` runs on pushes to `main`, `staging`, `dev` and on pull requests: a fresh Postgres 17, `prisma migrate deploy`, then lint, type-check, tests and build.

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/health` | `{ "status": "ok", "uptimeSeconds": 12 }` |
| GET | `/health/ready` | `200 { "status": "ready" }`, or `503` when the database is unreachable |
| GET | `/api/v1` | API name and version |
| POST | `/api/v1/auth/signup` | `{ email, password }` → `201 { user, accessToken }` + refresh cookie. Name and phone come later |
| POST | `/api/v1/auth/login` | `{ email, password }` → `200`, same shape. Sign-up and log-in: 5 tries per 15 minutes per IP and per email |
| POST | `/api/v1/auth/refresh` | Rotates the refresh token (cookie, or `{ refreshToken }` for mobile) → new access token |
| POST | `/api/v1/auth/logout` | Revokes the refresh token, clears the cookie → `204` |
| GET | `/api/v1/me` | `{ id, email, name, phone, phoneVerified }` (name and phone may be null). Needs `Authorization: Bearer <accessToken>` |

Mobile apps send `"client": "mobile"` on signup and login to get the refresh token in the body instead of a cookie. Full rules: [docs/02-api-design.md](docs/02-api-design.md#auth--mvp-fr-01-fr-02).

Unknown routes return `404` with `{ "error": { "code": "not_found", "message": "…" } }`.

## Layout

```
src/
  server.ts          starts the HTTP server, graceful shutdown
  app.ts             builds the Express app (used by tests later)
  config/env.ts      reads and checks environment variables
  routes/            route handlers
  middlewares/       404 and error handling
```

## Design docs

- [Data model](docs/01-data-model.md): tables, enums, constraints (no double booking), indexes, booking lifecycle
- [API design](docs/02-api-design.md): conventions, every endpoint by module, payments and webhooks, real-time events, background jobs, build order

Planned next: Prisma + PostgreSQL on Supabase, Zod validation, then the auth, listings, bookings and payments modules under `/api/v1`.
