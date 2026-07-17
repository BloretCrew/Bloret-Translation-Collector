import { desc, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { jsonCreated, jsonError, jsonOk, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { organizationMembers, organizations, projects } from "@/lib/db/schema";
import { createOrgSchema } from "@/lib/validators/common";
import { sql } from "drizzle-orm";

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();

  const rows = await db
    .select({
      id: organizations.id,
      slug: organizations.slug,
      name: organizations.name,
      description: organizations.description,
      role: organizationMembers.role,
      createdAt: organizations.createdAt,
      projectCount: sql<number>`(
        select count(*)::int from ${projects} p where p.org_id = ${organizations.id}
      )`,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.orgId, organizations.id))
    .where(eq(organizationMembers.userId, session.userId!))
    .orderBy(desc(organizations.createdAt));

  return jsonOk({ orgs: rows });
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("无效的 JSON");
  }

  const parsed = createOrgSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.errors[0]?.message ?? "参数错误");
  }

  const { name, slug, description } = parsed.data;

  try {
    const org = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(organizations)
        .values({
          name,
          slug,
          description: description ?? null,
          createdBy: session.userId!,
        })
        .returning();

      await tx.insert(organizationMembers).values({
        orgId: created!.id,
        userId: session.userId!,
        role: "owner",
      });

      return created!;
    });

    return jsonCreated({
      id: org.id,
      slug: org.slug,
      name: org.name,
      description: org.description,
      role: "owner" as const,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return jsonError("组织 slug 已存在", 409);
    }
    console.error(e);
    return jsonError("创建失败", 500);
  }
}
