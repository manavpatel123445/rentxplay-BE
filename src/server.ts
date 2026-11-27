import { createApp } from "./app.ts";
import { env } from "./config/env.ts";

const server = createApp().listen(env.port, () => {
  console.log(`rentxplay-api listening on http://localhost:${env.port} (${env.nodeEnv})`);
});

// Stop taking new requests, let open ones finish, then exit (Docker, Render, Ctrl+C).
function shutdown(signal: NodeJS.Signals) {
  console.log(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
