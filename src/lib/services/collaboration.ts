import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  sourceFiles,
  stringComments,
  stringLocaleStates,
  stringUnits,
  suggestionComments,
  suggestionVotes,
  translationSuggestions,
  translations,
  users,
  type EmojiStats,
  type ProjectTranslationRules,
  type ReactionMap,
} from "@/lib/db/schema";
import { applyTranslationRules } from "@/lib/services/translation-rules";

/** Default quick emojis (same set as Bloret BBS). */
export const DEFAULT_QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "😡"] as const;

/** Max length for a single emoji / reaction token (covers ZWJ sequences). */
const EMOJI_MAX_LEN = 32;

export function normalizeReactionEmoji(emoji: unknown): string | null {
  if (typeof emoji !== "string") return null;
  const e = emoji.trim();
  if (!e || e.length > EMOJI_MAX_LEN) return null;
  // Reject bare control / whitespace-only already trimmed; keep multi-codepoint emoji.
  if (/[\u0000-\u001f\u007f]/.test(e)) return null;
  return e;
}

function normalizeReactionMap(raw: unknown): ReactionMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ReactionMap = {};
  for (const [emoji, usersList] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(usersList)) continue;
    const names = usersList.filter((u): u is string => typeof u === "string" && u.length > 0);
    if (names.length) out[emoji] = names;
  }
  return out;
}

function toggleUsernameOnMap(
  map: ReactionMap,
  emoji: string,
  username: string,
): { next: ReactionMap; added: boolean } {
  const next: ReactionMap = { ...map };
  const list = [...(next[emoji] ?? [])];
  const idx = list.indexOf(username);
  let added = false;
  if (idx === -1) {
    list.push(username);
    next[emoji] = list;
    added = true;
  } else {
    list.splice(idx, 1);
    if (list.length) next[emoji] = list;
    else delete next[emoji];
  }
  return { next, added };
}

async function bumpEmojiStat(userId: string, emoji: string) {
  try {
    const [u] = await db
      .select({ emojiStats: users.emojiStats })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!u) return;
    const stats: EmojiStats = { ...(u.emojiStats ?? {}) };
    stats[emoji] = (stats[emoji] || 0) + 1;
    await db.update(users).set({ emojiStats: stats }).where(eq(users.id, userId));
  } catch {
    // non-fatal
  }
}

/** Ranked emoji shortcuts for the current user (BBS-style). */
export async function listEmojiShortcuts(userId: string | null): Promise<string[]> {
  const defaults = [...DEFAULT_QUICK_EMOJIS];
  if (!userId) return defaults;
  try {
    const [u] = await db
      .select({ emojiStats: users.emojiStats })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const stats = u?.emojiStats ?? {};
    const sorted = Object.entries(stats)
      .sort((a, b) => b[1] - a[1])
      .map(([e]) => e)
      .slice(0, 6);
    const finalSet = new Set(sorted);
    for (const e of defaults) {
      if (finalSet.size >= 6) break;
      finalSet.add(e);
    }
    return Array.from(finalSet);
  } catch {
    return defaults;
  }
}

export type SuggestionCommentView = {
  id: string;
  suggestionId: string;
  parentId: string | null;
  body: string;
  authorId: string;
  authorUsername: string;
  authorAvatarUrl: string | null;
  reactions: ReactionMap;
  createdAt: Date;
};

export type SuggestionView = {
  id: string;
  text: string;
  authorId: string;
  authorUsername: string;
  authorAvatarUrl: string | null;
  voteCount: number;
  votedByMe: boolean;
  isMine: boolean;
  isApproved: boolean;
  reactions: ReactionMap;
  createdAt: Date;
  updatedAt: Date;
  comments: SuggestionCommentView[];
};

export type StringCommentView = {
  id: string;
  body: string;
  parentId: string | null;
  authorId: string;
  authorUsername: string;
  authorAvatarUrl: string | null;
  reactions: ReactionMap;
  createdAt: Date;
};

