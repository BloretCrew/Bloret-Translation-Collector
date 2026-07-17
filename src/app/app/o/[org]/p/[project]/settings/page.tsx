import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { requireProjectAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { projectLanguages } from "@/lib/db/schema";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { ProjectSettingsForm } from "@/components/project/ProjectSettingsForm";
import { canManageProjects } from "@/lib/permissions/roles";

type Props = { params: Promise<{ org: string; project: string }> };

export default async function ProjectSettingsPage({ params }: Props) {
  const session = await requireSession();
  if (!session) redirect("/auth/login");
  const { org: orgSlug, project: projectSlug } = await params;

  const access = await requireProjectAccess(orgSlug, projectSlug, session.userId!, "manager");
  if ("error" in access) {
    if (access.error === "not_found") notFound();
    redirect(`/app/o/${orgSlug}`);
  }
  if (!canManageProjects(access.role)) {
    redirect(`/app/o/${orgSlug}/p/${projectSlug}`);
  }

  const langs = await db
    .select()
    .from(projectLanguages)
    .where(eq(projectLanguages.projectId, access.project.id));

  return (
    <div className="app-narrow blora-stack blora-stack--lg">
      <Breadcrumbs
        items={[
          { label: "组织", href: "/app" },
          { label: access.org.name, href: `/app/o/${orgSlug}` },
          { label: access.project.name, href: `/app/o/${orgSlug}/p/${projectSlug}` },
          { label: "设置" },
        ]}
      />
      <header className="app-page-header">
        <div className="app-page-header__copy">
          <h1 className="blora-h2">项目设置</h1>
        </div>
        <div className="app-page-header__actions">
          <Link
            className="blora-btn blora-btn--ghost"
            href={`/app/o/${orgSlug}/p/${projectSlug}`}
          >
            返回项目
          </Link>
        </div>
      </header>
      <div className="blora-panel">
        <ProjectSettingsForm
          orgSlug={orgSlug}
          projectSlug={projectSlug}
          initial={{
            name: access.project.name,
            description: access.project.description,
            sourceLocale: access.project.sourceLocale,
            visibility: access.project.visibility,
            targetLocales: langs.filter((l) => l.enabled).map((l) => l.locale),
          }}
        />
      </div>
    </div>
  );
}
