import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.ts";
import { errorHandler, notFound } from "./middlewares/errors.ts";
import { authRouter } from "./modules/auth/auth.routes.ts";
import { meRouter } from "./modules/users/me.routes.ts";
import { healthRouter } from "./routes/health.ts";

/** Builds the Express app without listening, so tests can use it directly. */
export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  // Behind Render/Railway/a load balancer, so req.ip is the client, not the proxy.
  if (env.isProduction) app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.use(healthRouter);

  const api = express.Router();
  api.get("/", (_req, res) => {
    res.json({ name: "rentxplay-api", version: "v1" });
  });
  api.use("/auth", authRouter);
  api.use(meRouter);
  app.use("/api/v1", api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
