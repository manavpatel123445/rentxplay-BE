import type { ErrorRequestHandler, RequestHandler } from "express";
import { env } from "../config/env.ts";
import { HttpError } from "../lib/http-error.ts";

/** Every error response has this shape, so clients can rely on it. */
export type ApiError = { error: { code: string; message: string; fields?: Record<string, string> } };

export const notFound: RequestHandler = (req, res) => {
  const body: ApiError = {
    error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}.` },
  };
  res.status(404).json(body);
};

/** HTTP status carried by errors from Express itself, e.g. 400 from express.json() on bad JSON. */
function statusOf(err: unknown): number {
  if (typeof err === "object" && err !== null && "status" in err && typeof err.status === "number") {
    if (err.status >= 400 && err.status < 600) return err.status;
  }
  return 500;
}

/**
 * Never log passwords or tokens. Prisma error messages can quote the query's input (a password
 * hash, a refresh-token hash), so for those only the error type and code are logged.
 */
function safeForLogs(err: unknown): unknown {
  if (err instanceof Error && err.name.startsWith("PrismaClient")) {
    const code = "code" in err && typeof err.code === "string" ? err.code : undefined;
    return { name: err.name, code };
  }
  return err;
}

/** Last middleware: turns thrown errors into JSON and hides details in production. */
export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  if (err instanceof HttpError) {
    const body: ApiError = { error: { code: err.code, message: err.message, ...(err.fields && { fields: err.fields }) } };
    res.status(err.status).json(body);
    return;
  }

  const status = statusOf(err);
  if (status >= 500) console.error(safeForLogs(err));

  const body: ApiError = {
    error: {
      code: status === 400 ? "BAD_REQUEST" : status >= 500 ? "INTERNAL_ERROR" : "REQUEST_FAILED",
      message:
        status >= 500 && env.isProduction
          ? "Something went wrong on our side. Try again in a moment."
          : err instanceof Error
            ? err.message
            : "Unexpected error.",
    },
  };
  res.status(status).json(body);
};
