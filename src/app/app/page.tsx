import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { organizationMembers, organizations, projects } from "@/lib/db/schema";
import { ROLE_LABELS } from "@/lib/permissions/roles";

export default async function AppHomePage() {
  const session = await requireSession();
  if (!session) redirect("/auth/login");

  const orgs = await db
    .select({
      id: organizations.id,
      slug: organizations.slug,
      name: organizations.name,
      description: organizations.description,
      role: organizationMembers.role,
      projectCount: sql<number>`(
        select count(*)::int from ${projects} p where p.org_id = ${organizations.id}
      )`,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.orgId, organizations.id))
    .where(eq(organizationMembers.userId, session.userId!))
    .orderBy(desc(organizations.createdAt));

  return (
    <div className="blora-stack blora-stack--lg">
      <header className="app-page-header">
        <div className="app-page-header__copy">
          <h1 className="blora-h2">我的组织</h1>
          <p className="blora-text-muted u-mt-2">选择组织以管理项目与翻译</p>
        </div>
        <div className="app-page-header__actions">
          <Link className="blora-btn blora-btn--primary" href="/app/orgs/new">
            新建组织
          </Link>
        </div>
      </header>

      {orgs.length === 0 ? (
        <div className="blora-empty">
          <div className="blora-empty__title">还没有组织</div>
          <div className="blora-empty__desc">创建一个组织，开始收集翻译</div>
          <div className="app-empty-actions">
            <Link className="blora-btn blora-btn--primary" href="/app/orgs/new">
              创建第一个组织
            </Link>
          </div>
        </div>
      ) : (
        <div className="blora-grid blora-grid--3">
          {orgs.map((org) => (
            <Link
              key={org.id}
              href={`/app/o/${org.slug}`}
              className="blora-card blora-card--hover"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <h3 className="blora-card__title">{org.name}</h3>
              <p className="blora-card__body blora-text-muted">
                {org.description || "暂无简介"}
              </p>
              <div className="blora-card__foot blora-row blora-row--between">
                <span className="blora-badge blora-badge--pill">{ROLE_LABELS[org.role]}</span>
                <span className="blora-text-faint blora-text-mono u-text-xs">
                  {org.projectCount} 项目
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
