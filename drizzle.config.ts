import { defineConfig } from "drizzle-kit";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

type DbPart = {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  name?: string;
  ssl?: boolean;
};

function buildDatabaseUrl(db: DbPart): string {
  const user = encodeURIComponent(db.user || "bloret");
  const password = encodeURIComponent(db.password ?? "bloret");
  const host = db.host || "127.0.0.1";
  const port = db.port || 5432;
  const name = encodeURIComponent(db.name || "translation_collector");
  const qs = db.ssl ? "?sslmode=require" : "";
  return `postgresql://${user}:${password}@${host}:${port}/${name}${qs}`;
}

function databaseUrl(): string {
  const p = join(process.cwd(), "config.json");
  if (existsSync(p)) {
    try {
      const c = JSON.parse(readFileSync(p, "utf8")) as {
        database?: DbPart;
        databaseUrl?: string;
      };
      if (c.database) return buildDatabaseUrl(c.database);
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
