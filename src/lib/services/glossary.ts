import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  glossaryTerms,
  glossaryTranslations,
  projectLocaleAssignees,
  users,
} from "@/lib/db/schema";

export async function listGlossary(projectId: string, locale?: string) {
  const terms = await db
    .select()
    .from(glossaryTerms)
    .where(eq(glossaryTerms.projectId, projectId));

  if (!terms.length) return [];

  const termIds = terms.map((t) => t.id);
  const allTrs = await db
    .select()
    .from(glossaryTranslations)
    .where(inArray(glossaryTranslations.termId, termIds));

  const byTerm = new Map<string, typeof allTrs>();
  for (const tr of allTrs) {
    const arr = byTerm.get(tr.termId) ?? [];
    arr.push(tr);
    byTerm.set(tr.termId, arr);
  }

  return terms.map((t) => ({
    id: t.id,
    sourceTerm: t.sourceTerm,
    description: t.description,
    caseSensitive: t.caseSensitive,
    translations: (byTerm.get(t.id) ?? [])
      .filter((tr) => !locale || tr.locale === locale)
      .map((tr) => ({ locale: tr.locale, translation: tr.translation })),
  }));
}

/** Terms whose sourceTerm appears in sourceText (for editor sidebar) */
export function matchGlossaryTerms(
  terms: Array<{
    id: string;
    sourceTerm: string;
    description: string | null;
    caseSensitive: boolean;
    translations: Array<{ locale: string; translation: string }>;
  }>,
  sourceText: string,
  locale: string,
) {
  const hits: Array<{
    id: string;
    sourceTerm: string;
    description: string | null;
    translation: string | null;
  }> = [];

  for (const t of terms) {
    if (!t.sourceTerm) continue;
    const hay = t.caseSensitive ? sourceText : sourceText.toLowerCase();
    const needle = t.caseSensitive ? t.sourceTerm : t.sourceTerm.toLowerCase();
    if (!needle || !hay.includes(needle)) continue;
    const tr = t.translations.find((x) => x.locale === locale);
    hits.push({
      id: t.id,
      sourceTerm: t.sourceTerm,
      description: t.description,
      translation: tr?.translation ?? null,
    });
  }
  hits.sort((a, b) => b.sourceTerm.length - a.sourceTerm.length);
  return hits;
}

export async function createGlossaryTerm(params: {
  projectId: string;
  sourceTerm: string;
  description?: string | null;
  userId: string;
  translations?: Array<{ locale: string; translation: string }>;
}) {
  const sourceTerm = params.sourceTerm.trim();
  if (!sourceTerm) throw new Error("empty_term");

  const [term] = await db
    .insert(glossaryTerms)
    .values({
      projectId: params.projectId,
      sourceTerm,
      description: params.description ?? null,
      createdBy: params.userId,
    })
    .returning();

  if (params.translations?.length) {
    await db.insert(glossaryTranslations).values(
      params.translations
        .filter((t) => t.translation.trim())
        .map((t) => ({
          termId: term!.id,
          locale: t.locale,
          translation: t.translation.trim(),
        })),
    );
  }
  return term!;
}

export async function upsertGlossaryTranslation(
  termId: string,
  locale: string,
  translation: string,
) {
  const [existing] = await db
    .select()
    .from(glossaryTranslations)
    .where(
      and(eq(glossaryTranslations.termId, termId), eq(glossaryTranslations.locale, locale)),
    )
    .limit(1);
  if (existing) {
    const [row] = await db
      .update(glossaryTranslations)
      .set({ translation, updatedAt: new Date() })
      .where(eq(glossaryTranslations.id, existing.id))
      .returning();
    return row!;
  }
  const [row] = await db
    .insert(glossaryTranslations)
    .values({ termId, locale, translation })
    .returning();
  return row!;
}

export async function deleteGlossaryTerm(termId: string) {
  await db.delete(glossaryTerms).where(eq(glossaryTerms.id, termId));
}

export async function listLocaleAssignees(projectId: string, locale?: string) {
  const rows = await db
    .select({
      id: projectLocaleAssignees.id,
      locale: projectLocaleAssignees.locale,
      userId: projectLocaleAssignees.userId,
      kind: projectLocaleAssignees.kind,
      username: users.username,
      avatarUrl: users.avatarUrl,
    })
    .from(projectLocaleAssignees)
    .innerJoin(users, eq(projectLocaleAssignees.userId, users.id))
    .where(
      locale
        ? and(
            eq(projectLocaleAssignees.projectId, projectId),
            eq(projectLocaleAssignees.locale, locale),
          )
        : eq(projectLocaleAssignees.projectId, projectId),
    );
  return rows;
}

export async function addLocaleAssignee(params: {
  projectId: string;
  locale: string;
  userId: string;
  kind: "translator" | "proofreader";
}) {
  try {
    const [row] = await db
      .insert(projectLocaleAssignees)
      .values({
        projectId: params.projectId,
        locale: params.locale,
        userId: params.userId,
        kind: params.kind,
      })
      .returning();
    return { ok: true as const, row: row! };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return { ok: false as const, error: "duplicate" as const };
    }
    throw e;
  }
}

export async function removeLocaleAssignee(id: string) {
  await db.delete(projectLocaleAssignees).where(eq(projectLocaleAssignees.id, id));
}

export async function isLocaleAssignee(
  projectId: string,
  locale: string,
  userId: string,
  kind: "translator" | "proofreader",
) {
  const [row] = await db
    .select()
    .from(projectLocaleAssignees)
    .where(
      and(
        eq(projectLocaleAssignees.projectId, projectId),
        eq(projectLocaleAssignees.locale, locale),
        eq(projectLocaleAssignees.userId, userId),
        eq(projectLocaleAssignees.kind, kind),
      ),
    )
    .limit(1);
  return Boolean(row);
}
