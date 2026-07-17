import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { requireProjectAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { projectLanguages, sourceFiles } from "@/lib/db/schema";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { DeleteFileButton } from "@/components/project/FileActions";
import { getFileProgress } from "@/lib/services/files";
import { canUploadFiles, canEditTranslations, canExport } from "@/lib/permissions/roles";

type Props = {
  params: Promise<{ org: string; project: string; fileId: string }>;
};

export default async function FileDetailPage({ params }: Props) {
  const session = await requireSession();
  if (!session) redirect("/auth/login");
  const { org: orgSlug, project: projectSlug, fileId } = await params;

  const access = await requireProjectAccess(orgSlug, projectSlug, session.userId!);
  if ("error" in access) {
    if (access.error === "not_found") notFound();
    redirect("/app");
  }

  const [file] = await db
    .select()
    .from(sourceFiles)
    .where(and(eq(sourceFiles.id, fileId), eq(sourceFiles.projectId, access.project.id)))
    .limit(1);
  if (!file) notFound();

  const langs = await db
    .select()
    .from(projectLanguages)
    .where(eq(projectLanguages.projectId, access.project.id));
  const targetLocales = langs.filter((l) => l.enabled).map((l) => l.locale);

  const progress = await getFileProgress(file.id);
  const progressMap = new Map(progress.byLocale.map((p) => [p.locale, p]));

  return (
    <div className="blora-stack blora-stack--lg">
      <Breadcrumbs
        items={[
          { label: "组织", href: "/app" },
          { label: access.org.name, href: `/app/o/${orgSlug}` },
          { label: access.project.name, href: `/app/o/${orgSlug}/p/${projectSlug}` },
          { label: file.path },
        ]}
      />

      <div className="blora-row blora-row--between">
        <div>
          <h1 className="blora-h2 blora-text-mono" style={{ fontSize: "1.5rem" }}>
            {file.path}
          </h1>
          <p className="blora-text-muted">
            版本 r{file.sourceRevision} · {progress.totalStrings} 条字符串 · 更新于{" "}
            {file.updatedAt.toLocaleString("zh-CN")}
          </p>
        </div>
        <div className="blora-row">
          {targetLocales[0] && canEditTranslations(access.role) && (
            <Link
              className="blora-btn blora-btn--primary"
              href={`/app/o/${orgSlug}/p/${projectSlug}/translate?file=${file.id}&locale=${targetLocales[0]}`}
            >
              打开编辑器
            </Link>
          )}
          {canUploadFiles(access.role) && (
            <DeleteFileButton
              orgSlug={orgSlug}
              projectSlug={projectSlug}
              fileId={file.id}
              path={file.path}
            />
          )}
        </div>
      </div>

      <section className="blora-stack">
        <h2 className="blora-h3">按语言进度</h2>
        {targetLocales.length === 0 ? (
          <p className="blora-text-muted">项目尚未配置目标语言</p>
        ) : (
          <div className="progress-list">
            {targetLocales.map((locale) => {
              const p = progressMap.get(locale);
              const translated = p?.translated ?? 0;
              const total = progress.totalStrings;
              const percent = total === 0 ? 0 : Math.round((translated / total) * 100);
              return (
                <div key={locale} className="blora-card">
                  <div className="blora-row blora-row--between" style={{ marginBottom: 8 }}>
                    <strong>{locale}</strong>
                    <span className="blora-text-mono blora-text-faint" style={{ fontSize: 12 }}>
                      {translated}/{total} ({percent}%)
                    </span>
                  </div>
                  <div className="blora-progress" data-value={percent}>
                    <div className="blora-progress__bar">
                      <div className="blora-progress__fill" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                  <div className="blora-row" style={{ marginTop: 12 }}>
                    {canEditTranslations(access.role) && (
                      <Link
                        className="blora-btn blora-btn--ghost blora-btn--xs"
                        href={`/app/o/${orgSlug}/p/${projectSlug}/translate?file=${file.id}&locale=${locale}`}
                      >
                        翻译
                      </Link>
                    )}
                    {canExport(access.role) && (
                      <a
                        className="blora-btn blora-btn--ghost blora-btn--xs"
                        href={`/api/v1/orgs/${orgSlug}/projects/${projectSlug}/export?locale=${locale}&fileId=${file.id}`}
                      >
                        导出
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
