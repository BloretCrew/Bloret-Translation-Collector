import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { requireProjectAccess } from "@/lib/access";
import { forbidden, jsonError, notFound, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { projectLanguages, sourceFiles } from "@/lib/db/schema";
import { exportFileLocale } from "@/lib/services/files";
import { localeSchema } from "@/lib/validators/common";
import { canExport } from "@/lib/permissions/roles";

type Ctx = { params: Promise<{ orgSlug: string; projectSlug: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const { orgSlug, projectSlug } = await ctx.params;

  const access = await requireProjectAccess(orgSlug, projectSlug, session.userId!);
  if ("error" in access) {
    if (access.error === "not_found") return notFound();
    return forbidden();
  }
  if (!canExport(access.role)) return forbidden();

  const url = new URL(request.url);
  const localeRaw = url.searchParams.get("locale");
  const fileId = url.searchParams.get("fileId");
  const fallback = url.searchParams.get("fallback") !== "empty";

  if (!localeRaw) return jsonError("缺少 locale 参数");
  const localeParsed = localeSchema.safeParse(localeRaw);
  if (!localeParsed.success) return jsonError("无效语言代码");
  const locale = localeParsed.data;

  const [lang] = await db
    .select()
    .from(projectLanguages)
    .where(
      and(eq(projectLanguages.projectId, access.project.id), eq(projectLanguages.locale, locale)),
    )
    .limit(1);
  if (!lang) return jsonError("语言未在项目中启用");

  let files = await db
    .select()
    .from(sourceFiles)
    .where(eq(sourceFiles.projectId, access.project.id));

  if (fileId) {
    files = files.filter((f) => f.id === fileId);
    if (!files.length) return notFound("文件不存在");
  }

  if (files.length === 0) return jsonError("项目中没有源文件");

  // MVP: single file export if one file or fileId specified; multi-file as map
  if (files.length === 1) {
    const result = await exportFileLocale(files[0]!.id, locale, fallback);
    if (!result) return notFound();
    const filename = result.path.replace(/\.json$/i, "") + `.${locale}.json`;
    return new Response(JSON.stringify(result.data, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const bundle: Record<string, unknown> = {};
  for (const f of files) {
    const result = await exportFileLocale(f.id, locale, fallback);
    if (result) bundle[result.path] = result.data;
  }

  const filename = `${projectSlug}.${locale}.bundle.json`;
  return new Response(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
