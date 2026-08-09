/**
 * Machine-translation file service: parse, upsert, lookup, and export fallback.
 */
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { applyConfigToProcessEnv } from "../config";
import { db } from "../db";
import {
  organizationMembers,
  organizations,
  projects,
  sourceFiles,
  stringUnits,
  users,
} from "../db/schema";
import {
  getMachineTranslations,
  lookupStringMt,
  parseMtFile,
  upsertMachineTranslations,
} from "./mt-file";
import { exportFileLocale } from "./files";

applyConfigToProcessEnv();

const cleanup: { userIds: string[]; orgIds: string[] } = { userIds: [], orgIds: [] };

afterAll(async () => {
  for (const id of cleanup.orgIds) {
    await db.delete(organizations).where(eq(organizations.id, id));
  }
  for (const id of cleanup.userIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describe("parseMtFile", () => {
  it("flattens nested JSON into keyPath → text entries, skipping empties", () => {
    const res = parseMtFile(
      JSON.stringify({ greeting: "Привет", nested: { deep: "Глубоко" }, empty: "" }),
    );
    expect(res.error).toBeUndefined();
    const byKey = new Map(res.entries.map((e) => [e.keyPath, e.text]));
    expect(byKey.get("greeting")).toBe("Привет");
    expect(byKey.get("nested.deep")).toBe("Глубоко");
    expect(byKey.has("empty")).toBe(false);
  });
});

describe("machine translations integration", () => {
  it("upserts, looks up, and applies MT as export fallback", async () => {
    const stamp = Date.now().toString(36);
    const [user] = await db
      .insert(users)
      .values({ username: `mt-${stamp}` })
      .returning();
    cleanup.userIds.push(user!.id);

    const [org] = await db
      .insert(organizations)
      .values({ name: "MT Org", slug: `mt-org-${stamp}`, createdBy: user!.id })
      .returning();
    cleanup.orgIds.push(org!.id);
    await db.insert(organizationMembers).values({
      orgId: org!.id,
      userId: user!.id,
      role: "owner",
    });

    const [project] = await db
      .insert(projects)
      .values({
        orgId: org!.id,
        slug: `mt-p-${stamp}`,
        name: "P",
        sourceLocale: "zh-CN",
        createdBy: user!.id,
      })
      .returning();

    const [file] = await db
      .insert(sourceFiles)
      .values({
        projectId: project!.id,
        path: "a.json",
        rawSource: { hello: "你好", world: "世界" },
        rawContent: JSON.stringify({ hello: "你好", world: "世界" }),
        updatedBy: user!.id,
      })
      .returning();

    await db.insert(stringUnits).values([
      { fileId: file!.id, keyPath: "hello", sourceText: "你好", sortOrder: 0 },
      { fileId: file!.id, keyPath: "world", sourceText: "世界", sortOrder: 1 },
    ]);

    // Upsert MT for the locale (project-global).
    await upsertMachineTranslations({
      projectId: project!.id,
      fileId: null,
      locale: "ru",
      entries: [
        { keyPath: "hello", text: "Привет" },
        { keyPath: "world", text: "Мир" },
      ],
      userId: user!.id,
    });

    const map = await getMachineTranslations(project!.id, null, "ru");
    expect(map.get("hello")).toBe("Привет");
    expect(await lookupStringMt(project!.id, file!.id, "ru", "hello")).toBe("Привет");
    expect(await lookupStringMt(project!.id, file!.id, "ru", "missing")).toBeNull();

    // Export WITHOUT fallback: mode=approved has no approved translation,
    // so missing keys are left empty.
    const noFallback = await exportFileLocale(file!.id, "ru", "approved");
    const parsedNo = JSON.parse(noFallback!.body);
    expect(parsedNo.hello).toBe("");

    // Export WITH fallback: MT fills the missing keys.
    const withFallback = await exportFileLocale(file!.id, "ru", "approved", {
      mtMap: map,
      fallbackMt: true,
    });
    const parsedMt = JSON.parse(withFallback!.body);
    expect(parsedMt.hello).toBe("Привет");
    expect(parsedMt.world).toBe("Мир");
  });
});
