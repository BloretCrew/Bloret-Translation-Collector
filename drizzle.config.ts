import { defineConfig } from "drizzle-kit";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

function databaseUrl(): string {
  const p = join(process.cwd(), "config.json");
  if (existsSync(p)) {
    try {
      const c = JSON.parse(readFileSync(p, "utf8")) as { databaseUrl?: string };
      if (c.databaseUrl) return c.databaseUrl;
    } catch {
      /* fall through */
    }
  }
  return (
    process.env.DATABASE_URL ??
    "postgresql://bloret:bloret@127.0.0.1:5432/translation_collector"
  );
}

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl(),
  },
});
