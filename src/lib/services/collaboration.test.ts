/**
 * Collaboration: two users suggest, vote, approve → translations mirror.
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
import {
  approveSuggestion,
  listSuggestionsForString,
  toggleVote,
  upsertMySuggestion,
} from "./collaboration";

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

describe("collaboration workflow", () => {
  it("allows multi-user suggestions, voting, and approval", async () => {
    const stamp = Date.now().toString(36);
    const [userA] = await db
      .insert(users)
      .values({ username: `collab-a-${stamp}` })
      .returning();
    const [userB] = await db
      .insert(users)
      .values({ username: `collab-b-${stamp}` })
      .returning();
    cleanup.userIds.push(userA!.id, userB!.id);

    const [org] = await db
      .insert(organizations)
      .values({ name: "C Org", slug: `c-org-${stamp}`, createdBy: userA!.id })
      .returning();
    cleanup.orgIds.push(org!.id);

    await db.insert(organizationMembers).values([
      { orgId: org!.id, userId: userA!.id, role: "owner" },
      { orgId: org!.id, userId: userB!.id, role: "translator" },
    ]);

    const [project] = await db
      .insert(projects)
      .values({
        orgId: org!.id,
        slug: `p-${stamp}`,
        name: "P",
        sourceLocale: "zh-CN",
        createdBy: userA!.id,
      })
      .returning();

    const [file] = await db
      .insert(sourceFiles)
      .values({
        projectId: project!.id,
        path: "a.json",
        rawSource: { hello: "你好" },
        updatedBy: userA!.id,
      })
      .returning();

    const [unit] = await db
      .insert(stringUnits)
      .values({
        fileId: file!.id,
        keyPath: "hello",
        sourceText: "你好",
        sortOrder: 0,
      })
      .returning();

    const sa = await upsertMySuggestion({
      stringId: unit!.id,
      locale: "en",
      userId: userA!.id,
      text: "Hello from A",
    });
    const sb = await upsertMySuggestion({
      stringId: unit!.id,
      locale: "en",
      userId: userB!.id,
      text: "Hello from B",
    });

    expect(sa.id).not.toBe(sb.id);

    // A votes for B
    const vote = await toggleVote(sb.id, userA!.id);
    expect(vote.ok && vote.voted).toBe(true);

    // cannot vote own
    const own = await toggleVote(sa.id, userA!.id);
    expect(own.ok).toBe(false);

    const listed = await listSuggestionsForString(unit!.id, "en", userA!.id);
    expect(listed.suggestions.length).toBe(2);
    const bView = listed.suggestions.find((s) => s.id === sb.id)!;
    expect(bView.voteCount).toBeGreaterThanOrEqual(1);
    expect(bView.votedByMe).toBe(true);

    // Owner (proofreader+) approves B
    const appr = await approveSuggestion(sb.id, userA!.id);
    expect(appr.ok).toBe(true);

    const [final] = await db
      .select()
      .from(translations)
      .where(and(eq(translations.stringId, unit!.id), eq(translations.locale, "en")))
      .limit(1);
    expect(final?.text).toBe("Hello from B");
    expect(final?.status).toBe("translated");

    // unique per author: update A does not create second
    const sa2 = await upsertMySuggestion({
      stringId: unit!.id,
      locale: "en",
      userId: userA!.id,
      text: "Hello from A v2",
    });
    expect(sa2.id).toBe(sa.id);

    const count = await db
      .select()
      .from(translationSuggestions)
      .where(
        and(
          eq(translationSuggestions.stringId, unit!.id),
          eq(translationSuggestions.locale, "en"),
        ),
      );
    expect(count.length).toBe(2);
  });
});
