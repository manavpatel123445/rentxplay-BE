import { Router } from "express";
import { databaseIsReachable } from "../lib/db.ts";

export const healthRouter = Router();

/** Liveness: the process is up. Never touches the database, so it stays cheap. */
healthRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", uptimeSeconds: Math.round(process.uptime()) });
});

/** Readiness: dependencies are reachable. Load balancers send traffic only when this is 200. */
healthRouter.get("/health/ready", async (_req, res) => {
  const database = await databaseIsReachable();
  res.status(database ? 200 : 503).json({
    status: database ? "ready" : "not_ready",
    checks: { database: database ? "ok" : "unreachable" },
  });
});
