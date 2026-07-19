import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  sourceFiles,
  stringUnits,
  suggestionVotes,
  translationSuggestions,
  translations,
} from "@/lib/db/schema";
import {
  computeContentHash,
  flattenJson,
  parseJsonFile,
  exportWithStructure,
} from "@/lib/json-i18n";

export async function upsertSourceFile(params: {
  projectId: string;
  path: string;
  content: string;
  userId: string;
}) {
  const parsed = parseJsonFile(params.content);
  if (parsed.error) {
    return { error: parsed.error as string };
  }

  const { entries, warnings } = flattenJson(parsed.data);
  if (entries.length === 0) {
    return { error: "未解析到任何字符串叶子节点", warnings };
  }

  const hash = computeContentHash(params.content);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(sourceFiles)
      .where(and(eq(sourceFiles.projectId, params.projectId), eq(sourceFiles.path, params.path)))
      .limit(1);

    let fileId: string;
    let revision: number;

    if (existing) {
      const [updated] = await tx
        .update(sourceFiles)
        .set({
          rawSource: parsed.data,
          contentHash: hash,
          sourceRevision: existing.sourceRevision + 1,
          updatedBy: params.userId,
          updatedAt: new Date(),
        })
        .where(eq(sourceFiles.id, existing.id))
        .returning();
      fileId = updated!.id;
      revision = updated!.sourceRevision;
    } else {
      const [created] = await tx
        .insert(sourceFiles)
        .values({
          projectId: params.projectId,
          path: params.path,
          rawSource: parsed.data,
          contentHash: hash,
          sourceRevision: 1,
          updatedBy: params.userId,
        })
        .returning();
      fileId = created!.id;
      revision = 1;
    }

    const existingStrings = await tx
      .select()
      .from(stringUnits)
      .where(eq(stringUnits.fileId, fileId));

    const byKey = new Map(existingStrings.map((s) => [s.keyPath, s]));
    const seen = new Set<string>();

    for (const entry of entries) {
      seen.add(entry.keyPath);
      const prev = byKey.get(entry.keyPath);
      if (prev) {
        await tx
          .update(stringUnits)
          .set({
            sourceText: entry.sourceText,
            sortOrder: entry.sortOrder,
            orphaned: false,
          })
          .where(eq(stringUnits.id, prev.id));
      } else {
        await tx.insert(stringUnits).values({
          fileId,
          keyPath: entry.keyPath,
          sourceText: entry.sourceText,
          sortOrder: entry.sortOrder,
          orphaned: false,
        });
      }
    }

    const orphanIds = existingStrings.filter((s) => !seen.has(s.keyPath)).map((s) => s.id);
    if (orphanIds.length > 0) {
      await tx
        .update(stringUnits)
        .set({ orphaned: true })
        .where(inArray(stringUnits.id, orphanIds));
    }

    const stringCount = entries.length;
    return {
      fileId,
      path: params.path,
      revision,
      stringCount,
      orphanedCount: orphanIds.length,
      warnings,
    };
  });
}

/**
 * Export strategy for unapproved / missing approved text:
 * - approved: only approved (translations table); missing → "" or source via fallbackToSource
 * - top_voted: approved first, else highest-voted non-empty suggestion
 * - source: missing → source text (fallbackToSource true)
 * - empty: missing → ""
 */
export type ExportMode = "approved" | "top_voted" | "source" | "empty";

