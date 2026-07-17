import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  organizationMembers,
  organizations,
  projects,
  type MemberRole,
} from "@/lib/db/schema";
import { roleAtLeast } from "@/lib/permissions/roles";

export async function getMembership(orgId: string, userId: string) {
  const [row] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.orgId, orgId), eq(organizationMembers.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function requireOrgAccess(
  orgSlug: string,
  userId: string,
  minRole: MemberRole = "viewer",
) {
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, orgSlug))
    .limit(1);
  if (!org) return { error: "not_found" as const };

  const membership = await getMembership(org.id, userId);
  if (!membership) return { error: "forbidden" as const, org };
  if (!roleAtLeast(membership.role, minRole)) {
    return { error: "forbidden" as const, org, membership };
  }
  return { org, membership, role: membership.role };
}

export async function requireProjectAccess(
  orgSlug: string,
  projectSlug: string,
  userId: string,
  minRole: MemberRole = "viewer",
) {
  const access = await requireOrgAccess(orgSlug, userId, minRole);
  if ("error" in access && access.error) {
    return access;
  }
  const { org, membership, role } = access as {
    org: typeof organizations.$inferSelect;
    membership: typeof organizationMembers.$inferSelect;
    role: MemberRole;
  };

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.orgId, org.id), eq(projects.slug, projectSlug)))
    .limit(1);
  if (!project) return { error: "not_found" as const, org, membership, role };

  return { org, project, membership, role };
}
