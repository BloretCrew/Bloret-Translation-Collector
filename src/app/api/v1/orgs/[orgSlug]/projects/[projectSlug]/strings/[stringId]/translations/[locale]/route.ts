import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { requireProjectAccess } from "@/lib/access";
import { forbidden, jsonError, jsonOk, notFound, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { projectLanguages, sourceFiles, stringUnits, translations } from "@/lib/db/schema";
import { saveTranslationSchema, localeSchema } from "@/lib/validators/common";
import { canEditTranslations } from "@/lib/permissions/roles";

type Ctx = {
  params: Promise<{
    orgSlug: string;
    projectSlug: string;
    stringId: string;
    locale: string;
  }>;
};

export async function PUT(request: Request, ctx: Ctx) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const { orgSlug, projectSlug, stringId, locale: rawLocale } = await ctx.params;

  const localeParsed = localeSchema.safeParse(rawLocale);
  if (!localeParsed.success) return jsonError("无效语言代码");

  const access = await requireProjectAccess(orgSlug, projectSlug, session.userId!, "translator");
  if ("error" in access) {
    if (access.error === "not_found") return notFound();
    return forbidden();
  }
  if (!canEditTranslations(access.role)) return forbidden();

  const locale = localeParsed.data;

  const [lang] = await db
    .select()
    .from(projectLanguages)
    .where(
      and(
        eq(projectLanguages.projectId, access.project.id),
        eq(projectLanguages.locale, locale),
        eq(projectLanguages.enabled, true),
      ),
    )
    .limit(1);
  if (!lang) return jsonError("语言未在项目中启用");

  const [unit] = await db
    .select({
      id: stringUnits.id,
      fileId: stringUnits.fileId,
      projectId: sourceFiles.projectId,
    })
    .from(stringUnits)
    .innerJoin(sourceFiles, eq(stringUnits.fileId, sourceFiles.id))
    .where(and(eq(stringUnits.id, stringId), eq(sourceFiles.projectId, access.project.id)))
    .limit(1);

  if (!unit) return notFound("字符串不存在");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("无效的 JSON");
  }
  const parsed = saveTranslationSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.errors[0]?.message ?? "参数错误");

  const text = parsed.data.text;
  const status = text.trim().length > 0 ? ("translated" as const) : ("empty" as const);

  const [existing] = await db
    .select()
    .from(translations)
    .where(and(eq(translations.stringId, stringId), eq(translations.locale, locale)))
    .limit(1);

  let row;
  if (existing) {
    [row] = await db
      .update(translations)
      .set({
        text,
        status,
        updatedBy: session.userId!,
        updatedAt: new Date(),
      })
      .where(eq(translations.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(translations)
      .values({
        stringId,
        locale,
        text,
        status,
        updatedBy: session.userId!,
      })
      .returning();
  }

  return jsonOk({
    id: row!.id,
    stringId,
    locale,
    text: row!.text,
    status: row!.status,
    updatedAt: row!.updatedAt,
  });
}
