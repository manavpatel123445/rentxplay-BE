import type { z } from "zod";
import { HttpError } from "./http-error.ts";

/**
 * Parses untrusted input with a Zod schema. On failure throws 400 `validation_failed`
 * with one message per field (the first problem for each), ready for a form to show.
 */
export function parseBody<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input ?? {});
  if (result.success) return result.data;

  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "body";
    fields[key] ??= issue.message;
  }
  throw new HttpError(400, "VALIDATION_FAILED", "Some fields need fixing.", fields);
}
