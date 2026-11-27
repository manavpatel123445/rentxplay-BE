import type { Request } from "express";
import { z } from "zod";

/**
 * Express types req.body and req.cookies as `any`. These helpers read them as `unknown`
 * and check the shape, so nothing untyped leaks into the app.
 */

const cookieJar = z.record(z.string(), z.unknown());

/** A non-empty string cookie, or undefined. */
export function readCookie(req: Request, name: string): string | undefined {
  const parsed = cookieJar.safeParse(req.cookies);
  if (!parsed.success) return undefined;
  const value = parsed.data[name];
  return typeof value === "string" && value !== "" ? value : undefined;
}

const emailField = z.object({ email: z.string() });

/** The lower-cased email in a JSON body, or "" (used to key rate limits before validation). */
export function bodyEmail(req: Request): string {
  const parsed = emailField.safeParse(req.body);
  return parsed.success ? parsed.data.email.trim().toLowerCase() : "";
}
