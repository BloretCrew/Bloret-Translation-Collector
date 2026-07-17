import { applyConfigToProcessEnv, loadConfig } from "@/lib/config";
import { Logger } from "@/lib/logger";
import { createApp } from "@/app";

applyConfigToProcessEnv();
const config = loadConfig();
const port = Number(process.env.PORT) || config.port || 3000;

const app = createApp();

const server = app.listen(port, () => {
  Logger.info(`Bloret Translation Collector 运行于 http://0.0.0.0:${port}`);
  Logger.success("服务已启动");
});

function shutdown(signal: string) {
  Logger.info(`收到 ${signal}，正在关闭…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
