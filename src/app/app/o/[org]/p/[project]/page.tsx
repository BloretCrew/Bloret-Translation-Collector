import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { requireProjectAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { projectLanguages, sourceFiles, stringUnits } from "@/lib/db/schema";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { UploadFileForm } from "@/components/project/UploadFileForm";
import { ExportMenu } from "@/components/project/ExportMenu";
import { canUploadFiles, canEditTranslations, canExport } from "@/lib/permissions/roles";
import { getProjectProgress } from "@/lib/services/files";

type Props = { params: Promise<{ org: string; project: string }> };

export default async function ProjectPage({ params }: Props) {
  const session = await requireSession();
  if (!session) redirect("/auth/login");
  const { org: orgSlug, project: projectSlug } = await params;

  const access = await requireProjectAccess(orgSlug, projectSlug, session.userId!);
  if ("error" in access) {
    if (access.error === "not_found") notFound();
    redirect("/app");
  }

  const langs = await db
    .select()
    .from(projectLanguages)
    .where(eq(projectLanguages.projectId, access.project.id));
  const targetLocales = langs.filter((l) => l.enabled).map((l) => l.locale);

  const files = await db
    .select({
      id: sourceFiles.id,
      path: sourceFiles.path,
      sourceRevision: sourceFiles.sourceRevision,
      updatedAt: sourceFiles.updatedAt,
      stringCount: sql<number>`(
        select count(*)::int from ${stringUnits} s
        where s.file_id = ${sourceFiles.id} and s.orphaned = false
      )`,
    })
    .from(sourceFiles)
    .where(eq(sourceFiles.projectId, access.project.id))
    .orderBy(desc(sourceFiles.updatedAt));

  const progress = await getProjectProgress(access.project.id);
  const progressMap = new Map(progress.byLocale.map((p) => [p.locale, p]));

  const defaultLocale = targetLocales[0];
  const defaultFile = files[0]?.id;

  return (
    <div className="blora-stack blora-stack--lg">
      <Breadcrumbs
        items={[
          { label: "组织", href: "/app" },
          { label: access.org.name, href: `/app/o/${orgSlug}` },
          { label: access.project.name },
        ]}
      />

      <div className="blora-row blora-row--between">
        <div>
          <h1 className="blora-h2">{access.project.name}</h1>
          <p className="blora-text-muted">
            源语言 <span className="blora-badge">{access.project.sourceLocale}</span>
            {" · "}
            {progress.totalStrings} 条字符串
          </p>
        </div>
        <div className="blora-row">
          {canUploadFiles(access.role) && (
            <Link
              className="blora-btn blora-btn--ghost"
              href={`/app/o/${orgSlug}/p/${projectSlug}/settings`}
            >
              项目设置
            </Link>
          )}
          {defaultFile && defaultLocale && canEditTranslations(access.role) && (
            <Link
              className="blora-btn blora-btn--primary"
              href={`/app/o/${orgSlug}/p/${projectSlug}/translate?file=${defaultFile}&locale=${defaultLocale}`}
            >
              开始翻译
            </Link>
          )}
          {canExport(access.role) && (
            <ExportMenu
              orgSlug={orgSlug}
              projectSlug={projectSlug}
              locales={targetLocales}
            />
          )}
        </div>
      </div>

      <section className="blora-stack">
        <h2 className="blora-h3">语言进度</h2>
        {targetLocales.length === 0 ? (
          <p className="blora-text-muted">尚未配置目标语言</p>
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
                      <div
                        className="blora-progress__fill"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                  <div className="blora-row" style={{ marginTop: 12 }}>
                    {defaultFile && (
                      <Link
                        className="blora-btn blora-btn--ghost blora-btn--xs"
                        href={`/app/o/${orgSlug}/p/${projectSlug}/translate?file=${defaultFile}&locale=${locale}`}
                      >
                        翻译
                      </Link>
                    )}
                    {canExport(access.role) && (
                      <a
                        className="blora-btn blora-btn--ghost blora-btn--xs"
                        href={`/api/v1/orgs/${orgSlug}/projects/${projectSlug}/export?locale=${locale}`}
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

      <section className="blora-stack">
        <h2 className="blora-h3">源文件</h2>
        {files.length === 0 ? (
          <div className="blora-empty">
            <div className="blora-empty__title">尚无源文件</div>
            <div className="blora-empty__desc">上传 JSON 以解析字符串</div>
          </div>
        ) : (
          <div className="blora-table-wrap">
            <table className="blora-table blora-table--striped">
              <thead>
                <tr>
                  <th>路径</th>
                  <th>字符串</th>
                  <th>版本</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id}>
                    <td className="blora-text-mono">
                      <Link href={`/app/o/${orgSlug}/p/${projectSlug}/files/${f.id}`}>
                        {f.path}
                      </Link>
                    </td>
                    <td>{f.stringCount}</td>
                    <td>r{f.sourceRevision}</td>
                    <td className="blora-row" style={{ gap: 4 }}>
                      <Link
                        className="blora-btn blora-btn--ghost blora-btn--xs"
                        href={`/app/o/${orgSlug}/p/${projectSlug}/files/${f.id}`}
                      >
                        详情
                      </Link>
                      {defaultLocale && (
                        <Link
                          className="blora-btn blora-btn--ghost blora-btn--xs"
                          href={`/app/o/${orgSlug}/p/${projectSlug}/translate?file=${f.id}&locale=${defaultLocale}`}
                        >
                          编辑
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canUploadFiles(access.role) && (
          <div className="blora-panel">
            <h3 className="blora-h4" style={{ marginBottom: 12 }}>
              上传 / 更新 JSON
            </h3>
            <UploadFileForm orgSlug={orgSlug} projectSlug={projectSlug} />
          </div>
        )}
      </section>
    </div>
  );
}
