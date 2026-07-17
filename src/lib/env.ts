import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).default("postgresql://bloret:bloret@localhost:5432/translation_collector"),
  PASSPORT_APP_ID: z.string().optional().default(""),
  PASSPORT_APP_SECRET: z.string().optional().default(""),
  PASSPORT_BASE_URL: z.string().url().default("https://passport.bloret.net"),
  OAUTH_REDIRECT_URI: z.string().default("http://localhost:3000/auth/callback"),
  SESSION_SECRET: z
    .string()
    .min(32)
    .default("dev-only-session-secret-change-me-32chars"),
  NEXT_PUBLIC_APP_NAME: z.string().default("Bloret Translation"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration");
  }
  cached = parsed.data;
  return cached;
}

export function isPassportConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.PASSPORT_APP_ID && env.PASSPORT_APP_SECRET);
}
