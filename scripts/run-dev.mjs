#!/usr/bin/env node
/**
 * Dev starter: load config.json → inject env → tsx watch server
 */
import { spawn } from "child_process";
import { join } from "path";
import { configToEnv, loadConfigFile, root } from "./lib-config.mjs";
import { Logger } from "./lib-logger.mjs";

const { path: configPath, config } = loadConfigFile();
if (!config) {
  Logger.warn(`${configPath} 不存在，使用默认配置`);
}

const port = Number(config?.port) || 3000;
const env = configToEnv(config, { NODE_ENV: "development" });

const tsxBin = join(root, "node_modules", ".bin", "tsx");
Logger.info(`开发模式启动 (port ${port}) …`);

const child = spawn(tsxBin, ["watch", "src/server.ts"], {
  cwd: root,
  env: { ...env, PORT: String(port) },
  stdio: "inherit",
});

function forwardSignal(signal) {
  if (!child || child.killed) return;
  child.kill(signal);
  const timer = setTimeout(() => {
    if (!child.killed) child.kill("SIGKILL");
  }, 10_000);
  timer.unref();
}
process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal && process.listenerCount(signal) === 0) {
    process.kill(process.pid, signal);
  }
  process.exit(code ?? 1);
});
