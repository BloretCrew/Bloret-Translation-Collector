import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { applyConfigToProcessEnv } from "../config";
import { Logger } from "../logger";

async function main() {
  const config = applyConfigToProcessEnv();
  const client = postgres(config.databaseUrl, { max: 1 });
  const db = drizzle(client);
  Logger.info("正在运行数据库迁移…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  Logger.success("数据库迁移完成");
  await client.end();
}

main().catch((err) => {
  Logger.error(err);
  process.exit(1);
});
