import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { requireProjectAccess } from "@/lib/access";
import { forbidden, jsonOk, notFound, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { sourceFiles, stringUnits, translations } from "@/lib/db/schema";

type Ctx = {
  params: Promise<{ orgSlug: string; projectSlug: string; fileId: string }>;
};

export async function GET(request: Request, ctx: Ctx) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const { orgSlug, projectSlug, fileId } = await ctx.params;

  const access = await requireProjectAccess(orgSlug, projectSlug, session.userId!);
  if ("error" in access) {
    if (access.error === "not_found") return notFound();
    return forbidden();
  }

  const [file] = await db
    .select()
    .from(sourceFiles)
    .where(and(eq(sourceFiles.id, fileId), eq(sourceFiles.projectId, access.project.id)))
    .limit(1);
  if (!file) return notFound("文件不存在");

  const url = new URL(request.url);
  const locale = url.searchParams.get("locale") ?? "";
  const status = url.searchParams.get("status"); // empty | translated | all
  const q = url.searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get("pageSize") ?? "100") || 100));
  const offset = (page - 1) * pageSize;

  const conditions = [eq(stringUnits.fileId, fileId), eq(stringUnits.orphaned, false)];

  if (q) {
    conditions.push(
      or(ilike(stringUnits.keyPath, `%${q}%`), ilike(stringUnits.sourceText, `%${q}%`))!,
    );
  }

  // Fetch strings with left join translations for locale
  const baseQuery = db
    .select({
      id: stringUnits.id,
      keyPath: stringUnits.keyPath,
      sourceText: stringUnits.sourceText,
      sortOrder: stringUnits.sortOrder,
      translationText: translations.text,
      translationStatus: translations.status,
    })
    .from(stringUnits)
    .leftJoin(
      translations,
      and(
        eq(translations.stringId, stringUnits.id),
        locale ? eq(translations.locale, locale) : sql`false`,
      ),
    )
    .where(and(...conditions))
    .orderBy(asc(stringUnits.sortOrder))
    .limit(pageSize)
    .offset(offset);

  let rows = await baseQuery;

  if (status === "empty" && locale) {
    rows = rows.filter((r) => !r.translationText || r.translationStatus === "empty");
  } else if (status === "translated" && locale) {
    rows = rows.filter((r) => r.translationStatus === "translated" && r.translationText);
  }

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(stringUnits)
    .where(and(eq(stringUnits.fileId, fileId), eq(stringUnits.orphaned, false)));

  return jsonOk({
    locale,
    page,
    pageSize,
    total: countRow?.total ?? 0,
    strings: rows.map((r) => ({
      id: r.id,
      keyPath: r.keyPath,
      sourceText: r.sourceText,
      translation: r.translationText ?? "",
      status: r.translationStatus ?? "empty",
    })),
  });
}
