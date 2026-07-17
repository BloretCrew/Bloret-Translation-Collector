import { desc, eq, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { requireProjectAccess } from "@/lib/access";
import { forbidden, jsonCreated, jsonError, jsonOk, notFound, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { sourceFiles, stringUnits } from "@/lib/db/schema";
import { uploadFileSchema } from "@/lib/validators/common";
import { canUploadFiles } from "@/lib/permissions/roles";
import { upsertSourceFile } from "@/lib/services/files";

type Ctx = { params: Promise<{ orgSlug: string; projectSlug: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const { orgSlug, projectSlug } = await ctx.params;

  const access = await requireProjectAccess(orgSlug, projectSlug, session.userId!);
  if ("error" in access) {
    if (access.error === "not_found") return notFound();
    return forbidden();
  }

  const files = await db
    .select({
      id: sourceFiles.id,
      path: sourceFiles.path,
      sourceRevision: sourceFiles.sourceRevision,
      updatedAt: sourceFiles.updatedAt,
      stringCount: sql<number>`(
        select count(*)::int from ${stringUnits} s
        where s.file_id = ${sourceFiles.id} and s.orphaned = false
      )`,
    })
    .from(sourceFiles)
    .where(eq(sourceFiles.projectId, access.project.id))
    .orderBy(desc(sourceFiles.updatedAt));

  return jsonOk({ files });
}

export async function POST(request: Request, ctx: Ctx) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const { orgSlug, projectSlug } = await ctx.params;

  const access = await requireProjectAccess(orgSlug, projectSlug, session.userId!, "manager");
  if ("error" in access) {
    if (access.error === "not_found") return notFound();
    return forbidden();
  }
  if (!canUploadFiles(access.role)) return forbidden();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("无效的 JSON");
  }
  const parsed = uploadFileSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.errors[0]?.message ?? "参数错误");

  const result = await upsertSourceFile({
    projectId: access.project.id,
    path: parsed.data.path,
    content: parsed.data.content,
    userId: session.userId!,
  });

  if ("error" in result && result.error) {
    return jsonError(result.error, 400);
  }

  return jsonCreated(result);
}
