import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { requireOrgAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { organizationMembers, projectLanguages, projects, users } from "@/lib/db/schema";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { AddMemberForm } from "@/components/org/AddMemberForm";
import { MemberList } from "@/components/org/MemberList";
import { ROLE_LABELS, canManageOrg, canManageProjects } from "@/lib/permissions/roles";

type Props = { params: Promise<{ org: string }> };

export default async function OrgPage({ params }: Props) {
  const session = await requireSession();
  if (!session) redirect("/auth/login");
  const { org: orgSlug } = await params;

  const access = await requireOrgAccess(orgSlug, session.userId!);
  if ("error" in access) {
    if (access.error === "not_found") notFound();
    redirect("/app");
  }

  const projectList = await db
    .select()
    .from(projects)
    .where(eq(projects.orgId, access.org.id))
    .orderBy(desc(projects.updatedAt));

  const projectIds = projectList.map((p) => p.id);
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

  const members = await db
    .select({
      userId: users.id,
      username: users.username,
      avatarUrl: users.avatarUrl,
      role: organizationMembers.role,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(organizationMembers.userId, users.id))
    .where(eq(organizationMembers.orgId, access.org.id));

  return (
    <div className="blora-stack blora-stack--lg">
      <Breadcrumbs
        items={[
          { label: "组织", href: "/app" },
          { label: access.org.name },
        ]}
      />
      <div className="blora-row blora-row--between">
        <div>
          <h1 className="blora-h2">{access.org.name}</h1>
          <p className="blora-text-muted">{access.org.description || "暂无简介"}</p>
        </div>
        <div className="blora-row">
          <span className="blora-badge blora-badge--pill">{ROLE_LABELS[access.role]}</span>
          {canManageOrg(access.role) && (
            <Link className="blora-btn blora-btn--outline" href={`/app/o/${orgSlug}/settings`}>
              组织设置
            </Link>
          )}
          {canManageProjects(access.role) && (
            <Link
              className="blora-btn blora-btn--primary"
              href={`/app/o/${orgSlug}/projects/new`}
            >
              新建项目
            </Link>
          )}
        </div>
      </div>

      <section className="blora-stack">
        <h2 className="blora-h3">项目</h2>
        {projectList.length === 0 ? (
          <div className="blora-empty">
            <div className="blora-empty__title">尚无项目</div>
            {canManageProjects(access.role) && (
              <Link
                className="blora-btn blora-btn--primary"
                href={`/app/o/${orgSlug}/projects/new`}
                style={{ marginTop: 12 }}
              >
                创建项目
              </Link>
            )}
          </div>
        ) : (
          <div className="blora-table-wrap">
            <table className="blora-table blora-table--striped">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>源语言</th>
                  <th>目标语言</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {projectList.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/app/o/${orgSlug}/p/${p.slug}`}>{p.name}</Link>
                      <div className="blora-text-faint blora-text-mono" style={{ fontSize: 12 }}>
                        {p.slug}
                      </div>
                    </td>
                    <td>
                      <span className="blora-badge">{p.sourceLocale}</span>
                    </td>
                    <td>
                      {(langMap.get(p.id) ?? []).map((l) => (
                        <span key={l} className="blora-badge" style={{ marginRight: 4 }}>
                          {l}
                        </span>
                      ))}
                    </td>
                    <td>
                      <Link
                        className="blora-btn blora-btn--ghost blora-btn--xs"
                        href={`/app/o/${orgSlug}/p/${p.slug}`}
                      >
                        打开
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="blora-stack">
        <h2 className="blora-h3">成员</h2>
        <MemberList
          orgSlug={orgSlug}
          members={members}
          canManage={canManageOrg(access.role)}
          currentUserId={session.userId!}
        />
        {canManageOrg(access.role) && (
          <div className="blora-panel">
            <h3 className="blora-h4" style={{ marginBottom: 12 }}>
              添加成员
            </h3>
            <AddMemberForm orgSlug={orgSlug} />
          </div>
        )}
      </section>
    </div>
  );
}
