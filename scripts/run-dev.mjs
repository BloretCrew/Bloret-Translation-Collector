#!/usr/bin/env node
/**
 * Dev starter: load config.json → inject env → tsx watch server
 */
import { join } from "path";
import { configToEnv, loadConfigFile, root } from "./lib-config.mjs";
import { Logger } from "./lib-logger.mjs";
import { spawnManaged } from "./lib-spawn-managed.mjs";

const { path: configPath, config } = loadConfigFile();
if (!config) {
  Logger.warn(`${configPath} 不存在，使用默认配置`);
}

const port = Number(config?.port) || 3000;
const env = configToEnv(config, { NODE_ENV: "development" });

const tsxBin = join(root, "node_modules", ".bin", "tsx");
Logger.info(`开发模式启动 (port ${port}) …`);

// tsx watch spawns a grandchild; process-group kill in spawnManaged cleans it up
spawnManaged(tsxBin, ["watch", "src/server.ts"], {
  cwd: root,
  env: { ...env, PORT: String(port) },
  stdio: "inherit",
});
