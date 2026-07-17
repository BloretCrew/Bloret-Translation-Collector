import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { requireOrgAccess } from "@/lib/access";
import { forbidden, jsonCreated, jsonError, jsonOk, notFound, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { organizationMembers, users } from "@/lib/db/schema";
import { addMemberSchema } from "@/lib/validators/common";
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

  const members = await db
    .select({
      id: organizationMembers.id,
      userId: users.id,
      username: users.username,
      avatarUrl: users.avatarUrl,
      role: organizationMembers.role,
      createdAt: organizationMembers.createdAt,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(organizationMembers.userId, users.id))
    .where(eq(organizationMembers.orgId, access.org.id));

  return jsonOk({ members });
}

export async function POST(request: Request, ctx: Ctx) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const { orgSlug } = await ctx.params;

  const access = await requireOrgAccess(orgSlug, session.userId!);
  if ("error" in access) {
    if (access.error === "not_found") return notFound("组织不存在");
    return forbidden();
  }
  if (!canManageOrg(access.role) && access.role !== "manager") {
    // owners manage; also allow managers to add translators/viewers only — plan says Owner for members
    // Stick to plan: only owner
  }
  if (!canManageOrg(access.role)) return forbidden("仅所有者可管理成员");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("无效的 JSON");
  }
  const parsed = addMemberSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.errors[0]?.message ?? "参数错误");

  const { username, role } = parsed.data;

  let [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!user) {
    // Placeholder user — binds on first login with same username
    [user] = await db.insert(users).values({ username }).returning();
  }

  try {
    const [member] = await db
      .insert(organizationMembers)
      .values({
        orgId: access.org.id,
        userId: user!.id,
        role,
      })
      .returning();

    return jsonCreated({
      id: member!.id,
      userId: user!.id,
      username: user!.username,
      avatarUrl: user!.avatarUrl,
      role: member!.role,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return jsonError("该用户已是成员", 409);
    }
    throw e;
  }
}
