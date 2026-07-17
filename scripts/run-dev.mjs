#!/usr/bin/env node
/**
 * Dev starter: load config.json → inject env → next dev
 */
import { spawn } from "child_process";
import { join } from "path";
import { configToEnv, loadConfigFile, root } from "./lib-config.mjs";

const { path: configPath, config } = loadConfigFile();
if (!config) {
  console.warn(`[WARN] ${configPath} 不存在，使用默认配置`);
}

const port = Number(config?.port) || 3000;
const env = configToEnv(config);

const nextBin = join(root, "node_modules", ".bin", "next");
const child = spawn(nextBin, ["dev", "--turbopack", "-p", String(port)], {
  cwd: root,
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
