import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { requireProjectAccess } from "@/lib/access";
import { forbidden, jsonError, jsonOk, notFound, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { projectLanguages } from "@/lib/db/schema";
import { setLanguagesSchema } from "@/lib/validators/common";
import { canManageProjects } from "@/lib/permissions/roles";

type Ctx = { params: Promise<{ orgSlug: string; projectSlug: string }> };

export async function PUT(request: Request, ctx: Ctx) {
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
  const parsed = setLanguagesSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.errors[0]?.message ?? "参数错误");

  const locales = [...new Set(parsed.data.locales)];

  await db.transaction(async (tx) => {
    await tx.delete(projectLanguages).where(eq(projectLanguages.projectId, access.project.id));
    if (locales.length) {
      await tx.insert(projectLanguages).values(
        locales.map((locale) => ({
          projectId: access.project.id,
          locale,
          enabled: true,
        })),
      );
    }
  });

  return jsonOk({ locales });
}