export async function listSuggestionsForString(
  stringId: string,
  locale: string,
  viewerUserId: string | null,
) {
  const rows = await db
    .select({
      id: translationSuggestions.id,
      text: translationSuggestions.text,
      authorId: translationSuggestions.authorId,
      authorUsername: users.username,
      authorAvatarUrl: users.avatarUrl,
      reactions: translationSuggestions.reactions,
      createdAt: translationSuggestions.createdAt,
      updatedAt: translationSuggestions.updatedAt,
      voteCount: sql<number>`coalesce((
        select sum(${suggestionVotes.value})::int from ${suggestionVotes}
        where ${suggestionVotes.suggestionId} = ${translationSuggestions.id}
      ), 0)`,
    })
    .from(translationSuggestions)
    .innerJoin(users, eq(translationSuggestions.authorId, users.id))
    .where(
      and(eq(translationSuggestions.stringId, stringId), eq(translationSuggestions.locale, locale)),
    )
    .orderBy(desc(sql`coalesce((
        select sum(${suggestionVotes.value})::int from ${suggestionVotes}
        where ${suggestionVotes.suggestionId} = ${translationSuggestions.id}
      ), 0)`), desc(translationSuggestions.updatedAt));

  const [state] = await db
    .select()
    .from(stringLocaleStates)
    .where(and(eq(stringLocaleStates.stringId, stringId), eq(stringLocaleStates.locale, locale)))
    .limit(1);

  let myVotes = new Set<string>();
  if (viewerUserId && rows.length) {
    const votes = await db
      .select({ suggestionId: suggestionVotes.suggestionId })
      .from(suggestionVotes)
      .where(
        and(
          eq(suggestionVotes.userId, viewerUserId),
          inArray(
            suggestionVotes.suggestionId,
            rows.map((r) => r.id),
          ),
        ),
      );
    myVotes = new Set(votes.map((v) => v.suggestionId));
  }

  const approvedId = state?.approvedSuggestionId ?? null;

  const commentsBySuggestion = new Map<string, SuggestionCommentView[]>();
  if (rows.length) {
    const commentRows = await db
      .select({
        id: suggestionComments.id,
        suggestionId: suggestionComments.suggestionId,
        parentId: suggestionComments.parentId,
        body: suggestionComments.body,
        authorId: suggestionComments.authorId,
        authorUsername: users.username,
        authorAvatarUrl: users.avatarUrl,
        reactions: suggestionComments.reactions,
        createdAt: suggestionComments.createdAt,
      })
      .from(suggestionComments)
      .innerJoin(users, eq(suggestionComments.authorId, users.id))
      .where(
        inArray(
          suggestionComments.suggestionId,
          rows.map((r) => r.id),
        ),
      )
      .orderBy(asc(suggestionComments.createdAt));
    for (const c of commentRows) {
      const list = commentsBySuggestion.get(c.suggestionId) ?? [];
      list.push({
        ...c,
        reactions: normalizeReactionMap(c.reactions),
      });
      commentsBySuggestion.set(c.suggestionId, list);
    }
  }

  return {
    workflowStatus: state?.status ?? (rows.length ? "suggested" : "untranslated"),
    approvedSuggestionId: approvedId,
    suggestions: rows.map(
      (r): SuggestionView => ({
        id: r.id,
        text: r.text,
        authorId: r.authorId,
        authorUsername: r.authorUsername,
        authorAvatarUrl: r.authorAvatarUrl,
        voteCount: Number(r.voteCount ?? 0),
        votedByMe: myVotes.has(r.id),
        isMine: viewerUserId === r.authorId,
        isApproved: approvedId === r.id,
        reactions: normalizeReactionMap(r.reactions),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        comments: commentsBySuggestion.get(r.id) ?? [],
      }),
    ),
  };
}

