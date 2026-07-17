import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { applyConfigToProcessEnv } from "../config";

async function main() {
  const config = applyConfigToProcessEnv();
  const client = postgres(config.databaseUrl, { max: 1 });
  const db = drizzle(client);
  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations complete.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
