import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { requireProjectAccess } from "@/lib/access";
import { forbidden, jsonError, jsonOk, notFound, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { projectLanguages, projects } from "@/lib/db/schema";
import { updateProjectSchema } from "@/lib/validators/common";
import { canManageProjects } from "@/lib/permissions/roles";

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

  const langs = await db
    .select()
    .from(projectLanguages)
    .where(eq(projectLanguages.projectId, access.project.id));

  return jsonOk({
    id: access.project.id,
    slug: access.project.slug,
    name: access.project.name,
    description: access.project.description,
    sourceLocale: access.project.sourceLocale,
    visibility: access.project.visibility,
    targetLocales: langs.filter((l) => l.enabled).map((l) => l.locale),
    role: access.role,
    org: { slug: access.org.slug, name: access.org.name },
  });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const { orgSlug, projectSlug } = await ctx.params;

  const access = await requireProjectAccess(orgSlug, projectSlug, session.userId!, "manager");
  if ("error" in access) {
    if (access.error === "not_found") return notFound();
    return forbidden();
  }
  if (!canManageProjects(access.role)) return forbidden();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("无效的 JSON");
  }
  const parsed = updateProjectSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.errors[0]?.message ?? "参数错误");

  const [updated] = await db
    .update(projects)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description ?? null }
        : {}),
      ...(parsed.data.sourceLocale !== undefined ? { sourceLocale: parsed.data.sourceLocale } : {}),
      ...(parsed.data.visibility !== undefined ? { visibility: parsed.data.visibility } : {}),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, access.project.id))
    .returning();

  return jsonOk(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const { orgSlug, projectSlug } = await ctx.params;

  const access = await requireProjectAccess(orgSlug, projectSlug, session.userId!, "manager");
  if ("error" in access) {
    if (access.error === "not_found") return notFound();
    return forbidden();
  }
  if (!canManageProjects(access.role)) return forbidden();

  await db
    .delete(projects)
    .where(and(eq(projects.id, access.project.id), eq(projects.orgId, access.org.id)));

  return jsonOk({ ok: true });
}
