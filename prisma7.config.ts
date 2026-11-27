// Prisma 7 CLI config (migrate, studio, seed). The app itself connects in src/lib/db.ts.
// Named prisma7.config.ts so it does not clash with Prisma 8's prisma.config.ts format.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.ts",
  },
  datasource: {
    // Migrations need a direct connection; on Supabase the pooled URL (DATABASE_URL) can't run them.
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
