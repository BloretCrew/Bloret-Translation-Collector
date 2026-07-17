#!/usr/bin/env node
/**
 * Dev starter: load config.json → inject env → next dev
 * 
 * Signal handling note:
 * With stdio:"inherit", Ctrl+C (SIGINT) is sent to both this process and
 * the child (Next.js). We must intercept it here first, so we can wait
 * for the child to fully exit before we die — otherwise the child gets
 * orphaned and keeps running in the background.
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

/* —— Signal forwarding to prevent orphaned child —— */
function forwardSignal(signal) {
  if (!child || child.killed) return;
  child.kill(signal);
  // Force-kill if child ignores the signal
  const timer = setTimeout(() => {
    if (!child.killed) child.kill("SIGKILL");
  }, 10_000);
  timer.unref();
}
process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("exit", (code, signal) => {
  // Re-raise signal to ourselves so the shell sees the right exit status
  if (signal && process.listenerCount(signal) === 0) {
    process.kill(process.pid, signal);
  }
  process.exit(code ?? 1);
});
