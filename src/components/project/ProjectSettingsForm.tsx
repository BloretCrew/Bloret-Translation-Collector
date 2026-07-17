"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProjectSettingsForm({
  orgSlug,
  projectSlug,
  initial,
}: {
  orgSlug: string;
  projectSlug: string;
  initial: {
    name: string;
    description: string | null;
    sourceLocale: string;
    visibility: "private" | "org";
    targetLocales: string[];
  };
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [sourceLocale, setSourceLocale] = useState(initial.sourceLocale);
  const [visibility, setVisibility] = useState(initial.visibility);
  const [targetLocales, setTargetLocales] = useState(initial.targetLocales.join(", "));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const locales = targetLocales
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const res = await fetch(`/api/v1/orgs/${orgSlug}/projects/${projectSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          sourceLocale,
          visibility,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "保存失败");
        return;
      }

      const langRes = await fetch(
        `/api/v1/orgs/${orgSlug}/projects/${projectSlug}/languages`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locales }),
        },
      );
      const langData = await langRes.json();
      if (!langRes.ok) {
        setError(langData.error || "语言保存失败");
        return;
      }

      window.Blora?.toast?.({ type: "success", message: "项目已更新" });
      router.refresh();
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    if (!confirm(`确定删除项目「${name}」？所有文件与译文将不可恢复。`)) return;
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/orgs/${orgSlug}/projects/${projectSlug}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "删除失败");
        return;
      }
      router.push(`/app/o/${orgSlug}`);
      router.refresh();
    } catch {
      setError("网络错误");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="blora-stack blora-stack--lg">
      <form className="blora-stack" onSubmit={onSubmit}>
        {error && <div className="blora-alert blora-alert--danger">{error}</div>}
        <label className="blora-field">
          <span className="blora-field__label">项目名称</span>
          <input
            className="blora-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className="blora-field">
          <span className="blora-field__label">简介</span>
          <textarea
            className="blora-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </label>
        <div className="blora-grid blora-grid--2">
          <label className="blora-field">
            <span className="blora-field__label">源语言</span>
            <input
              className="blora-input"
              value={sourceLocale}
              onChange={(e) => setSourceLocale(e.target.value)}
              required
            />
          </label>
          <label className="blora-field">
            <span className="blora-field__label">可见性</span>
            <select
              className="blora-select"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as "private" | "org")}
            >
              <option value="org">组织内</option>
              <option value="private">私有</option>
            </select>
          </label>
        </div>
        <label className="blora-field">
          <span className="blora-field__label">目标语言（逗号分隔）</span>
          <input
            className="blora-input"
            value={targetLocales}
            onChange={(e) => setTargetLocales(e.target.value)}
            required
            placeholder="en, ja, ko"
          />
        </label>
        <p className="blora-text-faint" style={{ fontSize: 13 }}>
          Slug <code className="blora-code">{projectSlug}</code> 创建后不可修改。
        </p>
        <button className="blora-btn blora-btn--primary" type="submit" disabled={loading}>
          {loading ? "保存中…" : "保存设置"}
        </button>
      </form>

      <hr className="blora-divider" />

      <div className="blora-stack">
        <h3 className="blora-h4">危险区域</h3>
        <p className="blora-text-muted">删除项目将清除所有源文件与译文，且无法恢复。</p>
        <button
          type="button"
          className="blora-btn blora-btn--danger"
          disabled={deleting}
          onClick={() => void onDelete()}
        >
          {deleting ? "删除中…" : "删除项目"}
        </button>
      </div>
    </div>
  );
}
