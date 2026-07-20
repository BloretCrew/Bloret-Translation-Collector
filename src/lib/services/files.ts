import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  sourceFiles,
  stringUnits,
  suggestionVotes,
  translationSuggestions,
  translations,
} from "@/lib/db/schema";
import { computeContentHash } from "@/lib/json-i18n";
import {
  getFormatHandler,
  inferFormatFromPath,
  type FormatMeta,
} from "@/lib/i18n-formats";
import { basenamePath, localeSuffixPath } from "@/lib/i18n-formats/filename";
import { buildZip } from "@/lib/i18n-formats/zip";
import { serializeJson } from "@/lib/i18n-formats/json";

export async function upsertSourceFile(params: {
  projectId: string;
  path: string;
  content: string;
  userId: string;
}) {
  const handler = inferFormatFromPath(params.path);
  const parsed = handler.parse(params.content);
  if (parsed.error) {
    return { error: parsed.error as string };
  }

  const { entries, warnings, data, formatMeta } = parsed;
  if (entries.length === 0) {
    return { error: "未解析到任何可翻译字符串", warnings };
  }

  const hash = computeContentHash(params.content);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(sourceFiles)
      .where(and(eq(sourceFiles.projectId, params.projectId), eq(sourceFiles.path, params.path)))
      .limit(1);

    // Unchanged content: skip revision bump and unit rewrites
    if (existing && existing.contentHash === hash) {
      return {
        fileId: existing.id,
        path: params.path,
        revision: existing.sourceRevision,
        stringCount: entries.length,
        orphanedCount: 0,
        warnings,
        unchanged: true as const,
        format: existing.format,
      };
    }

    let fileId: string;
    let revision: number;

    if (existing) {
      const [updated] = await tx
        .update(sourceFiles)
        .set({
          format: handler.id,
          rawSource: data,
          rawContent: params.content,
          formatMeta: formatMeta as FormatMeta,
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
          format: handler.id,
          rawSource: data,
          rawContent: params.content,
          formatMeta: formatMeta as FormatMeta,
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
      unchanged: false as const,
      format: handler.id,
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
export type ExportPack = "zip" | "bundle" | "file";
export type ExportFilenameMode = "original" | "locale_suffix";

export async function buildTranslationMap(
  fileId: string,
  locale: string,
  mode: ExportMode,
): Promise<Map<string, string> | null> {
  const [file] = await db.select().from(sourceFiles).where(eq(sourceFiles.id, fileId)).limit(1);
  if (!file) return null;

  const units = await db.select().from(stringUnits).where(eq(stringUnits.fileId, fileId));
  const unitIds = units.map((u) => u.id);
  const map = new Map<string, string>();

  if (unitIds.length === 0) return map;

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

  return map;
}

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

  const map = (await buildTranslationMap(fileId, locale, mode)) ?? new Map();
  const handler = getFormatHandler(file.format) ?? inferFormatFromPath(file.path);
  const body = handler.export(
    file.rawContent ?? null,
    file.rawSource,
    map,
    (file.formatMeta as FormatMeta | null) ?? null,
    { fallbackToSource },
  );

  const fidelity: "exact" | "best-effort" = file.rawContent ? "exact" : "best-effort";

  return {
    path: file.path,
    body,
    mode,
    format: handler.id,
    contentType: handler.contentType,
    fidelity,
  };
}

export function exportEntryPath(
  originalPath: string,
  locale: string,
  filenameMode: ExportFilenameMode,
): string {
  if (filenameMode === "original") return originalPath;
  return localeSuffixPath(originalPath, locale);
}

export async function buildProjectExport(params: {
  files: { id: string; path: string; format: string }[];
  locale: string;
  mode: ExportMode;
  pack: ExportPack;
  filenameMode: ExportFilenameMode;
  projectSlug: string;
}): Promise<
  | {
      kind: "file";
      body: string;
      contentType: string;
      downloadName: string;
      mode: ExportMode;
      fidelity: "exact" | "best-effort" | "mixed";
      pack: "file";
    }
  | {
      kind: "zip";
      body: Buffer;
      contentType: string;
      downloadName: string;
      mode: ExportMode;
      fidelity: "exact" | "best-effort" | "mixed";
      pack: "zip";
    }
  | {
      kind: "bundle";
      body: string;
      contentType: string;
      downloadName: string;
      mode: ExportMode;
      fidelity: "exact" | "best-effort" | "mixed";
      pack: "bundle";
    }
  | { error: string }
> {
  const { files, locale, mode, pack, filenameMode, projectSlug } = params;
  if (files.length === 0) return { error: "项目中没有源文件" };

  const exported: {
    path: string;
    exportPath: string;
    body: string;
    format: string;
    contentType: string;
    fidelity: "exact" | "best-effort";
  }[] = [];

  for (const f of files) {
    const result = await exportFileLocale(f.id, locale, mode);
    if (!result) continue;
    exported.push({
      path: result.path,
      exportPath: exportEntryPath(result.path, locale, filenameMode),
      body: result.body,
      format: result.format,
      contentType: result.contentType,
      fidelity: result.fidelity,
    });
  }

  if (exported.length === 0) return { error: "没有可导出的文件" };

  const fidelity = exported.every((e) => e.fidelity === "exact")
    ? ("exact" as const)
    : exported.every((e) => e.fidelity === "best-effort")
      ? ("best-effort" as const)
      : ("mixed" as const);

  if (exported.length === 1 && pack !== "zip" && pack !== "bundle") {
    const e = exported[0]!;
    return {
      kind: "file",
      body: e.body,
      contentType: e.contentType,
      downloadName: basenamePath(e.exportPath),
      mode,
      fidelity,
      pack: "file",
    };
  }

  // Single file but pack=zip still ok
  if (pack === "zip" || (exported.length > 1 && pack !== "bundle")) {
    const zip = buildZip(
      exported.map((e) => ({
        path: e.exportPath,
        data: e.body,
      })),
    );
    return {
      kind: "zip",
      body: zip,
      contentType: "application/zip",
      downloadName: `${projectSlug}.${locale}.zip`,
      mode,
      fidelity,
      pack: "zip",
    };
  }

  // bundle: JSON only
  if (exported.some((e) => e.format !== "json")) {
    return {
      error: "Bundle 导出仅支持 JSON 源文件；请改用 pack=zip",
    };
  }

  const bundle: Record<string, unknown> = {};
  for (const e of exported) {
    try {
      bundle[e.exportPath] = JSON.parse(e.body) as unknown;
    } catch {
      bundle[e.exportPath] = e.body;
    }
  }
  const body = serializeJson(bundle, {
    indent: 2,
    trailingNewline: true,
    newline: "\n",
    bom: false,
  });
  return {
    kind: "bundle",
    body,
    contentType: "application/json; charset=utf-8",
    downloadName: `${projectSlug}.${locale}.bundle.json`,
    mode,
    fidelity,
    pack: "bundle",
  };
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
