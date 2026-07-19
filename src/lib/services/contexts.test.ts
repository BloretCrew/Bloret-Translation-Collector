/**
 * String context screenshots (metadata only — no real image bytes).
 */
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { applyConfigToProcessEnv } from "../config";
import { db } from "../db";
import {
  organizations,
  projects,
  sourceFiles,
  stringUnits,
  users,
} from "../db/schema";
import { addContext, deleteContext, listContexts } from "./contexts";

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

describe("string contexts", () => {
  it("adds and lists screenshot metadata for a string", async () => {
    const stamp = Date.now().toString(36);
    const [user] = await db
      .insert(users)
      .values({ username: `ctx-user-${stamp}` })
      .returning();
    cleanup.userIds.push(user!.id);

    const [org] = await db
      .insert(organizations)
      .values({ name: "Ctx Org", slug: `ctx-org-${stamp}`, createdBy: user!.id })
      .returning();
    cleanup.orgIds.push(org!.id);

    const [project] = await db
      .insert(projects)
      .values({
        orgId: org!.id,
        slug: `cp-${stamp}`,
        name: "Ctx P",
        sourceLocale: "en",
        createdBy: user!.id,
      })
      .returning();

    const [file] = await db
      .insert(sourceFiles)
      .values({
        projectId: project!.id,
        path: "a.json",
        rawSource: { k: "v" },
        updatedBy: user!.id,
      })
      .returning();

    const [unit] = await db
      .insert(stringUnits)
      .values({
        fileId: file!.id,
        keyPath: "k",
        sourceText: "v",
        sortOrder: 0,
      })
      .returning();

    const row = await addContext({
      stringId: unit!.id,
      imageUrl: "/uploads/contexts/test.png",
      caption: "login button",
      userId: user!.id,
    });
    expect(row.imageUrl).toContain("/uploads/contexts/");

    const list = await listContexts(unit!.id);
    expect(list.length).toBe(1);
    expect(list[0]!.caption).toBe("login button");
    expect(list[0]!.username).toBe(user!.username);

    await deleteContext(row.id);
    expect(await listContexts(unit!.id)).toHaveLength(0);
  });
});
