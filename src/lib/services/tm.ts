/**
 * Translation memory (TM): exact / substring matches of source text against
 * existing translations in the same project + locale.
 *
 * Sources, in priority order:
 *   1. approved translations (translations.status = 'translated') — publish-ready;
 *   2. unapproved suggestions (translation_suggestions) — draft reference so
 *      translators can reuse work that hasn't been reviewed/approved yet.
 */
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  sourceFiles,
  stringUnits,
  translationSuggestions,
  translations,
} from "@/lib/db/schema";

export type TmHit = {
  stringId: string;
  keyPath: string;
  sourceText: string;
  translation: string;
  filePath: string;
  /** exact | contains | contained */
  match: "exact" | "contains" | "contained";
  score: number;
  /** Where the translation came from. */
  source: "approved" | "suggestion";
};

function scoreMatch(query: string, candidate: string): TmHit["match"] | null {
  const q = query.trim();
  const c = candidate.trim();
  if (!q || !c) return null;
  if (q === c) return "exact";
  const ql = q.toLowerCase();
  const cl = c.toLowerCase();
  if (ql === cl) return "exact";
  if (cl.includes(ql)) return "contains"; // candidate longer, contains query
  if (ql.includes(cl) && cl.length >= 2) return "contained"; // query contains candidate
  return null;
}

function scoreOf(match: TmHit["match"], queryLen: number, candLen: number): number {
  if (match === "exact") return 100;
  if (match === "contains") {
    // how much of candidate is the query
    return Math.min(99, Math.round((queryLen / Math.max(candLen, 1)) * 90));
  }
  // contained
  return Math.min(80, Math.round((candLen / Math.max(queryLen, 1)) * 70));
}

export async function lookupTranslationMemory(params: {
  projectId: string;
  locale: string;
  sourceText: string;
  excludeStringId?: string;
  limit?: number;
}): Promise<TmHit[]> {
  const limit = params.limit ?? 8;
  const q = params.sourceText.trim();
  if (!q) return [];

  const files = await db
    .select({ id: sourceFiles.id, path: sourceFiles.path })
    .from(sourceFiles)
    .where(eq(sourceFiles.projectId, params.projectId));
  if (!files.length) return [];

  const fileIds = files.map((f) => f.id);
  const pathByFile = new Map(files.map((f) => [f.id, f.path]));

  const units = await db
    .select({
      id: stringUnits.id,
      keyPath: stringUnits.keyPath,
      sourceText: stringUnits.sourceText,
      fileId: stringUnits.fileId,
    })
    .from(stringUnits)
    .where(
      and(
        inArray(stringUnits.fileId, fileIds),
        eq(stringUnits.orphaned, false),
        params.excludeStringId ? ne(stringUnits.id, params.excludeStringId) : sql`true`,
      ),
    );

  if (!units.length) return [];

  const unitIds = units.map((u) => u.id);
  const locale = params.locale;

  // 1. Approved translations (publish-ready) — highest priority.
  const approved = await db
    .select({
      stringId: translations.stringId,
      text: translations.text,
    })
    .from(translations)
    .where(
      and(
        inArray(translations.stringId, unitIds),
        eq(translations.locale, locale),
        eq(translations.status, "translated"),
        sql`coalesce(${translations.text}, '') <> ''`,
      ),
    );

  // 2. Unapproved suggestions (drafts) — only for strings not already covered
  //    by an approved translation, so approved text always wins per string.
  const approvedStringIds = new Set(approved.map((a) => a.stringId));
  const candidateStringIds = unitIds.filter((id) => !approvedStringIds.has(id));
  let suggestions: { stringId: string; text: string }[] = [];
  if (candidateStringIds.length) {
    suggestions = await db
      .select({
        stringId: translationSuggestions.stringId,
        text: translationSuggestions.text,
      })
      .from(translationSuggestions)
      .where(
        and(
          inArray(translationSuggestions.stringId, candidateStringIds),
          eq(translationSuggestions.locale, locale),
          sql`coalesce(${translationSuggestions.text}, '') <> ''`,
        ),
      )
      // Prefer the most recently updated suggestion per string.
      .orderBy(desc(translationSuggestions.updatedAt));
  }

  // Latest suggestion per string (orderBy above puts newest first).
  const suggestionByString = new Map<string, string>();
  for (const s of suggestions) {
    if (!suggestionByString.has(s.stringId)) suggestionByString.set(s.stringId, s.text);
  }

  const unitById = new Map(units.map((u) => [u.id, u]));

  const hits: TmHit[] = [];

  const pushHits = (translationByString: Map<string, string>, source: TmHit["source"]) => {
    for (const [stringId, translation] of translationByString) {
      const u = unitById.get(stringId);
      if (!u) continue;
      const match = scoreMatch(q, u.sourceText);
      if (!match) continue;
      hits.push({
        stringId: u.id,
        keyPath: u.keyPath,
        sourceText: u.sourceText,
        translation,
        filePath: pathByFile.get(u.fileId) ?? "",
        match,
        score: scoreOf(match, q.length, u.sourceText.length),
        source,
      });
    }
  };

  pushHits(new Map(approved.map((a) => [a.stringId, a.text])), "approved");
  pushHits(suggestionByString, "suggestion");

  // Sort: approved first, then by score; stable-ish tiebreak on keyPath.
  hits.sort(
    (a, b) =>
      Number(a.source === "suggestion") - Number(b.source === "suggestion") ||
      b.score - a.score ||
      a.keyPath.localeCompare(b.keyPath),
  );

  return hits.slice(0, limit);
}

