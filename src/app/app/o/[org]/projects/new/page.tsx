import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { requireOrgAccess } from "@/lib/access";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { CreateProjectForm } from "@/components/project/CreateProjectForm";
import { canManageProjects } from "@/lib/permissions/roles";

type Props = { params: Promise<{ org: string }> };

export default async function NewProjectPage({ params }: Props) {
  const session = await requireSession();
  if (!session) redirect("/auth/login");
  const { org: orgSlug } = await params;

  const access = await requireOrgAccess(orgSlug, session.userId!, "manager");
  if ("error" in access) {
    if (access.error === "not_found") notFound();
    redirect(`/app/o/${orgSlug}`);
  }
  if (!canManageProjects(access.role)) redirect(`/app/o/${orgSlug}`);

  return (
    <div className="app-narrow blora-stack blora-stack--lg">
      <Breadcrumbs
        items={[
          { label: "组织", href: "/app" },
          { label: access.org.name, href: `/app/o/${orgSlug}` },
          { label: "新建项目" },
        ]}
      />
      <h1 className="blora-h2">新建项目</h1>
      <div className="blora-panel">
        <CreateProjectForm orgSlug={orgSlug} />
      </div>
    </div>
  );
}
