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
  addComment,
  addSuggestionComment,
  approveAllSuggestionsByAuthor,
  approveSuggestion,
  listComments,
  listStringsWithWorkflow,
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

    // Project rules applied unless skipRules
    const ruled = await upsertMySuggestion({
      stringId: unit!.id,
      locale: "en",
      userId: userA!.id,
      text: "你好world",
      translationRules: { spaceCjkLatin: true },
    });
    expect(ruled.text).toBe("你好 world");
    const skipped = await upsertMySuggestion({
      stringId: unit!.id,
      locale: "en",
      userId: userA!.id,
      text: "你好world",
      skipRules: true,
      translationRules: { spaceCjkLatin: true },
    });
    expect(skipped.text).toBe("你好world");
    // restore text used later in the flow
    await upsertMySuggestion({
      stringId: unit!.id,
      locale: "en",
      userId: userA!.id,
      text: "Hello from A",
    });

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

    const root = await addComment({
      stringId: unit!.id,
      locale: "en",
      userId: userB!.id,
      body: "请注意大小写",
    });
    expect(root.ok).toBe(true);
    if (!root.ok) throw new Error("addComment failed");

    const reply = await addComment({
      stringId: unit!.id,
      locale: "en",
      userId: userA!.id,
      body: "已按你的建议修改",
      parentId: root.row.id,
    });
    expect(reply.ok).toBe(true);
    if (!reply.ok) throw new Error("reply failed");
    expect(reply.row.parentId).toBe(root.row.id);

    const comments = await listComments(unit!.id, "en");
    expect(comments.length).toBe(2);
    expect(comments[0]!.body).toBe("请注意大小写");
    expect(comments[0]!.parentId).toBeNull();
    expect(comments[1]!.body).toBe("已按你的建议修改");
    expect(comments[1]!.parentId).toBe(root.row.id);

    // Comments under a translation suggestion (not string discussion)
    const listedForComments = await listSuggestionsForString(unit!.id, "en", userA!.id);
    const target = listedForComments.suggestions.find((s) => s.authorId === userB!.id);
    expect(target).toBeTruthy();
    const scRoot = await addSuggestionComment({
      suggestionId: target!.id,
      userId: userA!.id,
      body: "这句语气可以更口语一点",
    });
    expect(scRoot.ok).toBe(true);
    if (!scRoot.ok) throw new Error("suggestion comment failed");
    const scReply = await addSuggestionComment({
      suggestionId: target!.id,
      userId: userB!.id,
      body: "好的，我改一下",
      parentId: scRoot.row.id,
    });
    expect(scReply.ok).toBe(true);
    if (!scReply.ok) throw new Error("suggestion reply failed");

    const withComments = await listSuggestionsForString(unit!.id, "en", userA!.id);
    const again = withComments.suggestions.find((s) => s.id === target!.id);
    expect(again?.comments.length).toBe(2);
    expect(again?.comments[0]!.body).toBe("这句语气可以更口语一点");
    expect(again?.comments[1]!.parentId).toBe(scRoot.row.id);
  });

  it("filters todo as untranslated + suggested (not approved)", async () => {
    const stamp = Date.now().toString(36);
    const [user] = await db
      .insert(users)
      .values({ username: `todo-u-${stamp}` })
      .returning();
    cleanup.userIds.push(user!.id);

    const [org] = await db
      .insert(organizations)
      .values({ name: "Todo Org", slug: `todo-org-${stamp}`, createdBy: user!.id })
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
        slug: `todo-p-${stamp}`,
        name: "Todo P",
        sourceLocale: "zh-CN",
        createdBy: user!.id,
      })
      .returning();

    const [file] = await db
      .insert(sourceFiles)
      .values({
        projectId: project!.id,
        path: "todo.json",
        rawSource: { a: "甲", b: "乙", c: "丙" },
        updatedBy: user!.id,
      })
      .returning();

    const [ua] = await db
      .insert(stringUnits)
      .values({ fileId: file!.id, keyPath: "a", sourceText: "甲", sortOrder: 0 })
      .returning();
    const [ub] = await db
      .insert(stringUnits)
      .values({ fileId: file!.id, keyPath: "b", sourceText: "乙", sortOrder: 1 })
      .returning();
    const [uc] = await db
      .insert(stringUnits)
      .values({ fileId: file!.id, keyPath: "c", sourceText: "丙", sortOrder: 2 })
      .returning();

    // a: untranslated (no suggestions)
    // b: suggested
    await upsertMySuggestion({
      stringId: ub!.id,
      locale: "en",
      userId: user!.id,
      text: "Bee",
    });
    // c: approved
    const sc = await upsertMySuggestion({
      stringId: uc!.id,
      locale: "en",
      userId: user!.id,
      text: "Sea",
    });
    await approveSuggestion(sc.id, user!.id);

    const todo = await listStringsWithWorkflow({
      fileId: file!.id,
      locale: "en",
      status: "todo",
      page: 1,
      pageSize: 50,
    });
    const todoIds = new Set(todo.strings.map((s) => s.id as string));
    expect(todoIds.has(ua!.id)).toBe(true);
    expect(todoIds.has(ub!.id)).toBe(true);
    expect(todoIds.has(uc!.id)).toBe(false);
    expect(todo.total).toBe(2);

    const pending = await listStringsWithWorkflow({
      fileId: file!.id,
      locale: "en",
      status: "pending",
      page: 1,
      pageSize: 50,
    });
    expect(pending.total).toBe(1);
    expect(pending.strings[0]!.id).toBe(ub!.id);
  });

  it("bulk-approves all suggestions by one author for a project locale", async () => {
    const stamp = Date.now().toString(36);
    const [owner] = await db
      .insert(users)
      .values({ username: `bulk-owner-${stamp}` })
      .returning();
    const [translator] = await db
      .insert(users)
      .values({ username: `bulk-tr-${stamp}` })
      .returning();
    const [other] = await db
      .insert(users)
      .values({ username: `bulk-other-${stamp}` })
      .returning();
    cleanup.userIds.push(owner!.id, translator!.id, other!.id);

    const [org] = await db
      .insert(organizations)
      .values({ name: "Bulk Org", slug: `bulk-org-${stamp}`, createdBy: owner!.id })
      .returning();
    cleanup.orgIds.push(org!.id);

    await db.insert(organizationMembers).values([
      { orgId: org!.id, userId: owner!.id, role: "owner" },
      { orgId: org!.id, userId: translator!.id, role: "translator" },
      { orgId: org!.id, userId: other!.id, role: "translator" },
    ]);

    const [project] = await db
      .insert(projects)
      .values({
        orgId: org!.id,
        slug: `bulk-p-${stamp}`,
        name: "Bulk P",
        sourceLocale: "zh-CN",
        createdBy: owner!.id,
      })
      .returning();

    const [file] = await db
      .insert(sourceFiles)
      .values({
        projectId: project!.id,
        path: "bulk.json",
        rawSource: { a: "甲", b: "乙", c: "丙" },
        updatedBy: owner!.id,
      })
      .returning();

    const [ua] = await db
      .insert(stringUnits)
      .values({ fileId: file!.id, keyPath: "a", sourceText: "甲", sortOrder: 0 })
      .returning();
    const [ub] = await db
      .insert(stringUnits)
      .values({ fileId: file!.id, keyPath: "b", sourceText: "乙", sortOrder: 1 })
      .returning();
    const [uc] = await db
      .insert(stringUnits)
      .values({ fileId: file!.id, keyPath: "c", sourceText: "丙", sortOrder: 2 })
      .returning();

    // translator: a + b (non-empty); empty on c should be ignored
    await upsertMySuggestion({
      stringId: ua!.id,
      locale: "en",
      userId: translator!.id,
      text: "Alpha by T",
    });
    await upsertMySuggestion({
      stringId: ub!.id,
      locale: "en",
      userId: translator!.id,
      text: "Beta by T",
    });
    await upsertMySuggestion({
      stringId: uc!.id,
      locale: "en",
      userId: translator!.id,
      text: "   ",
    });
    // other author on a — must not be bulk-approved for translator
    await upsertMySuggestion({
      stringId: ua!.id,
      locale: "en",
      userId: other!.id,
      text: "Alpha by Other",
    });
    // pre-approve b so second bulk run reports alreadyApproved
    const listedB = await listSuggestionsForString(ub!.id, "en", owner!.id);
    const tb = listedB.suggestions.find((s) => s.authorId === translator!.id)!;
    await approveSuggestion(tb.id, owner!.id);

    const first = await approveAllSuggestionsByAuthor({
      projectId: project!.id,
      locale: "en",
      authorId: translator!.id,
      approverId: owner!.id,
    });
    // a newly approved; b already that author's approved; empty c skipped
    expect(first.approved).toBe(1);
    expect(first.alreadyApproved).toBe(1);
    expect(first.total).toBe(2);

    const [finalA] = await db
      .select()
      .from(translations)
      .where(and(eq(translations.stringId, ua!.id), eq(translations.locale, "en")))
      .limit(1);
    expect(finalA?.text).toBe("Alpha by T");
    expect(finalA?.status).toBe("translated");

    const [finalB] = await db
      .select()
      .from(translations)
      .where(and(eq(translations.stringId, ub!.id), eq(translations.locale, "en")))
      .limit(1);
    expect(finalB?.text).toBe("Beta by T");

    const second = await approveAllSuggestionsByAuthor({
      projectId: project!.id,
      locale: "en",
      authorId: translator!.id,
      approverId: owner!.id,
    });
    expect(second.approved).toBe(0);
    expect(second.alreadyApproved).toBe(2);
    expect(second.total).toBe(2);

    // other author's bulk approve should only touch their rows
    const otherBulk = await approveAllSuggestionsByAuthor({
      projectId: project!.id,
      locale: "en",
      authorId: other!.id,
      approverId: owner!.id,
    });
    expect(otherBulk.approved).toBe(1);
    expect(otherBulk.total).toBe(1);
    const [finalA2] = await db
      .select()
      .from(translations)
      .where(and(eq(translations.stringId, ua!.id), eq(translations.locale, "en")))
      .limit(1);
    expect(finalA2?.text).toBe("Alpha by Other");
  });
});
