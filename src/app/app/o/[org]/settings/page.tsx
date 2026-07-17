import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { requireOrgAccess } from "@/lib/access";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { OrgSettingsForm } from "@/components/org/OrgSettingsForm";
import { canManageOrg } from "@/lib/permissions/roles";

type Props = { params: Promise<{ org: string }> };

export default async function OrgSettingsPage({ params }: Props) {
  const session = await requireSession();
  if (!session) redirect("/auth/login");
  const { org: orgSlug } = await params;

  const access = await requireOrgAccess(orgSlug, session.userId!);
  if ("error" in access) {
    if (access.error === "not_found") notFound();
    redirect("/app");
  }
  if (!canManageOrg(access.role)) {
    redirect(`/app/o/${orgSlug}`);
  }

  return (
    <div className="app-narrow blora-stack blora-stack--lg">
      <Breadcrumbs
        items={[
          { label: "组织", href: "/app" },
          { label: access.org.name, href: `/app/o/${orgSlug}` },
          { label: "设置" },
        ]}
      />
      <div className="blora-row blora-row--between">
        <h1 className="blora-h2">组织设置</h1>
        <Link className="blora-btn blora-btn--ghost" href={`/app/o/${orgSlug}`}>
          返回组织
        </Link>
      </div>
      <div className="blora-panel">
        <OrgSettingsForm
          orgSlug={orgSlug}
          initialName={access.org.name}
          initialDescription={access.org.description}
        />
      </div>
    </div>
  );
}
