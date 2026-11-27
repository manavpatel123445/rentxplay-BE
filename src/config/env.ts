/**
 * Environment config, read once at start-up.
 * Fails fast with a clear message instead of running with a bad value.
 */

function readPort(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PORT must be a whole number from 1 to 65535, got "${value}".`);
  }
  return port;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`);
  return value;
}

function readSecret(name: string): Uint8Array {
  const value = required(name);
  if (value.length < 32) throw new Error(`${name} must be at least 32 characters.`);
  return new TextEncoder().encode(value);
}

const nodeEnv = process.env.NODE_ENV ?? "development";

export const env = {
  nodeEnv,
  isProduction: nodeEnv === "production",
  port: readPort(process.env.PORT, 4000),
  /** Pooled connection the app uses (on Supabase: port 6543). */
  databaseUrl: required("DATABASE_URL"),
  auth: {
    accessSecret: readSecret("JWT_ACCESS_SECRET"),
    accessTtlSeconds: 15 * 60,
    refreshTtlDays: 30,
    /** bcrypt cost (NFR). Tests may lower it to stay fast. */
    bcryptCost: Number(process.env.BCRYPT_COST ?? 12),
  },
  /** Comma-separated list of web origins allowed to call the API. */
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
} as const;
