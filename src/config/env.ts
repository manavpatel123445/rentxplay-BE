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

const nodeEnv = process.env.NODE_ENV ?? "development";

export const env = {
  nodeEnv,
  isProduction: nodeEnv === "production",
  port: readPort(process.env.PORT, 4000),
  /** Comma-separated list of web origins allowed to call the API. */
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
} as const;
