# rentxplay-BE

The RentXPlay API: Node.js + Express 5 + TypeScript. This is the bare runtime; no database, models or feature modules yet.

## Run it

Needs Node.js 24 or newer (it runs the TypeScript files directly in development).

```bash
npm install
cp .env.example .env
npm run dev
```

Then open http://localhost:4000/health.

| Script | What it does |
| --- | --- |
| `npm run dev` | Runs `src/server.ts` and restarts on changes |
| `npm run typecheck` | Checks types without building |
| `npm run build` | Compiles to `dist/` |
| `npm start` | Runs the compiled build |

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/health` | `{ "status": "ok", "uptimeSeconds": 12 }` |
| GET | `/api/v1` | API name and version |

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

Planned next (see the HLD in the web repo): Prisma + PostgreSQL on Supabase, Zod validation, then the auth, listings, bookings and payments modules under `/api/v1`.
