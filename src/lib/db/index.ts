import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { getEnv } from "@/lib/env";

function createClient() {
  const connectionString = getEnv().DATABASE_URL;
  return postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

// Prevent multiple connections in Next.js hot reload
const globalForDb = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>;
};

const client = globalForDb.pgClient ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgClient = client;
}

export const db = drizzle(client, { schema });
export type Db = typeof db;