export async function exportFileLocale(
  fileId: string,
  locale: string,
  modeOrFallback: boolean | ExportMode = "source",
) {
  const mode: ExportMode =
    typeof modeOrFallback === "boolean"
      ? modeOrFallback
        ? "source"
        : "empty"
      : modeOrFallback;

  const fallbackToSource = mode === "source";
  const [file] = await db.select().from(sourceFiles).where(eq(sourceFiles.id, fileId)).limit(1);
  if (!file) return null;

  const units = await db.select().from(stringUnits).where(eq(stringUnits.fileId, fileId));
  const unitIds = units.map((u) => u.id);
  const map = new Map<string, string>();

  if (unitIds.length > 0) {
    // Always load approved first
    const rows = await db
      .select({
        stringId: translations.stringId,
        text: translations.text,
        keyPath: stringUnits.keyPath,
        status: translations.status,
      })
      .from(translations)
      .innerJoin(stringUnits, eq(translations.stringId, stringUnits.id))
      .where(and(eq(translations.locale, locale), inArray(translations.stringId, unitIds)));

    for (const row of rows) {
      if (row.status === "translated" && row.text.trim()) {
        map.set(row.keyPath, row.text);
      }
    }

    if (mode === "top_voted") {
      const missing = units.filter((u) => !map.has(u.keyPath) && !u.orphaned);
      if (missing.length) {
        const missingIds = missing.map((u) => u.id);
        const keyById = new Map(missing.map((u) => [u.id, u.keyPath]));
        const suggs = await db
          .select({
            id: translationSuggestions.id,
            stringId: translationSuggestions.stringId,
            text: translationSuggestions.text,
            updatedAt: translationSuggestions.updatedAt,
            votes: sql<number>`coalesce((
              select sum(${suggestionVotes.value})::int from ${suggestionVotes}
              where ${suggestionVotes.suggestionId} = ${translationSuggestions.id}
            ), 0)`,
          })
          .from(translationSuggestions)
          .where(
            and(
              eq(translationSuggestions.locale, locale),
              inArray(translationSuggestions.stringId, missingIds),
              sql`coalesce(${translationSuggestions.text}, '') <> ''`,
            ),
          );

        // pick best per stringId
        const best = new Map<string, { text: string; votes: number; updatedAt: Date }>();
        for (const s of suggs) {
          const votes = Number(s.votes ?? 0);
          const prev = best.get(s.stringId);
          if (
            !prev ||
            votes > prev.votes ||
            (votes === prev.votes && s.updatedAt > prev.updatedAt)
          ) {
            best.set(s.stringId, { text: s.text, votes, updatedAt: s.updatedAt });
          }
        }
        for (const [stringId, val] of best) {
          const keyPath = keyById.get(stringId);
          if (keyPath) map.set(keyPath, val.text);
        }
      }
    }
  }

  const exported = exportWithStructure(file.rawSource, map, { fallbackToSource });
  return { path: file.path, data: exported, mode };
}

export type LocaleProgress = {
  locale: string;
  /** Approved (publish-ready) count */
  translated: number;
  /** Has at least one non-empty suggestion */
  suggested: number;
  total: number;
  percent: number;
};

async function progressForFileIds(fileIds: string[]): Promise<{
  totalStrings: number;
  byLocale: LocaleProgress[];
}> {
  if (fileIds.length === 0) {
    return { totalStrings: 0, byLocale: [] };
  }

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(stringUnits)
    .where(and(inArray(stringUnits.fileId, fileIds), eq(stringUnits.orphaned, false)));

  const total = Number(countRow?.total ?? 0);

  const unitRows = await db
    .select({ id: stringUnits.id })
    .from(stringUnits)
    .where(and(inArray(stringUnits.fileId, fileIds), eq(stringUnits.orphaned, false)));

  const unitIds = unitRows.map((u) => u.id);
  if (unitIds.length === 0) {
    return { totalStrings: 0, byLocale: [] };
  }

  // Approved = translations mirror with status translated
  const approvedRows = await db
    .select({
      locale: translations.locale,
      translated: sql<number>`count(*)::int`,
    })
    .from(translations)
    .where(
      and(
        inArray(translations.stringId, unitIds),
        eq(translations.status, "translated"),
        sql`${translations.text} <> ''`,
      ),
    )
    .groupBy(translations.locale);

  // Suggested = distinct strings with non-empty suggestions (may include approved)
  const suggestedRows = await db
    .select({
      locale: translationSuggestions.locale,
      suggested: sql<number>`count(distinct ${translationSuggestions.stringId})::int`,
    })
    .from(translationSuggestions)
    .where(
      and(
        inArray(translationSuggestions.stringId, unitIds),
        sql`coalesce(${translationSuggestions.text}, '') <> ''`,
      ),
    )
    .groupBy(translationSuggestions.locale);

  const suggestedMap = new Map(
    suggestedRows.map((r) => [r.locale, Number(r.suggested)]),
  );

  const locales = new Set([
    ...approvedRows.map((r) => r.locale),
    ...suggestedRows.map((r) => r.locale),
  ]);

  const byLocale: LocaleProgress[] = [];
  for (const locale of locales) {
    const approved = approvedRows.find((r) => r.locale === locale);
    const translated = Number(approved?.translated ?? 0);
    const suggested = suggestedMap.get(locale) ?? 0;
    byLocale.push({
      locale,
      translated,
      suggested,
      total,
      percent: total === 0 ? 0 : Math.round((translated / total) * 100),
    });
  }

  return { totalStrings: total, byLocale };
}

export async function getProjectProgress(projectId: string) {
  const files = await db
    .select({ id: sourceFiles.id })
    .from(sourceFiles)
    .where(eq(sourceFiles.projectId, projectId));

  return progressForFileIds(files.map((f) => f.id));
}

export async function getFileProgress(fileId: string) {
  return progressForFileIds([fileId]);
}
