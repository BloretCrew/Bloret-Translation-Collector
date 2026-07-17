import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";

const configSchema = z.object({
  port: z.number().int().positive().default(3000),
  databaseUrl: z
    .string()
    .min(1)
    .default("postgresql://bloret:bloret@127.0.0.1:5432/translation_collector"),
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
});

export type AppConfig = z.infer<typeof configSchema>;

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
      console.error(`Failed to parse ${path}:`, e);
      throw new Error(`Invalid config.json at ${path}`);
    }
  } else {
    console.warn("config.json not found, using built-in defaults");
  }

  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("Invalid config.json:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid config.json");
  }
  cachedConfig = parsed.data;
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

/** Apply config into process.env so Edge middleware / child tools can read them */
export function applyConfigToProcessEnv(): AppConfig {
  const c = loadConfig();
  process.env.DATABASE_URL = c.databaseUrl;
  process.env.SESSION_SECRET = c.sessionSecret;
  process.env.COOKIE_SECURE = c.cookieSecure ? "true" : "false";
  process.env.PASSPORT_APP_ID = c.passport.appId;
  process.env.PASSPORT_APP_SECRET = c.passport.appSecret;
  process.env.PASSPORT_BASE_URL = c.passport.baseUrl;
  process.env.OAUTH_REDIRECT_URI = c.passport.redirectUri;
  process.env.NEXT_PUBLIC_APP_NAME = c.appName;
  process.env.PORT = String(c.port);
  return c;
}
