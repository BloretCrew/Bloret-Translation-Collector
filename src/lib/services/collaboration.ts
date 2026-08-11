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
  type ProjectTranslationRules,
} from "@/lib/db/schema";
import { applyTranslationRules } from "@/lib/services/translation-rules";

export type SuggestionCommentView = {
  id: string;
  suggestionId: string;
  parentId: string | null;
  body: string;
  authorId: string;
  authorUsername: string;
  authorAvatarUrl: string | null;
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
  createdAt: Date;
  updatedAt: Date;
  comments: SuggestionCommentView[];
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
      list.push(c);
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
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        comments: commentsBySuggestion.get(r.id) ?? [],
      }),
    ),
  };
}

export async function listSuggestionComments(suggestionId: string) {
  return db
    .select({
      id: suggestionComments.id,
      suggestionId: suggestionComments.suggestionId,
      parentId: suggestionComments.parentId,
      body: suggestionComments.body,
      authorId: suggestionComments.authorId,
      authorUsername: users.username,
      authorAvatarUrl: users.avatarUrl,
      createdAt: suggestionComments.createdAt,
    })
    .from(suggestionComments)
    .innerJoin(users, eq(suggestionComments.authorId, users.id))
    .where(eq(suggestionComments.suggestionId, suggestionId))
    .orderBy(asc(suggestionComments.createdAt));
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

export async function listComments(stringId: string, locale: string) {
  return db
    .select({
      id: stringComments.id,
      body: stringComments.body,
      parentId: stringComments.parentId,
      authorId: stringComments.authorId,
      authorUsername: users.username,
      authorAvatarUrl: users.avatarUrl,
      createdAt: stringComments.createdAt,
    })
    .from(stringComments)
    .innerJoin(users, eq(stringComments.authorId, users.id))
    .where(and(eq(stringComments.stringId, stringId), eq(stringComments.locale, locale)))
    .orderBy(asc(stringComments.createdAt));
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
