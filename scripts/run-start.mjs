#!/usr/bin/env node
/**
 * Production starter: load config.json → inject env → run bundled server
 * (falls back to building dist/ if missing)
 */
import { spawnSync } from "child_process";
import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { configToEnv, loadConfigFile, root } from "./lib-config.mjs";
import { Logger } from "./lib-logger.mjs";
import { spawnManaged } from "./lib-spawn-managed.mjs";

const { path: configPath, config } = loadConfigFile();

if (!config) {
  Logger.error(`找不到配置文件: ${configPath}`);
  Logger.error("请复制 config.example.json 为 config.json 并修改。");
  process.exit(1);
}

const port = Number(config.port) || 3000;
const env = configToEnv(config, { NODE_ENV: "production" });

const distServer = join(root, "dist", "server.mjs");
const srcDir = join(root, "src");
const buildScript = join(root, "scripts", "build.mjs");
const buildScriptSelf = join(root, "scripts", "build.mjs");

/** Newest mtime under a directory (recursive). */
function newestMtime(dir) {
  let newest = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const p = join(cur, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === ".git") continue;
        stack.push(p);
      } else if (ent.isFile()) {
        try {
          const m = statSync(p).mtimeMs;
          if (m > newest) newest = m;
        } catch {
          /* skip */
        }
      }
    }
  }
  return newest;
}

function needsBuild() {
  if (!existsSync(distServer)) return true;
  try {
    const distM = statSync(distServer).mtimeMs;
    // Any change under src/ or the bundler script should trigger rebuild
    // (previously only server.ts was checked — left dist stale after other edits)
    if (newestMtime(srcDir) > distM) return true;
    if (existsSync(buildScriptSelf) && statSync(buildScriptSelf).mtimeMs > distM) return true;
    return false;
  } catch {
    return true;
  }
}

if (needsBuild()) {
  Logger.info("未找到最新 dist，正在构建…");
  const r = spawnSync(process.execPath, [buildScript], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  if (r.status !== 0) {
    Logger.error("构建失败。也可手动执行: npm run build");
    process.exit(r.status ?? 1);
  }
  Logger.success("构建完成");
}

const db = config.database || {};
Logger.info(`使用配置: ${configPath}`);
Logger.info(
  `数据库: ${db.user || "?"}@${db.host || "?"}:${db.port || "?"} / ${db.name || "?"}`,
);
Logger.info(`启动 Express 于端口 ${port} …`);

spawnManaged(process.execPath, [distServer], {
  cwd: root,
  env: { ...env, PORT: String(port) },
  stdio: "inherit",
});
