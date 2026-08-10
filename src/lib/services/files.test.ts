/**
 * Source file upsert: merge by keyPath, preserve translations & suggestions.
 */
import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { applyConfigToProcessEnv } from "../config";
import { db } from "../db";
import {
  organizationMembers,
  organizations,
  projects,
  sourceFiles,
  stringUnits,
  translationSuggestions,
  translations,
  users,
} from "../db/schema";
import { normalizeSourcePath, upsertSourceFile } from "./files";

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

describe("normalizeSourcePath", () => {
  it("strips leading slashes and collapses duplicates", () => {
    expect(normalizeSourcePath("/locales//common.json")).toBe("locales/common.json");
    expect(normalizeSourcePath("  a/b.json  ")).toBe("a/b.json");
    expect(normalizeSourcePath("\\\\a\\\\b.json")).toBe("a/b.json");
  });
});

describe("upsertSourceFile merge", () => {
  it("preserves translations when source updates; orphans and restores keys", async () => {
    const stamp = Date.now().toString(36);
    const [user] = await db
      .insert(users)
      .values({ username: `files-${stamp}` })
      .returning();
    cleanup.userIds.push(user!.id);

    const [org] = await db
      .insert(organizations)
      .values({ name: "F Org", slug: `f-org-${stamp}`, createdBy: user!.id })
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
        slug: `f-p-${stamp}`,
        name: "P",
        sourceLocale: "zh-CN",
        createdBy: user!.id,
      })
      .returning();

    const path = "locales/app.json";
    const v1 = JSON.stringify({ hello: "你好", bye: "再见" }, null, 2);

    const first = await upsertSourceFile({
      projectId: project!.id,
      path: `/${path}`,
      content: v1,
      userId: user!.id,
    });
    expect("error" in first).toBe(false);
    if ("error" in first) return;

    expect(first.path).toBe(path);
    expect(first.revision).toBe(1);
    expect(first.addedCount).toBe(2);
    expect(first.updatedCount).toBe(0);
    expect(first.orphanedCount).toBe(0);
    expect(first.unchanged).toBe(false);

    const units = await db
      .select()
      .from(stringUnits)
      .where(eq(stringUnits.fileId, first.fileId));
    const hello = units.find((u) => u.keyPath === "hello")!;
    const bye = units.find((u) => u.keyPath === "bye")!;
    expect(hello).toBeTruthy();
    expect(bye).toBeTruthy();

    await db.insert(translations).values({
      stringId: hello.id,
      locale: "en",
      text: "Hello",
      status: "translated",
      updatedBy: user!.id,
    });
    await db.insert(translationSuggestions).values({
      stringId: hello.id,
      locale: "en",
      text: "Hi there",
      authorId: user!.id,
    });
    await db.insert(translations).values({
      stringId: bye.id,
      locale: "en",
      text: "Goodbye",
      status: "translated",
      updatedBy: user!.id,
    });

    // Same content → unchanged, revision stays
    const same = await upsertSourceFile({
      projectId: project!.id,
      path,
      content: v1,
      userId: user!.id,
    });
    expect("error" in same).toBe(false);
    if ("error" in same) return;
    expect(same.unchanged).toBe(true);
    expect(same.revision).toBe(1);
    expect(same.reusedCount).toBe(2);

    // hello source changes, bye removed, welcome added
    const v2 = JSON.stringify({ hello: "您好", welcome: "欢迎" }, null, 2);
    const second = await upsertSourceFile({
      projectId: project!.id,
      path,
      content: v2,
      userId: user!.id,
    });
    expect("error" in second).toBe(false);
    if ("error" in second) return;

    expect(second.unchanged).toBe(false);
    expect(second.revision).toBe(2);
    expect(second.addedCount).toBe(1);
    expect(second.updatedCount).toBe(1);
    expect(second.sourceTextChangedCount).toBe(1);
    expect(second.reusedCount).toBe(0);
    expect(second.orphanedCount).toBe(1);
    expect(second.stringCount).toBe(2);

    const after = await db
      .select()
      .from(stringUnits)
      .where(eq(stringUnits.fileId, first.fileId));
    const hello2 = after.find((u) => u.keyPath === "hello")!;
    const bye2 = after.find((u) => u.keyPath === "bye")!;
    const welcome = after.find((u) => u.keyPath === "welcome")!;

    expect(hello2.id).toBe(hello.id);
    expect(hello2.sourceText).toBe("您好");
    expect(hello2.orphaned).toBe(false);
    expect(bye2.orphaned).toBe(true);
    expect(welcome.sourceText).toBe("欢迎");
    expect(welcome.orphaned).toBe(false);

    // Approved translation + suggestion on hello untouched
    const [tr] = await db
      .select()
      .from(translations)
      .where(and(eq(translations.stringId, hello.id), eq(translations.locale, "en")));
    expect(tr!.text).toBe("Hello");
    expect(tr!.status).toBe("translated");

    const [sug] = await db
      .select()
      .from(translationSuggestions)
      .where(
        and(
          eq(translationSuggestions.stringId, hello.id),
          eq(translationSuggestions.locale, "en"),
        ),
      );
    expect(sug!.text).toBe("Hi there");

    // Orphaned bye still has its translation row
    const [byeTr] = await db
      .select()
      .from(translations)
      .where(and(eq(translations.stringId, bye.id), eq(translations.locale, "en")));
    expect(byeTr!.text).toBe("Goodbye");

    // Restore bye → un-orphan, translation still linked
    const v3 = JSON.stringify(
      { hello: "您好", welcome: "欢迎", bye: "再见" },
      null,
      2,
    );
    const third = await upsertSourceFile({
      projectId: project!.id,
      path,
      content: v3,
      userId: user!.id,
    });
    expect("error" in third).toBe(false);
    if ("error" in third) return;
    expect(third.revision).toBe(3);
    expect(third.addedCount).toBe(0);
    expect(third.updatedCount).toBe(0);
    expect(third.reusedCount).toBe(3);
    expect(third.orphanedCount).toBe(0);

    const [bye3] = await db
      .select()
      .from(stringUnits)
      .where(eq(stringUnits.id, bye.id));
    expect(bye3!.orphaned).toBe(false);
    expect(bye3!.id).toBe(bye.id);

    const [byeTr2] = await db
      .select()
      .from(translations)
      .where(and(eq(translations.stringId, bye.id), eq(translations.locale, "en")));
    expect(byeTr2!.text).toBe("Goodbye");

    // File row path was stored without leading slash
    const [fileRow] = await db
      .select()
      .from(sourceFiles)
      .where(eq(sourceFiles.id, first.fileId));
    expect(fileRow!.path).toBe(path);
    expect(fileRow!.sourceRevision).toBe(3);
  });
});
