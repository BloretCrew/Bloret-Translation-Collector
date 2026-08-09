import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";
import { Logger } from "@/lib/logger";

const databaseSchema = z.object({
  host: z.string().min(1).default("127.0.0.1"),
  port: z.number().int().positive().default(5432),
  user: z.string().min(1).default("bloret"),
  password: z.string().default("bloret"),
  name: z.string().min(1).default("translation_collector"),
  ssl: z.boolean().default(false),
});

const configSchema = z.object({
  port: z.number().int().positive().default(3000),
  database: databaseSchema.default({
    host: "127.0.0.1",
    port: 5432,
    user: "bloret",
    password: "bloret",
    name: "translation_collector",
    ssl: false,
  }),
  /** @deprecated use database.* fields; still accepted for older config.json */
  databaseUrl: z.string().optional(),
  sessionSecret: z.string().min(32).default("dev-only-session-secret-change-me-32chars"),
  cookieSecure: z.boolean().default(false),
  appName: z.string().default("Bloret Translation"),
  passport: z
    .object({
      appId: z.string().default(""),
      appSecret: z.string().default(""),
      baseUrl: z.string().url().default("https://passport.bloret.net"),
      redirectUri: z.string().default("http://localhost:3000/auth/callback"),
    })
    .default({
      appId: "",
      appSecret: "",
      baseUrl: "https://passport.bloret.net",
      redirectUri: "http://localhost:3000/auth/callback",
    }),
  /** Optional machine translation (LibreTranslate-compatible HTTP API) */
  mt: z
    .object({
      enabled: z.boolean().default(false),
      /** e.g. https://libretranslate.com/translate */
      endpoint: z.string().default(""),
      apiKey: z.string().default(""),
      /** source language code sent to MT when not auto */
      defaultSource: z.string().default("auto"),
    })
    .default({
      enabled: false,
      endpoint: "",
      apiKey: "",
      defaultSource: "auto",
    }),
  /**
   * Bloret Image Host for all binary image uploads (context screenshots, …).
   * @see https://img.bloret.net/api/doc
   */
  imageHost: z
    .object({
      /** e.g. https://img.bloret.net */
      baseUrl: z.string().url().default("https://img.bloret.net"),
    })
    .default({
      baseUrl: "https://img.bloret.net",
    }),
});

export type DatabaseConfig = z.infer<typeof databaseSchema>;
export type AppConfig = z.infer<typeof configSchema> & {
  /** Resolved connection string */
  databaseUrl: string;
};

/** Flat shape used by existing auth / db helpers */
export type Env = {
  DATABASE_URL: string;
  PASSPORT_APP_ID: string;
  PASSPORT_APP_SECRET: string;
  PASSPORT_BASE_URL: string;
  OAUTH_REDIRECT_URI: string;
  SESSION_SECRET: string;
  COOKIE_SECURE: boolean;
  NEXT_PUBLIC_APP_NAME: string;
  PORT: number;
};

let cachedConfig: AppConfig | null = null;
let cachedEnv: Env | null = null;

export function buildDatabaseUrl(db: DatabaseConfig): string {
  const user = encodeURIComponent(db.user);
  const password = encodeURIComponent(db.password);
  const host = db.host;
  const port = db.port;
  const name = encodeURIComponent(db.name);
  const qs = db.ssl ? "?sslmode=require" : "";
  return `postgresql://${user}:${password}@${host}:${port}/${name}${qs}`;
}

function resolveConfigPath(): string | null {
  const candidates = [
    join(process.cwd(), "config.json"),
    join(process.cwd(), "..", "config.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function loadConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  const path = resolveConfigPath();
  let raw: unknown = {};
  if (path) {
    try {
      raw = JSON.parse(readFileSync(path, "utf8"));
    } catch (e) {
      Logger.error(`解析配置失败 ${path}:`, e);
      throw new Error(`Invalid config.json at ${path}`);
    }
  } else {
    Logger.warn("config.json 不存在，使用内置默认配置");
  }

  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    Logger.error('config.json 无效:', parsed.error.flatten().fieldErrors);
    throw new Error("Invalid config.json");
  }

  const data = parsed.data;
  const databaseUrl =
    data.databaseUrl && !(raw as { database?: unknown }).database
      ? data.databaseUrl
      : buildDatabaseUrl(data.database);

  cachedConfig = {
    ...data,
    databaseUrl,
  };
  return cachedConfig;
}

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;
  const c = loadConfig();
  cachedEnv = {
    DATABASE_URL: c.databaseUrl,
    PASSPORT_APP_ID: c.passport.appId,
    PASSPORT_APP_SECRET: c.passport.appSecret,
    PASSPORT_BASE_URL: c.passport.baseUrl,
    OAUTH_REDIRECT_URI: c.passport.redirectUri,
    SESSION_SECRET: c.sessionSecret,
    COOKIE_SECURE: c.cookieSecure,
    NEXT_PUBLIC_APP_NAME: c.appName,
    PORT: c.port,
  };
  return cachedEnv;
}

export function isPassportConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.PASSPORT_APP_ID && env.PASSPORT_APP_SECRET);
}

/**
 * Public origin of this deployment, derived from the OAuth redirectUri
 * (e.g. https://tr.bloret.net/auth/callback → https://tr.bloret.net).
 * Used for building absolute links in public API responses.
 */
export function publicBaseUrl(): string {
  try {
    const u = new URL(loadConfig().passport.redirectUri || "http://localhost:3000");
    return `${u.protocol}//${u.host}`;
  } catch {
    return "http://localhost:3000";
  }
}

/** Apply config into process.env for child tools / convenience */
export function applyConfigToProcessEnv(): AppConfig {
  const c = loadConfig();
  process.env.DATABASE_URL = c.databaseUrl;
  process.env.SESSION_SECRET = c.sessionSecret;
  process.env.COOKIE_SECURE = c.cookieSecure ? "true" : "false";
  process.env.PASSPORT_APP_ID = c.passport.appId;
  process.env.PASSPORT_APP_SECRET = c.passport.appSecret;
  process.env.PASSPORT_BASE_URL = c.passport.baseUrl;
  process.env.OAUTH_REDIRECT_URI = c.passport.redirectUri;
  process.env.APP_NAME = c.appName;
  // Don't clobber PORT if the starter already injected it
  if (!process.env.PORT) process.env.PORT = String(c.port);
  return c;
}
