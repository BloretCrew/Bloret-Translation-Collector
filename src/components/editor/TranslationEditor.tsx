"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type StringRow = {
  id: string;
  keyPath: string;
  sourceText: string;
  translation: string;
  status: string;
};

type Props = {
  orgSlug: string;
  projectSlug: string;
  fileId: string;
  locale: string;
  canEdit: boolean;
  files: { id: string; path: string }[];
  locales: string[];
};

export function TranslationEditor({
  orgSlug,
  projectSlug,
  fileId,
  locale,
  canEdit,
  files,
  locales,
}: Props) {
  const [strings, setStrings] = useState<StringRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "empty" | "translated">("all");
  const [q, setQ] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        locale,
        pageSize: "200",
        ...(filter !== "all" ? { status: filter } : {}),
        ...(q ? { q } : {}),
      });
      const res = await fetch(
        `/api/v1/orgs/${orgSlug}/projects/${projectSlug}/files/${fileId}/strings?${params}`,
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "加载失败");
        return;
      }
      setStrings(data.strings);
      setTotal(data.total);
      if (data.strings.length && !activeId) {
        setActiveId(data.strings[0].id);
        setDraft(data.strings[0].translation || "");
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, [orgSlug, projectSlug, fileId, locale, filter, q, activeId]);

  useEffect(() => {
    setActiveId(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, projectSlug, fileId, locale, filter]);

  const active = useMemo(
    () => strings.find((s) => s.id === activeId) ?? null,
    [strings, activeId],
  );

  useEffect(() => {
    if (active) setDraft(active.translation || "");
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!canEdit || !active) return;
    if (draft === (active.translation || "")) {
      setSaveState("idle");
      return;
    }
    setSaveState("saving");
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/v1/orgs/${orgSlug}/projects/${projectSlug}/strings/${active.id}/translations/${locale}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: draft }),
          },
        );
        const data = await res.json();
        if (!res.ok) {
          setSaveState("error");
          return;
        }
        setStrings((prev) =>
          prev.map((s) =>
            s.id === active.id
              ? { ...s, translation: data.text, status: data.status }
              : s,
          ),
        );
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [draft, active, canEdit, orgSlug, projectSlug, locale]);

  function selectString(row: StringRow) {
    setActiveId(row.id);
    setDraft(row.translation || "");
    setSaveState("idle");
  }

  function navigate(delta: number) {
    if (!active) return;
    const idx = strings.findIndex((s) => s.id === active.id);
    const next = strings[idx + delta];
    if (next) selectString(next);
  }

  return (
    <div className="blora-stack">
      <div className="editor-toolbar">
        <label className="blora-field" style={{ margin: 0 }}>
          <span className="blora-field__label">文件</span>
          <select
            className="blora-select"
            value={fileId}
            onChange={(e) => {
              const url = new URL(window.location.href);
              url.searchParams.set("file", e.target.value);
              window.location.href = url.toString();
            }}
          >
            {files.map((f) => (
              <option key={f.id} value={f.id}>
                {f.path}
              </option>
            ))}
          </select>
        </label>
        <label className="blora-field" style={{ margin: 0 }}>
          <span className="blora-field__label">语言</span>
          <select
            className="blora-select"
            value={locale}
            onChange={(e) => {
              const url = new URL(window.location.href);
              url.searchParams.set("locale", e.target.value);
              window.location.href = url.toString();
            }}
          >
            {locales.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="blora-field" style={{ margin: 0 }}>
          <span className="blora-field__label">筛选</span>
          <select
            className="blora-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
          >
            <option value="all">全部</option>
            <option value="empty">未翻译</option>
            <option value="translated">已翻译</option>
          </select>
        </label>
        <label className="blora-field" style={{ margin: 0, flex: 1, minWidth: 160 }}>
          <span className="blora-field__label">搜索</span>
          <input
            className="blora-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load();
            }}
            placeholder="key 或源文"
          />
        </label>
        <button className="blora-btn blora-btn--secondary" type="button" onClick={() => void load()}>
          刷新
        </button>
        <span className="blora-text-faint blora-text-mono" style={{ fontSize: 12 }}>
          {strings.length}/{total}
        </span>
      </div>

      {error && <div className="blora-alert blora-alert--danger">{error}</div>}
      {loading ? (
        <div className="blora-text-muted">加载中…</div>
      ) : strings.length === 0 ? (
        <div className="blora-empty">
          <div className="blora-empty__title">没有匹配的字符串</div>
        </div>
      ) : (
        <div className="editor-layout">
          <div className="editor-list" role="listbox" aria-label="字符串列表">
            {strings.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`editor-list__item${s.id === activeId ? " is-active" : ""}`}
                onClick={() => selectString(s)}
              >
                <span
                  className={`status-dot ${
                    s.status === "translated" && s.translation ? "status-dot--done" : "status-dot--empty"
                  }`}
                />
                <div className="editor-list__key">{s.keyPath}</div>
                <div className="editor-list__src">{s.sourceText}</div>
              </button>
            ))}
          </div>

          <div className="editor-panel">
            {active ? (
              <>
                <div>
                  <div className="blora-text-caps blora-text-faint">Key</div>
                  <div className="blora-text-mono" style={{ wordBreak: "break-all" }}>
                    {active.keyPath}
                  </div>
                </div>
                <div>
                  <div className="blora-text-caps blora-text-faint">源文</div>
                  <div className="blora-panel" style={{ padding: 12, marginTop: 4 }}>
                    {active.sourceText}
                  </div>
                </div>
                <label className="blora-field">
                  <span className="blora-field__label">
                    译文 ({locale})
                    <span
                      className={`save-hint${
                        saveState === "saving"
                          ? " is-saving"
                          : saveState === "saved"
                            ? " is-saved"
                            : saveState === "error"
                              ? " is-error"
                              : ""
                      }`}
                      style={{ marginLeft: 12 }}
                    >
                      {saveState === "saving"
                        ? "保存中…"
                        : saveState === "saved"
                          ? "已保存"
                          : saveState === "error"
                            ? "保存失败"
                            : canEdit
                              ? "自动保存"
                              : "只读"}
                    </span>
                  </span>
                  <textarea
                    className="blora-textarea"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={6}
                    readOnly={!canEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        navigate(1);
                      }
                    }}
                  />
                </label>
                <div className="blora-row">
                  <button
                    type="button"
                    className="blora-btn blora-btn--outline blora-btn--sm"
                    onClick={() => navigate(-1)}
                  >
                    上一条
                  </button>
                  <button
                    type="button"
                    className="blora-btn blora-btn--outline blora-btn--sm"
                    onClick={() => navigate(1)}
                  >
                    下一条
                  </button>
                  <span className="blora-text-faint" style={{ fontSize: 12 }}>
                    Ctrl/⌘ + Enter 下一条
                  </span>
                </div>
              </>
            ) : (
              <div className="blora-text-muted">选择左侧字符串开始翻译</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
