import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { requireOrgAccess } from "@/lib/access";
import { forbidden, jsonError, jsonOk, notFound, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { organizationMembers } from "@/lib/db/schema";
import { updateMemberSchema } from "@/lib/validators/common";
import { canManageOrg } from "@/lib/permissions/roles";

type Ctx = { params: Promise<{ orgSlug: string; userId: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const { orgSlug, userId } = await ctx.params;

  const access = await requireOrgAccess(orgSlug, session.userId!);
  if ("error" in access) {
    if (access.error === "not_found") return notFound("组织不存在");
    return forbidden();
  }
  if (!canManageOrg(access.role)) return forbidden("仅所有者可修改角色");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("无效的 JSON");
  }
  const parsed = updateMemberSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.errors[0]?.message ?? "参数错误");

  const [target] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.orgId, access.org.id), eq(organizationMembers.userId, userId)))
    .limit(1);

  if (!target) return notFound("成员不存在");
  if (target.role === "owner") return jsonError("不能修改所有者角色");

  const [updated] = await db
    .update(organizationMembers)
    .set({ role: parsed.data.role })
    .where(eq(organizationMembers.id, target.id))
    .returning();

  return jsonOk(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const { orgSlug, userId } = await ctx.params;

  const access = await requireOrgAccess(orgSlug, session.userId!);
  if ("error" in access) {
    if (access.error === "not_found") return notFound("组织不存在");
    return forbidden();
  }
  if (!canManageOrg(access.role)) return forbidden("仅所有者可移除成员");

  const [target] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.orgId, access.org.id), eq(organizationMembers.userId, userId)))
    .limit(1);

  if (!target) return notFound("成员不存在");
  if (target.role === "owner") return jsonError("不能移除所有者");

  await db.delete(organizationMembers).where(eq(organizationMembers.id, target.id));
  return jsonOk({ ok: true });
}
