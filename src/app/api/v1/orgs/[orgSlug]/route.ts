import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { requireOrgAccess } from "@/lib/access";
import { forbidden, jsonError, jsonOk, notFound, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { updateOrgSchema } from "@/lib/validators/common";
import { canManageOrg } from "@/lib/permissions/roles";

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

  return jsonOk({
    id: access.org.id,
    slug: access.org.slug,
    name: access.org.name,
    description: access.org.description,
    role: access.role,
    createdAt: access.org.createdAt,
  });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const { orgSlug } = await ctx.params;

  const access = await requireOrgAccess(orgSlug, session.userId!);
  if ("error" in access) {
    if (access.error === "not_found") return notFound("组织不存在");
    return forbidden();
  }
  if (!canManageOrg(access.role)) return forbidden("仅所有者可修改组织");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("无效的 JSON");
  }
  const parsed = updateOrgSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.errors[0]?.message ?? "参数错误");

  const [updated] = await db
    .update(organizations)
    .set({
      ...("name" in parsed.data ? { name: parsed.data.name } : {}),
      ...("description" in parsed.data ? { description: parsed.data.description ?? null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, access.org.id))
    .returning();

  return jsonOk(updated);
}
