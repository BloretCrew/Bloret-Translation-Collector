import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { requireProjectAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { projectLanguages, sourceFiles } from "@/lib/db/schema";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { TranslationEditor } from "@/components/editor/TranslationEditor";
import { canEditTranslations } from "@/lib/permissions/roles";

type Props = {
  params: Promise<{ org: string; project: string }>;
  searchParams: Promise<{ file?: string; locale?: string }>;
};

export default async function TranslatePage({ params, searchParams }: Props) {
  const session = await requireSession();
  if (!session) redirect("/auth/login");
  const { org: orgSlug, project: projectSlug } = await params;
  const sp = await searchParams;

  const access = await requireProjectAccess(orgSlug, projectSlug, session.userId!);
  if ("error" in access) {
    if (access.error === "not_found") notFound();
    redirect("/app");
  }

  const files = await db
    .select({ id: sourceFiles.id, path: sourceFiles.path })
    .from(sourceFiles)
    .where(eq(sourceFiles.projectId, access.project.id));

  const langs = await db
    .select()
    .from(projectLanguages)
    .where(eq(projectLanguages.projectId, access.project.id));
  const locales = langs.filter((l) => l.enabled).map((l) => l.locale);

  if (files.length === 0 || locales.length === 0) {
    redirect(`/app/o/${orgSlug}/p/${projectSlug}`);
  }

  const fileId = sp.file && files.some((f) => f.id === sp.file) ? sp.file : files[0]!.id;
  const locale = sp.locale && locales.includes(sp.locale) ? sp.locale : locales[0]!;

  return (
    <div className="blora-stack blora-stack--lg">
      <Breadcrumbs
        items={[
          { label: "组织", href: "/app" },
          { label: access.org.name, href: `/app/o/${orgSlug}` },
          { label: access.project.name, href: `/app/o/${orgSlug}/p/${projectSlug}` },
          { label: "翻译" },
        ]}
      />
      <header className="app-page-header">
        <div className="app-page-header__copy">
          <h1 className="blora-h2">翻译工作台</h1>
          <p className="blora-text-muted u-mt-2">
            {access.project.name} · 源 {access.project.sourceLocale} → {locale}
          </p>
        </div>
      </header>
      <TranslationEditor
        orgSlug={orgSlug}
        projectSlug={projectSlug}
        fileId={fileId}
        locale={locale}
        canEdit={canEditTranslations(access.role)}
        files={files}
        locales={locales}
      />
    </div>
  );
}