export async function listSuggestionComments(suggestionId: string) {
  const rows = await db
    .select({
      id: suggestionComments.id,
      suggestionId: suggestionComments.suggestionId,
      parentId: suggestionComments.parentId,
      body: suggestionComments.body,
      authorId: suggestionComments.authorId,
      authorUsername: users.username,
      authorAvatarUrl: users.avatarUrl,
      reactions: suggestionComments.reactions,
      createdAt: suggestionComments.createdAt,
    })
    .from(suggestionComments)
    .innerJoin(users, eq(suggestionComments.authorId, users.id))
    .where(eq(suggestionComments.suggestionId, suggestionId))
    .orderBy(asc(suggestionComments.createdAt));
  return rows.map((c) => ({
    ...c,
    reactions: normalizeReactionMap(c.reactions),
  }));
}

export async function addSuggestionComment(params: {
  suggestionId: string;
  userId: string;
  body: string;
  parentId?: string | null;
}) {
  let parentId: string | null = params.parentId ?? null;
  if (parentId) {
    const [parent] = await db
      .select()
      .from(suggestionComments)
      .where(eq(suggestionComments.id, parentId))
      .limit(1);
    if (!parent) {
      return { ok: false as const, error: "parent_not_found" as const };
    }
    if (parent.suggestionId !== params.suggestionId) {
      return { ok: false as const, error: "parent_mismatch" as const };
    }
    if (parent.parentId) {
      parentId = parent.parentId;
    }
  }

  const [row] = await db
    .insert(suggestionComments)
    .values({
      suggestionId: params.suggestionId,
      authorId: params.userId,
      parentId,
      body: params.body.trim(),
    })
    .returning();
  return { ok: true as const, row: row! };
}

export async function deleteSuggestionComment(
  commentId: string,
  userId: string,
  canModerate: boolean,
) {
  const [row] = await db
    .select()
    .from(suggestionComments)
    .where(eq(suggestionComments.id, commentId))
    .limit(1);
  if (!row) return { ok: false as const, error: "not_found" as const };
  if (row.authorId !== userId && !canModerate) {
    return { ok: false as const, error: "forbidden" as const };
  }
  await db.delete(suggestionComments).where(eq(suggestionComments.id, commentId));
  return { ok: true as const };
}

