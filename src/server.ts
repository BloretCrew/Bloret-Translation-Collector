import { applyConfigToProcessEnv, loadConfig } from "@/lib/config";
import { createApp } from "@/app";

applyConfigToProcessEnv();
const config = loadConfig();
const port = Number(process.env.PORT) || config.port || 3000;

const app = createApp();

const server = app.listen(port, () => {
  console.log(`[INFO] Bloret Translation Collector listening on http://0.0.0.0:${port}`);
});

function shutdown(signal: string) {
  console.log(`[INFO] Received ${signal}, shutting down…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
