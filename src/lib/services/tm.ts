/**
 * Simple translation memory (TM): exact / substring matches of source text
 * against approved translations in the same project + locale.
 */
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { sourceFiles, stringUnits, translations } from "@/lib/db/schema";

export type TmHit = {
  stringId: string;
  keyPath: string;
  sourceText: string;
  translation: string;
  filePath: string;
  /** exact | contains | contained */
  match: "exact" | "contains" | "contained";
  score: number;
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
        params.excludeStringId
          ? ne(stringUnits.id, params.excludeStringId)
          : sql`true`,
      ),
    );

  if (!units.length) return [];

  const unitIds = units.map((u) => u.id);
  const approved = await db
    .select({
      stringId: translations.stringId,
      text: translations.text,
    })
    .from(translations)
    .where(
      and(
        inArray(translations.stringId, unitIds),
        eq(translations.locale, params.locale),
        eq(translations.status, "translated"),
        sql`coalesce(${translations.text}, '') <> ''`,
      ),
    );

  const textByString = new Map(approved.map((a) => [a.stringId, a.text]));
  const unitById = new Map(units.map((u) => [u.id, u]));

  const hits: TmHit[] = [];
  for (const [stringId, translation] of textByString) {
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
    });
  }

  hits.sort((a, b) => b.score - a.score || a.keyPath.localeCompare(b.keyPath));
  return hits.slice(0, limit);
}
