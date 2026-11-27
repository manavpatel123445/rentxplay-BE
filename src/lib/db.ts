import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../config/env.ts";
import { PrismaClient } from "../generated/prisma/client.ts";

/**
 * The one Prisma client for the whole app. Prisma 7 talks to Postgres through a driver
 * adapter (node-postgres here), which also owns the connection pool.
 */
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.databaseUrl }),
  log: env.isProduction ? ["error"] : ["warn", "error"],
});

/** True when a trivial query succeeds within `timeoutMs`. Used by /health/ready. */
export async function databaseIsReachable(timeoutMs = 2000): Promise<boolean> {
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error("timeout"));
        }, timeoutMs).unref();
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}
