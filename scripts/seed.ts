/**
 * Seed demo org/project/file for local development.
 * Usage: npx tsx scripts/seed.ts
 */
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/lib/db/schema";
import { flattenJson } from "../src/lib/json-i18n";

const url =
  process.env.DATABASE_URL ?? "postgresql://bloret:bloret@127.0.0.1:5432/translation_collector";

async function main() {
  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema });

  let [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, "dev-user"))
    .limit(1);

  if (!user) {
    [user] = await db
      .insert(schema.users)
      .values({ username: "dev-user", lastLoginAt: new Date() })
      .returning();
  }

  let [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, "demo"))
    .limit(1);

  if (!org) {
    [org] = await db
      .insert(schema.organizations)
      .values({
        slug: "demo",
        name: "Demo Organization",
        description: "种子数据组织",
        createdBy: user!.id,
      })
      .returning();

    await db.insert(schema.organizationMembers).values({
      orgId: org!.id,
      userId: user!.id,
      role: "owner",
    });
  }

  let [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.slug, "sample-app"))
    .limit(1);

  if (!project) {
    [project] = await db
      .insert(schema.projects)
      .values({
        orgId: org!.id,
        slug: "sample-app",
        name: "Sample App",
        description: "示例项目",
        sourceLocale: "zh-CN",
        visibility: "org",
        createdBy: user!.id,
      })
      .returning();

    await db.insert(schema.projectLanguages).values([
      { projectId: project!.id, locale: "en", enabled: true },
      { projectId: project!.id, locale: "ja", enabled: true },
    ]);
  }

  const sample = {
    app: {
      title: "示例应用",
      welcome: "欢迎使用 Bloret Translation",
    },
    nav: {
      home: "首页",
      settings: "设置",
      about: "关于",
    },
    actions: {
      save: "保存",
      cancel: "取消",
      export: "导出",
    },
  };

  const [existingFile] = await db
    .select()
    .from(schema.sourceFiles)
    .where(eq(schema.sourceFiles.path, "locales/common.json"))
    .limit(1);

  if (!existingFile) {
    const [file] = await db
      .insert(schema.sourceFiles)
      .values({
        projectId: project!.id,
        path: "locales/common.json",
        rawSource: sample,
        sourceRevision: 1,
        updatedBy: user!.id,
      })
      .returning();

    const { entries } = flattenJson(sample);
    if (entries.length) {
      await db.insert(schema.stringUnits).values(
        entries.map((e) => ({
          fileId: file!.id,
          keyPath: e.keyPath,
          sourceText: e.sourceText,
          sortOrder: e.sortOrder,
        })),
      );
    }
    console.log(`Created file with ${entries.length} strings`);
  } else {
    console.log("Sample file already exists, skipped");
  }

  console.log("Seed complete.");
  console.log("  Login:  /auth/login?user=dev-user");
  console.log("  Org:    /app/o/demo");
  console.log("  Project:/app/o/demo/p/sample-app");

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
