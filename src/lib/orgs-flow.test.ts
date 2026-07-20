/**
 * Regression: create org (+ membership) then list for that user must show it.
 * Hits real Postgres via config.json + shipped schema/transaction shape.
 */
import { afterAll, describe, expect, it } from "vitest";
import { desc, eq, sql } from "drizzle-orm";
import { applyConfigToProcessEnv } from "./config";
import { db } from "./db";
import { organizationMembers, organizations, projectLanguages, projects, users } from "./db/schema";
import { slugify } from "./slug";
import { createOrgSchema, createProjectSchema } from "./validators/common";
import { requireOrgAccess, requireProjectAccess } from "./access";

applyConfigToProcessEnv();

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];

afterAll(async () => {
  for (const id of cleanupOrgIds) {
    await db.delete(organizations).where(eq(organizations.id, id));
  }
  for (const id of cleanupUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

async function listOrgsForUser(userId: string) {
  return db
    .select({
      id: organizations.id,
      slug: organizations.slug,
      name: organizations.name,
      role: organizationMembers.role,
      projectCount: sql<number>`(
        select count(*)::int from projects p where p.org_id = ${organizations.id}
      )`,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.orgId, organizations.id))
    .where(eq(organizationMembers.userId, userId))
    .orderBy(desc(organizations.createdAt));
}

describe("create org → membership-scoped list", () => {
  it("creates org with owner membership and lists it for the creator", async () => {
    const username = `flow-${Date.now().toString(36)}`;
    const [user] = await db
      .insert(users)
      .values({ username, avatarUrl: null, lastLoginAt: new Date() })
      .returning();
    cleanupUserIds.push(user!.id);

    const name = "Flow Test Org";
    const slug = slugify(name, "org") + "-" + Date.now().toString(36).slice(-4);
    const parsed = createOrgSchema.safeParse({ name, slug, description: "from test" });
    expect(parsed.success).toBe(true);

    const org = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(organizations)
        .values({
          name: parsed.data!.name,
          slug: parsed.data!.slug,
          description: parsed.data!.description ?? null,
          createdBy: user!.id,
        })
        .returning();
      await tx.insert(organizationMembers).values({
        orgId: created!.id,
        userId: user!.id,
        role: "owner",
      });
      return created!;
    });
    cleanupOrgIds.push(org.id);

    const listed = await listOrgsForUser(user!.id);
    const found = listed.find((o) => o.slug === org.slug);
    expect(found).toBeTruthy();
    expect(found!.name).toBe(name);
    expect(found!.role).toBe("owner");
    expect(Number(found!.projectCount)).toBe(0);
  });

  it("auto-slugifies non-Latin names for createOrgSchema path", () => {
    const slug = slugify("布络特工作室", "org");
    const parsed = createOrgSchema.safeParse({
      name: "布络特工作室",
      slug,
      description: null,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data!.slug).toMatch(/^org-/);
  });

  it("creates project under org and lists it for the org owner", async () => {
    const username = `flow-p-${Date.now().toString(36)}`;
    const [user] = await db
      .insert(users)
      .values({ username })
      .returning();
    cleanupUserIds.push(user!.id);

    const orgSlug = `org-${Date.now().toString(36)}`;
    const org = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(organizations)
        .values({ name: "P Org", slug: orgSlug, createdBy: user!.id })
        .returning();
      await tx.insert(organizationMembers).values({
        orgId: created!.id,
        userId: user!.id,
        role: "owner",
      });
      return created!;
    });
    cleanupOrgIds.push(org.id);

    const projectBody = createProjectSchema.parse({
      name: "Sample App",
      slug: `app-${Date.now().toString(36).slice(-5)}`,
      sourceLocale: "zh-CN",
      targetLocales: ["en"],
      visibility: "org",
    });

    const project = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(projects)
        .values({
          orgId: org.id,
          slug: projectBody.slug,
          name: projectBody.name,
          sourceLocale: projectBody.sourceLocale,
          visibility: projectBody.visibility,
          createdBy: user!.id,
        })
        .returning();
      await tx.insert(projectLanguages).values(
        projectBody.targetLocales.map((locale) => ({
          projectId: created!.id,
          locale,
          enabled: true,
        })),
      );
      return created!;
    });

    const list = await db
      .select()
      .from(projects)
      .where(eq(projects.orgId, org.id));
    expect(list.some((p) => p.id === project.id)).toBe(true);

    const listedOrgs = await listOrgsForUser(user!.id);
    const row = listedOrgs.find((o) => o.id === org.id);
    expect(row).toBeTruthy();
    expect(Number(row!.projectCount)).toBeGreaterThanOrEqual(1);
  });

  it("allows a logged-in non-member to access a public project as translator", async () => {
    const stamp = Date.now().toString(36);
    const [owner] = await db
      .insert(users)
      .values({ username: `public-owner-${stamp}` })
      .returning();
    const [visitor] = await db
      .insert(users)
      .values({ username: `public-visitor-${stamp}` })
      .returning();
    cleanupUserIds.push(owner!.id, visitor!.id);

    const [org] = await db
      .insert(organizations)
      .values({ name: "Public Org", slug: `public-org-${stamp}`, createdBy: owner!.id })
      .returning();
    cleanupOrgIds.push(org!.id);
    await db.insert(organizationMembers).values({
      orgId: org!.id,
      userId: owner!.id,
      role: "owner",
    });

    const [project] = await db
      .insert(projects)
      .values({
        orgId: org!.id,
        slug: `public-p-${stamp}`,
        name: "Public Project",
        sourceLocale: "zh-CN",
        visibility: "public",
        createdBy: owner!.id,
      })
      .returning();

    const access = await requireProjectAccess(
      org!.slug,
      project!.slug,
      visitor!.id,
      "translator",
    );
    expect("error" in access).toBe(false);
    if (!("error" in access)) {
      expect(access.project.id).toBe(project!.id);
      expect(access.role).toBe("translator");
      expect(access.membership).toBeNull();
    }

    const managerAccess = await requireProjectAccess(
      org!.slug,
      project!.slug,
      visitor!.id,
      "manager",
    );
    expect("error" in managerAccess).toBe(true);
  });

  it("allows a logged-in non-member to view a public org as viewer", async () => {
    const stamp = Date.now().toString(36);
    const [owner] = await db
      .insert(users)
      .values({ username: `pub-org-owner-${stamp}` })
      .returning();
    const [visitor] = await db
      .insert(users)
      .values({ username: `pub-org-visitor-${stamp}` })
      .returning();
    cleanupUserIds.push(owner!.id, visitor!.id);

    const [org] = await db
      .insert(organizations)
      .values({
        name: "Visible Org",
        slug: `visible-org-${stamp}`,
        createdBy: owner!.id,
        visibility: "public",
      })
      .returning();
    cleanupOrgIds.push(org!.id);
    await db.insert(organizationMembers).values({
      orgId: org!.id,
      userId: owner!.id,
      role: "owner",
    });

    const [hidden] = await db
      .insert(projects)
      .values({
        orgId: org!.id,
        slug: `hidden-${stamp}`,
        name: "Org-only Project",
        sourceLocale: "en",
        visibility: "org",
        createdBy: owner!.id,
      })
      .returning();
    const [open] = await db
      .insert(projects)
      .values({
        orgId: org!.id,
        slug: `open-${stamp}`,
        name: "Open Project",
        sourceLocale: "en",
        visibility: "public",
        createdBy: owner!.id,
      })
      .returning();

    const orgAccess = await requireOrgAccess(org!.slug, visitor!.id, "viewer");
    expect("error" in orgAccess).toBe(false);
    if (!("error" in orgAccess)) {
      expect(orgAccess.role).toBe("viewer");
      expect(orgAccess.membership).toBeNull();
    }

    const managerDenied = await requireOrgAccess(org!.slug, visitor!.id, "manager");
    expect("error" in managerDenied).toBe(true);

    const openAccess = await requireProjectAccess(org!.slug, open!.slug, visitor!.id);
    expect("error" in openAccess).toBe(false);
    if (!("error" in openAccess)) {
      expect(openAccess.role).toBe("translator");
    }

    const hiddenAccess = await requireProjectAccess(org!.slug, hidden!.slug, visitor!.id);
    expect("error" in hiddenAccess).toBe(true);
  });

  it("denies non-members for private orgs without public projects", async () => {
    const stamp = Date.now().toString(36);
    const [owner] = await db
      .insert(users)
      .values({ username: `priv-org-owner-${stamp}` })
      .returning();
    const [visitor] = await db
      .insert(users)
      .values({ username: `priv-org-visitor-${stamp}` })
      .returning();
    cleanupUserIds.push(owner!.id, visitor!.id);

    const [org] = await db
      .insert(organizations)
      .values({
        name: "Private Org",
        slug: `private-org-${stamp}`,
        createdBy: owner!.id,
        visibility: "private",
      })
      .returning();
    cleanupOrgIds.push(org!.id);

    const denied = await requireOrgAccess(org!.slug, visitor!.id, "viewer");
    expect("error" in denied).toBe(true);
  });
});
