import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.ts";
import { errorHandler, notFound } from "./middlewares/errors.ts";
import { healthRouter } from "./routes/health.ts";

/** Builds the Express app without listening, so tests can use it directly. */
export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  app.use(healthRouter);
  // Feature modules (auth, listings, bookings, payments) mount under /api/v1 later.
  app.get("/api/v1", (_req, res) => {
    res.json({ name: "rentxplay-api", version: "v1" });
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
