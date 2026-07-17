import { desc, eq, inArray } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { requireOrgAccess } from "@/lib/access";
import { forbidden, jsonCreated, jsonError, jsonOk, notFound, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { projectLanguages, projects } from "@/lib/db/schema";
import { createProjectSchema } from "@/lib/validators/common";
import { canManageProjects } from "@/lib/permissions/roles";

type Ctx = { params: Promise<{ orgSlug: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const { orgSlug } = await ctx.params;

  const access = await requireOrgAccess(orgSlug, session.userId!);
  if ("error" in access) {
    if (access.error === "not_found") return notFound("组织不存在");
    return forbidden();
  }

  const list = await db
    .select()
    .from(projects)
    .where(eq(projects.orgId, access.org.id))
    .orderBy(desc(projects.updatedAt));

  const projectIds = list.map((p) => p.id);
  const allLangs =
    projectIds.length === 0
      ? []
      : await db
          .select()
          .from(projectLanguages)
          .where(inArray(projectLanguages.projectId, projectIds));

  const langMap = new Map<string, string[]>();
  for (const l of allLangs) {
    if (!l.enabled) continue;
    const arr = langMap.get(l.projectId) ?? [];
    arr.push(l.locale);
    langMap.set(l.projectId, arr);
  }

  return jsonOk({
    projects: list.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      sourceLocale: p.sourceLocale,
      visibility: p.visibility,
      targetLocales: langMap.get(p.id) ?? [],
      updatedAt: p.updatedAt,
    })),
  });
}

export async function POST(request: Request, ctx: Ctx) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const { orgSlug } = await ctx.params;

  const access = await requireOrgAccess(orgSlug, session.userId!, "manager");
  if ("error" in access) {
    if (access.error === "not_found") return notFound("组织不存在");
    return forbidden();
  }
  if (!canManageProjects(access.role)) return forbidden();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("无效的 JSON");
  }
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.errors[0]?.message ?? "参数错误");

  const data = parsed.data;

  try {
    const project = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(projects)
        .values({
          orgId: access.org.id,
          slug: data.slug,
          name: data.name,
          description: data.description ?? null,
          sourceLocale: data.sourceLocale,
          visibility: data.visibility,
          createdBy: session.userId!,
        })
        .returning();

      if (data.targetLocales.length) {
        await tx.insert(projectLanguages).values(
          data.targetLocales.map((locale) => ({
            projectId: created!.id,
            locale,
            enabled: true,
          })),
        );
      }

      return created!;
    });

    return jsonCreated({
      id: project.id,
      slug: project.slug,
      name: project.name,
      sourceLocale: project.sourceLocale,
      targetLocales: data.targetLocales,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return jsonError("项目 slug 已存在", 409);
    }
    console.error(e);
    return jsonError("创建失败", 500);
  }
}
