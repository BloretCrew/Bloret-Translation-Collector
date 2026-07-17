import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { requireProjectAccess } from "@/lib/access";
import { forbidden, jsonOk, notFound, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { sourceFiles } from "@/lib/db/schema";
import { canUploadFiles } from "@/lib/permissions/roles";
import { getFileProgress } from "@/lib/services/files";

type Ctx = {
  params: Promise<{ orgSlug: string; projectSlug: string; fileId: string }>;
};

export async function GET(_req: Request, ctx: Ctx) {
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

  const progress = await getFileProgress(file.id);

  return jsonOk({
    id: file.id,
    path: file.path,
    sourceRevision: file.sourceRevision,
    updatedAt: file.updatedAt,
    progress,
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const { orgSlug, projectSlug, fileId } = await ctx.params;

  const access = await requireProjectAccess(orgSlug, projectSlug, session.userId!, "manager");
  if ("error" in access) {
    if (access.error === "not_found") return notFound();
    return forbidden();
  }
  if (!canUploadFiles(access.role)) return forbidden();

  const [file] = await db
    .select()
    .from(sourceFiles)
    .where(and(eq(sourceFiles.id, fileId), eq(sourceFiles.projectId, access.project.id)))
    .limit(1);

  if (!file) return notFound("文件不存在");

  await db.delete(sourceFiles).where(eq(sourceFiles.id, file.id));
  return jsonOk({ ok: true });
}
