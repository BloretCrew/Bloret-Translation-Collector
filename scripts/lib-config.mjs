/**
 * Shared config helpers for Node starters (no TypeScript).
 */
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function buildDatabaseUrl(db = {}) {
  const host = db.host || "127.0.0.1";
  const port = Number(db.port) || 5432;
  const user = encodeURIComponent(db.user || "bloret");
  const password = encodeURIComponent(db.password ?? "bloret");
  const name = encodeURIComponent(db.name || "translation_collector");
  const qs = db.ssl === true ? "?sslmode=require" : "";
  return `postgresql://${user}:${password}@${host}:${port}/${name}${qs}`;
}

export function loadConfigFile() {
  const configPath = join(root, "config.json");
  if (!existsSync(configPath)) {
    return { path: configPath, config: null };
  }
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  return { path: configPath, config };
}

export function resolveDatabaseUrl(config) {
  if (!config) {
    return buildDatabaseUrl({});
  }
  if (config.database && typeof config.database === "object") {
    return buildDatabaseUrl(config.database);
  }
  if (config.databaseUrl) {
    return config.databaseUrl;
  }
  return buildDatabaseUrl({});
}

export function configToEnv(config, overrides = {}) {
  const port = Number(config?.port) || 3000;
  return {
    ...process.env,
    ...overrides,
    DATABASE_URL: resolveDatabaseUrl(config),
    SESSION_SECRET: config?.sessionSecret ?? "dev-only-session-secret-change-me-32chars",
    COOKIE_SECURE: config?.cookieSecure === true ? "true" : "false",
    PASSPORT_APP_ID: config?.passport?.appId ?? "",
    PASSPORT_APP_SECRET: config?.passport?.appSecret ?? "",
    PASSPORT_BASE_URL: config?.passport?.baseUrl ?? "https://passport.bloret.net",
    OAUTH_REDIRECT_URI:
      config?.passport?.redirectUri ?? `http://localhost:${port}/auth/callback`,
    APP_NAME: config?.appName ?? "Bloret Translation",
    PORT: String(port),
  };
}

export { root };
