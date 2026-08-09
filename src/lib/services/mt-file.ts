import { and, eq, isNull, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { machineTranslations } from "@/lib/db/schema";
import { flattenJson, parseJsonFile } from "@/lib/json-i18n";

export type MtFileEntry = { keyPath: string; text: string };

/** SQL condition matching a fileId value or NULL (project-global) rows. */
function fileIdCond(fileId: string | null): SQL {
  return fileId ? eq(machineTranslations.fileId, fileId) : isNull(machineTranslations.fileId);
}

export type ParseMtResult = {
  entries: MtFileEntry[];
  warnings: string[];
  error?: string;
};

/**
 * Parse a machine-translation JSON file into `{ keyPath, text }` entries.
 * The file is the target-language translation of the source JSON, so its key
 * paths must match the flattened source key paths.
 */
export function parseMtFile(content: string): ParseMtResult {
  const stripped = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const parsed = parseJsonFile(stripped);
  if (parsed.error) {
    return { entries: [], warnings: [], error: parsed.error };
  }
  const { entries, warnings } = flattenJson(parsed.data);
  return {
    entries: entries
      .filter((e) => e.keyPath && e.sourceText.trim() !== "")
      .map((e) => ({ keyPath: e.keyPath, text: e.sourceText })),
    warnings,
  };
}

export async function upsertMachineTranslations(params: {
  projectId: string;
  fileId: string | null;
  locale: string;
  entries: MtFileEntry[];
  raw?: Record<string, unknown> | null;
  userId: string;
}) {
  if (!params.entries.length) return { upserted: 0 };

  const { projectId, fileId, locale, entries, raw, userId } = params;

  // Clear any existing MT rows for this file × locale, then insert fresh.
  await db
    .delete(machineTranslations)
    .where(
      and(
        eq(machineTranslations.projectId, projectId),
        fileIdCond(fileId),
        eq(machineTranslations.locale, locale),
      ),
    );

  await db.insert(machineTranslations).values(
    entries.map((e) => ({
      projectId,
      fileId: fileId ?? null,
      locale,
      keyPath: e.keyPath,
      text: e.text,
      raw,
      updatedBy: userId,
      updatedAt: new Date(),
    })),
  );

  return { upserted: entries.length };
}

/** Read MT translations for a project × file × locale as a keyPath → text map. */
export async function getMachineTranslations(
  projectId: string,
  fileId: string | null,
  locale: string,
): Promise<Map<string, string>> {
  const rows = await db
    .select({ keyPath: machineTranslations.keyPath, text: machineTranslations.text })
    .from(machineTranslations)
    .where(
      and(
        eq(machineTranslations.projectId, projectId),
        fileIdCond(fileId),
        eq(machineTranslations.locale, locale),
      ),
    );
  const map = new Map<string, string>();
  for (const r of rows) {
    if (r.text && r.text.trim()) map.set(r.keyPath, r.text);
  }
  return map;
}

/**
 * Read all MT translations for a project × locale (file-scoped and global
 * rows combined) as a keyPath → text map. Used for export fallback where a
 * single locale's MT applies across all source files.
 */
export async function getProjectMachineTranslations(
  projectId: string,
  locale: string,
): Promise<Map<string, string>> {
  const rows = await db
    .select({ keyPath: machineTranslations.keyPath, text: machineTranslations.text })
    .from(machineTranslations)
    .where(
      and(eq(machineTranslations.projectId, projectId), eq(machineTranslations.locale, locale)),
    );
  const map = new Map<string, string>();
  for (const r of rows) {
    if (r.text && r.text.trim() && !map.has(r.keyPath)) map.set(r.keyPath, r.text);
  }
  return map;
}

/**
 * Look up a single string's MT translation. Prefers a file-scoped row, then a
 * project-global row (fileId = null).
 */
export async function lookupStringMt(
  projectId: string,
  fileId: string | null,
  locale: string,
  keyPath: string,
): Promise<string | null> {
  const fileScoped = fileId
    ? await db
        .select({ text: machineTranslations.text })
        .from(machineTranslations)
        .where(
          and(
            eq(machineTranslations.projectId, projectId),
            eq(machineTranslations.fileId, fileId),
            eq(machineTranslations.locale, locale),
            eq(machineTranslations.keyPath, keyPath),
          ),
        )
        .limit(1)
    : [];
  if (fileScoped[0]?.text?.trim()) return fileScoped[0].text;

  const global = await db
    .select({ text: machineTranslations.text })
    .from(machineTranslations)
    .where(
      and(
        eq(machineTranslations.projectId, projectId),
        isNull(machineTranslations.fileId),
        eq(machineTranslations.locale, locale),
        eq(machineTranslations.keyPath, keyPath),
      ),
    )
    .limit(1);
  return global[0]?.text?.trim() ? global[0].text : null;
}

/** Delete all MT rows for a project (optionally scoped to file/locale). */
export async function deleteMachineTranslations(params: {
  projectId: string;
  fileId?: string | null;
  locale?: string | null;
}) {
  const conditions = [eq(machineTranslations.projectId, params.projectId)];
  if (params.fileId !== undefined) {
    conditions.push(fileIdCond(params.fileId));
  }
  if (params.locale) conditions.push(eq(machineTranslations.locale, params.locale));
  await db.delete(machineTranslations).where(and(...conditions));
}

/** Count MT rows per locale for a project (for UI status). */
export async function countMachineTranslationsByLocale(projectId: string) {
  const rows = await db
    .select({
      locale: machineTranslations.locale,
      fileId: machineTranslations.fileId,
    })
    .from(machineTranslations)
    .where(eq(machineTranslations.projectId, projectId));
  const byLocale = new Map<string, { count: number; files: Set<string | null> }>();
  for (const r of rows) {
    const cur = byLocale.get(r.locale) ?? { count: 0, files: new Set<string | null>() };
    cur.count += 1;
    cur.files.add(r.fileId);
    byLocale.set(r.locale, cur);
  }
  return byLocale;
}
