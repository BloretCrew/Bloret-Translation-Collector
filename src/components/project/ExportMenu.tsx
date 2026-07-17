"use client";

export function ExportMenu({
  orgSlug,
  projectSlug,
  locales,
  fileId,
}: {
  orgSlug: string;
  projectSlug: string;
  locales: string[];
  fileId?: string;
}) {
  if (locales.length === 0) return null;

  return (
    <div className="blora-dropdown">
      <button
        type="button"
        className="blora-btn blora-btn--outline"
        data-blora-dropdown-trigger
      >
        导出 ▾
      </button>
      <div className="blora-dropdown-menu">
        {locales.map((locale) => {
          const qs = new URLSearchParams({ locale });
          if (fileId) qs.set("fileId", fileId);
          return (
            <a
              key={locale}
              className="blora-dropdown-menu__item"
              href={`/api/v1/orgs/${orgSlug}/projects/${projectSlug}/export?${qs}`}
            >
              导出 {locale}
            </a>
          );
        })}
      </div>
    </div>
  );
}