/** Upsert my suggestion for string×locale */
export async function upsertMySuggestion(params: {
  stringId: string;
  locale: string;
  userId: string;
  text: string;
  /** When true, skip project translation formatting rules. */
  skipRules?: boolean;
  /** Project rules to apply (ignored when skipRules). */
  translationRules?: ProjectTranslationRules | null;
}) {
  const text = params.skipRules
    ? params.text
    : applyTranslationRules(params.text, params.translationRules);
  const [existing] = await db
    .select()
    .from(translationSuggestions)
    .where(
      and(
        eq(translationSuggestions.stringId, params.stringId),
        eq(translationSuggestions.locale, params.locale),
        eq(translationSuggestions.authorId, params.userId),
      ),
    )
    .limit(1);

  let row;
  if (existing) {
    [row] = await db
      .update(translationSuggestions)
      .set({ text, updatedAt: new Date() })
      .where(eq(translationSuggestions.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(translationSuggestions)
      .values({
        stringId: params.stringId,
        locale: params.locale,
        text,
        authorId: params.userId,
      })
      .returning();
  }

  await refreshWorkflowStatus(params.stringId, params.locale);
  return row!;
}

export async function deleteMySuggestion(params: {
  stringId: string;
  locale: string;
  userId: string;
}) {
  const [existing] = await db
    .select()
    .from(translationSuggestions)
    .where(
      and(
        eq(translationSuggestions.stringId, params.stringId),
        eq(translationSuggestions.locale, params.locale),
        eq(translationSuggestions.authorId, params.userId),
      ),
    )
    .limit(1);
  if (!existing) return { ok: false as const, error: "not_found" as const };

  const [state] = await db
    .select()
    .from(stringLocaleStates)
    .where(
      and(
        eq(stringLocaleStates.stringId, params.stringId),
        eq(stringLocaleStates.locale, params.locale),
      ),
    )
    .limit(1);

  if (state?.approvedSuggestionId === existing.id) {
    return { ok: false as const, error: "approved" as const };
  }

  await db.delete(translationSuggestions).where(eq(translationSuggestions.id, existing.id));
  await refreshWorkflowStatus(params.stringId, params.locale);
  return { ok: true as const };
}

/** Toggle vote: if already voted, remove; else add +1. Cannot vote own suggestion. */
export async function toggleVote(suggestionId: string, userId: string) {
  const [s] = await db
    .select()
    .from(translationSuggestions)
    .where(eq(translationSuggestions.id, suggestionId))
    .limit(1);
  if (!s) return { ok: false as const, error: "not_found" as const };
  if (s.authorId === userId) return { ok: false as const, error: "own" as const };

  const [existing] = await db
    .select()
    .from(suggestionVotes)
    .where(and(eq(suggestionVotes.suggestionId, suggestionId), eq(suggestionVotes.userId, userId)))
    .limit(1);

  if (existing) {
    await db.delete(suggestionVotes).where(eq(suggestionVotes.id, existing.id));
    return { ok: true as const, voted: false };
  }

  await db.insert(suggestionVotes).values({
    suggestionId,
    userId,
    value: 1,
  });
  return { ok: true as const, voted: true };
}

export async function approveSuggestion(suggestionId: string, approverId: string) {
  const [s] = await db
    .select()
    .from(translationSuggestions)
    .where(eq(translationSuggestions.id, suggestionId))
    .limit(1);
  if (!s) return { ok: false as const, error: "not_found" as const };
  if (!s.text.trim()) return { ok: false as const, error: "empty" as const };

  const now = new Date();

  await db.transaction(async (tx) => {
    // Upsert approved mirror in translations
    const [existing] = await tx
      .select()
      .from(translations)
      .where(and(eq(translations.stringId, s.stringId), eq(translations.locale, s.locale)))
      .limit(1);

    if (existing) {
      await tx
        .update(translations)
        .set({
          text: s.text,
          status: "translated",
          updatedBy: approverId,
          updatedAt: now,
        })
        .where(eq(translations.id, existing.id));
    } else {
      await tx.insert(translations).values({
        stringId: s.stringId,
        locale: s.locale,
        text: s.text,
        status: "translated",
        updatedBy: approverId,
      });
    }

    const [state] = await tx
      .select()
      .from(stringLocaleStates)
      .where(
        and(eq(stringLocaleStates.stringId, s.stringId), eq(stringLocaleStates.locale, s.locale)),
      )
      .limit(1);

    if (state) {
      await tx
        .update(stringLocaleStates)
        .set({
          status: "approved",
          approvedSuggestionId: s.id,
          approvedBy: approverId,
          approvedAt: now,
          updatedAt: now,
        })
        .where(eq(stringLocaleStates.id, state.id));
    } else {
      await tx.insert(stringLocaleStates).values({
        stringId: s.stringId,
        locale: s.locale,
        status: "approved",
        approvedSuggestionId: s.id,
        approvedBy: approverId,
        approvedAt: now,
      });
    }
  });

  return { ok: true as const, suggestion: s };
}

/**
 * Approve every non-empty suggestion by one author for a project × locale.
 * One author has at most one suggestion per string × locale; each is applied
 * as the approved mirror (overwriting a previous approval from another author).
 * Already-approved suggestions by the same author are skipped.
 */
export async function approveAllSuggestionsByAuthor(params: {
  projectId: string;
  locale: string;
  authorId: string;
  approverId: string;
}) {
  const candidates = await db
    .select({
      id: translationSuggestions.id,
      stringId: translationSuggestions.stringId,
      locale: translationSuggestions.locale,
      text: translationSuggestions.text,
    })
    .from(translationSuggestions)
    .innerJoin(stringUnits, eq(translationSuggestions.stringId, stringUnits.id))
    .innerJoin(sourceFiles, eq(stringUnits.fileId, sourceFiles.id))
    .where(
      and(
        eq(sourceFiles.projectId, params.projectId),
        eq(translationSuggestions.locale, params.locale),
        eq(translationSuggestions.authorId, params.authorId),
        // Match single approve: whitespace-only text is not approvable
        sql`btrim(coalesce(${translationSuggestions.text}, '')) <> ''`,
      ),
    );

  if (!candidates.length) {
    return { ok: true as const, approved: 0, alreadyApproved: 0, total: 0 };
  }

  const stringIds = candidates.map((c) => c.stringId);
  const states = await db
    .select({
      stringId: stringLocaleStates.stringId,
      status: stringLocaleStates.status,
      approvedSuggestionId: stringLocaleStates.approvedSuggestionId,
    })
    .from(stringLocaleStates)
    .where(
      and(
        inArray(stringLocaleStates.stringId, stringIds),
        eq(stringLocaleStates.locale, params.locale),
      ),
    );
  const stateByString = new Map(states.map((s) => [s.stringId, s]));

  const toApprove = candidates.filter((c) => {
    const st = stateByString.get(c.stringId);
    return !(st?.status === "approved" && st.approvedSuggestionId === c.id);
  });
  const alreadyApproved = candidates.length - toApprove.length;

  if (!toApprove.length) {
    return {
      ok: true as const,
      approved: 0,
      alreadyApproved,
      total: candidates.length,
    };
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    for (const s of toApprove) {
      const [existing] = await tx
        .select()
        .from(translations)
        .where(and(eq(translations.stringId, s.stringId), eq(translations.locale, s.locale)))
        .limit(1);

      if (existing) {
        await tx
          .update(translations)
          .set({
            text: s.text,
            status: "translated",
            updatedBy: params.approverId,
            updatedAt: now,
          })
          .where(eq(translations.id, existing.id));
      } else {
        await tx.insert(translations).values({
          stringId: s.stringId,
          locale: s.locale,
          text: s.text,
          status: "translated",
          updatedBy: params.approverId,
        });
      }

      const [state] = await tx
        .select()
        .from(stringLocaleStates)
        .where(
          and(eq(stringLocaleStates.stringId, s.stringId), eq(stringLocaleStates.locale, s.locale)),
        )
        .limit(1);

      if (state) {
        await tx
          .update(stringLocaleStates)
          .set({
            status: "approved",
            approvedSuggestionId: s.id,
            approvedBy: params.approverId,
            approvedAt: now,
            updatedAt: now,
          })
          .where(eq(stringLocaleStates.id, state.id));
      } else {
        await tx.insert(stringLocaleStates).values({
          stringId: s.stringId,
          locale: s.locale,
          status: "approved",
          approvedSuggestionId: s.id,
          approvedBy: params.approverId,
          approvedAt: now,
        });
      }
    }
  });

  return {
    ok: true as const,
    approved: toApprove.length,
    alreadyApproved,
    total: candidates.length,
  };
}

export async function unapproveLocale(stringId: string, locale: string) {
  const [state] = await db
    .select()
    .from(stringLocaleStates)
    .where(and(eq(stringLocaleStates.stringId, stringId), eq(stringLocaleStates.locale, locale)))
    .limit(1);

  await db
    .update(translations)
    .set({ text: "", status: "empty", updatedAt: new Date() })
    .where(and(eq(translations.stringId, stringId), eq(translations.locale, locale)));

  if (state) {
    const [countRow] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(translationSuggestions)
      .where(
        and(
          eq(translationSuggestions.stringId, stringId),
          eq(translationSuggestions.locale, locale),
          sql`coalesce(${translationSuggestions.text}, '') <> ''`,
        ),
      );
    const hasSuggestions = Number(countRow?.n ?? 0) > 0;
    await db
      .update(stringLocaleStates)
      .set({
        status: hasSuggestions ? "suggested" : "untranslated",
        approvedSuggestionId: null,
        approvedBy: null,
        approvedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(stringLocaleStates.id, state.id));
  }

  return { ok: true as const };
}

async function refreshWorkflowStatus(stringId: string, locale: string) {
  const [state] = await db
    .select()
    .from(stringLocaleStates)
    .where(and(eq(stringLocaleStates.stringId, stringId), eq(stringLocaleStates.locale, locale)))
    .limit(1);

  // Don't demote approved
  if (state?.status === "approved" && state.approvedSuggestionId) {
    return;
  }

  const [countRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(translationSuggestions)
    .where(
      and(
        eq(translationSuggestions.stringId, stringId),
        eq(translationSuggestions.locale, locale),
        sql`coalesce(${translationSuggestions.text}, '') <> ''`,
      ),
    );
  const hasSuggestions = Number(countRow?.n ?? 0) > 0;
  const status = hasSuggestions ? ("suggested" as const) : ("untranslated" as const);

  if (state) {
    await db
      .update(stringLocaleStates)
      .set({ status, updatedAt: new Date() })
      .where(eq(stringLocaleStates.id, state.id));
  } else if (hasSuggestions) {
    await db.insert(stringLocaleStates).values({
      stringId,
      locale,
      status,
    });
  }
}

export async function listComments(stringId: string, locale: string): Promise<StringCommentView[]> {
  const rows = await db
    .select({
      id: stringComments.id,
      body: stringComments.body,
      parentId: stringComments.parentId,
      authorId: stringComments.authorId,
      authorUsername: users.username,
      authorAvatarUrl: users.avatarUrl,
      reactions: stringComments.reactions,
      createdAt: stringComments.createdAt,
    })
    .from(stringComments)
    .innerJoin(users, eq(stringComments.authorId, users.id))
    .where(and(eq(stringComments.stringId, stringId), eq(stringComments.locale, locale)))
    .orderBy(asc(stringComments.createdAt));
  return rows.map((c) => ({
    ...c,
    reactions: normalizeReactionMap(c.reactions),
  }));
}

/**
 * Toggle emoji reaction on a target (BBS-style).
 * type: suggestion | suggestion_comment | string_comment
 */
export async function toggleReaction(params: {
  type: "suggestion" | "suggestion_comment" | "string_comment";
  targetId: string;
  projectId: string;
  userId: string;
  username: string;
  emoji: string;
}) {
  const emoji = normalizeReactionEmoji(params.emoji);
  if (!emoji) return { ok: false as const, error: "invalid_emoji" as const };

  if (params.type === "suggestion") {
    const [row] = await db
      .select({
        id: translationSuggestions.id,
        reactions: translationSuggestions.reactions,
        projectId: sourceFiles.projectId,
      })
      .from(translationSuggestions)
      .innerJoin(stringUnits, eq(translationSuggestions.stringId, stringUnits.id))
      .innerJoin(sourceFiles, eq(stringUnits.fileId, sourceFiles.id))
      .where(eq(translationSuggestions.id, params.targetId))
      .limit(1);
    if (!row || row.projectId !== params.projectId) {
      return { ok: false as const, error: "not_found" as const };
    }
    const { next, added } = toggleUsernameOnMap(
      normalizeReactionMap(row.reactions),
      emoji,
      params.username,
    );
    await db
      .update(translationSuggestions)
      .set({ reactions: next, updatedAt: new Date() })
      .where(eq(translationSuggestions.id, row.id));
    if (added) await bumpEmojiStat(params.userId, emoji);
    return { ok: true as const, reactions: next, added };
  }

  if (params.type === "suggestion_comment") {
    const [row] = await db
      .select({
        id: suggestionComments.id,
        reactions: suggestionComments.reactions,
        projectId: sourceFiles.projectId,
      })
      .from(suggestionComments)
      .innerJoin(
        translationSuggestions,
        eq(suggestionComments.suggestionId, translationSuggestions.id),
      )
      .innerJoin(stringUnits, eq(translationSuggestions.stringId, stringUnits.id))
      .innerJoin(sourceFiles, eq(stringUnits.fileId, sourceFiles.id))
      .where(eq(suggestionComments.id, params.targetId))
      .limit(1);
    if (!row || row.projectId !== params.projectId) {
      return { ok: false as const, error: "not_found" as const };
    }
    const { next, added } = toggleUsernameOnMap(
      normalizeReactionMap(row.reactions),
      emoji,
      params.username,
    );
    await db
      .update(suggestionComments)
      .set({ reactions: next, updatedAt: new Date() })
      .where(eq(suggestionComments.id, row.id));
    if (added) await bumpEmojiStat(params.userId, emoji);
    return { ok: true as const, reactions: next, added };
  }

  // string_comment
  const [row] = await db
    .select({
      id: stringComments.id,
      reactions: stringComments.reactions,
      projectId: sourceFiles.projectId,
    })
    .from(stringComments)
    .innerJoin(stringUnits, eq(stringComments.stringId, stringUnits.id))
    .innerJoin(sourceFiles, eq(stringUnits.fileId, sourceFiles.id))
    .where(eq(stringComments.id, params.targetId))
    .limit(1);
  if (!row || row.projectId !== params.projectId) {
    return { ok: false as const, error: "not_found" as const };
  }
  const { next, added } = toggleUsernameOnMap(
    normalizeReactionMap(row.reactions),
    emoji,
    params.username,
  );
  await db
    .update(stringComments)
    .set({ reactions: next, updatedAt: new Date() })
    .where(eq(stringComments.id, row.id));
  if (added) await bumpEmojiStat(params.userId, emoji);
  return { ok: true as const, reactions: next, added };
}

export async function addComment(params: {
  stringId: string;
  locale: string;
  userId: string;
  body: string;
  parentId?: string | null;
}) {
  let parentId: string | null = params.parentId ?? null;
  if (parentId) {
    const [parent] = await db
      .select()
      .from(stringComments)
      .where(eq(stringComments.id, parentId))
      .limit(1);
    if (!parent) {
      return { ok: false as const, error: "parent_not_found" as const };
    }
    if (parent.stringId !== params.stringId || parent.locale !== params.locale) {
      return { ok: false as const, error: "parent_mismatch" as const };
    }
    // One-level threads only: replies attach to the root comment.
    if (parent.parentId) {
      parentId = parent.parentId;
    }
  }

  const [row] = await db
    .insert(stringComments)
    .values({
      stringId: params.stringId,
      locale: params.locale,
      authorId: params.userId,
      parentId,
      body: params.body.trim(),
    })
    .returning();
  return { ok: true as const, row: row! };
}

export async function deleteComment(commentId: string, userId: string, canModerate: boolean) {
  const [row] = await db
    .select()
    .from(stringComments)
    .where(eq(stringComments.id, commentId))
    .limit(1);
  if (!row) return { ok: false as const, error: "not_found" as const };
  if (row.authorId !== userId && !canModerate) {
    return { ok: false as const, error: "forbidden" as const };
  }
  await db.delete(stringComments).where(eq(stringComments.id, commentId));
  return { ok: true as const };
}

/** List strings for file with workflow summary for a locale */
export async function listStringsWithWorkflow(params: {
  fileId: string;
  locale: string;
  status?: string | null;
  q?: string;
  page: number;
  pageSize: number;
}) {
  const { fileId, locale, status, q, page, pageSize } = params;
  const offset = (page - 1) * pageSize;

  // Load units
  let units = await db
    .select({
      id: stringUnits.id,
      keyPath: stringUnits.keyPath,
      sourceText: stringUnits.sourceText,
      sortOrder: stringUnits.sortOrder,
    })
    .from(stringUnits)
    .where(and(eq(stringUnits.fileId, fileId), eq(stringUnits.orphaned, false)))
    .orderBy(asc(stringUnits.sortOrder));

  if (q) {
    const qq = q.toLowerCase();
    units = units.filter(
      (u) =>
        u.keyPath.toLowerCase().includes(qq) || u.sourceText.toLowerCase().includes(qq),
    );
  }

  const unitIds = units.map((u) => u.id);
  if (!unitIds.length) {
    return { total: 0, strings: [] as Array<Record<string, unknown>> };
  }

  const states = await db
    .select()
    .from(stringLocaleStates)
    .where(
      and(inArray(stringLocaleStates.stringId, unitIds), eq(stringLocaleStates.locale, locale)),
    );
  const stateByString = new Map(states.map((s) => [s.stringId, s]));

  const suggCounts = await db
    .select({
      stringId: translationSuggestions.stringId,
      n: sql<number>`count(*)::int`,
    })
    .from(translationSuggestions)
    .where(
      and(
        inArray(translationSuggestions.stringId, unitIds),
        eq(translationSuggestions.locale, locale),
        sql`coalesce(${translationSuggestions.text}, '') <> ''`,
      ),
    )
    .groupBy(translationSuggestions.stringId);
  const countByString = new Map(suggCounts.map((r) => [r.stringId, Number(r.n)]));

  const approvedTexts = await db
    .select({
      stringId: translations.stringId,
      text: translations.text,
      status: translations.status,
    })
    .from(translations)
    .where(and(inArray(translations.stringId, unitIds), eq(translations.locale, locale)));
  const approvedByString = new Map(approvedTexts.map((t) => [t.stringId, t]));

  type Row = {
    id: string;
    keyPath: string;
    sourceText: string;
    workflowStatus: string;
    suggestionCount: number;
    approvedText: string;
    translation: string;
    status: string;
  };

  let rows: Row[] = units.map((u) => {
    const st = stateByString.get(u.id);
    const sc = countByString.get(u.id) ?? 0;
    const ap = approvedByString.get(u.id);
    let workflow = st?.status ?? (sc > 0 ? "suggested" : "untranslated");
    if (ap && ap.status === "translated" && ap.text.trim()) workflow = "approved";
    return {
      id: u.id,
      keyPath: u.keyPath,
      sourceText: u.sourceText,
      workflowStatus: workflow,
      suggestionCount: sc,
      approvedText: ap?.text ?? "",
      // legacy field for older clients: show approved text as translation
      translation: ap?.text ?? "",
      status:
        workflow === "approved"
          ? "translated"
          : sc > 0
            ? "draft"
            : "empty",
    };
  });

  if (status === "empty" || status === "untranslated") {
    rows = rows.filter((r) => r.workflowStatus === "untranslated");
  } else if (status === "suggested" || status === "translated") {
    // "translated" filter in UI = has suggestions but not necessarily approved
    rows = rows.filter((r) => r.workflowStatus === "suggested" || r.workflowStatus === "approved");
  } else if (status === "approved") {
    rows = rows.filter((r) => r.workflowStatus === "approved");
  } else if (status === "pending") {
    rows = rows.filter((r) => r.workflowStatus === "suggested");
  } else if (status === "todo" || status === "needs_translation") {
    // Translator work queue: untranslated + has suggestions not yet approved
    rows = rows.filter(
      (r) => r.workflowStatus === "untranslated" || r.workflowStatus === "suggested",
    );
  }

  const total = rows.length;
  const pageRows = rows.slice(offset, offset + pageSize);
  return { total, strings: pageRows };
}
