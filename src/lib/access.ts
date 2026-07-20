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
  if (!("error" in access)) {
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.orgId, access.org.id), eq(projects.slug, projectSlug)))
      .limit(1);
    if (!project) {
      return {
        error: "not_found" as const,
        org: access.org,
        membership: access.membership,
        role: access.role,
      };
    }
    const effectiveRole =
      project.visibility === "public" && !roleAtLeast(access.role, "translator")
        ? ("translator" as const)
        : access.role;
    return {
      org: access.org,
      project,
      membership: access.membership,
      role: effectiveRole,
    };
  }

  if (access.error === "not_found" || !access.org) return access;

  // Public projects accept any authenticated user as a translator. This is
  // intentionally limited to viewer/translator access; management and review
  // rights still require real organization membership.
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.orgId, access.org.id), eq(projects.slug, projectSlug)))
    .limit(1);
  if (!project) {
    return { error: "not_found" as const, org: access.org };
  }
  if (project.visibility !== "public" || !roleAtLeast("translator", minRole)) {
    return { error: "forbidden" as const, org: access.org };
  }

  return {
    org: access.org,
    project,
    membership: null,
    role: "translator" as const,
  };
}
