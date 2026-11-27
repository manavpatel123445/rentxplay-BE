import type { ErrorRequestHandler, RequestHandler } from "express";
import { env } from "../config/env.ts";

/** Every error response has this shape, so clients can rely on it. */
export type ApiError = { error: { code: string; message: string } };

export const notFound: RequestHandler = (req, res) => {
  const body: ApiError = {
    error: { code: "not_found", message: `No route for ${req.method} ${req.path}.` },
  };
  res.status(404).json(body);
};

/** Last middleware: turns thrown errors into JSON and hides details in production. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // Malformed JSON bodies come from express.json() with status 400.
  const status = typeof err?.status === "number" && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error(err);

  const body: ApiError = {
    error: {
      code: status === 400 ? "bad_request" : status >= 500 ? "internal_error" : "error",
      message:
        status >= 500 && env.isProduction
          ? "Something went wrong on our side. Try again in a moment."
          : (err?.message ?? "Unexpected error."),
    },
  };
  res.status(status).json(body);
};
