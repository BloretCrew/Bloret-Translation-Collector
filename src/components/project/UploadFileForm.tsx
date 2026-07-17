"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function UploadFileForm({
  orgSlug,
  projectSlug,
}: {
  orgSlug: string;
  projectSlug: string;
}) {
  const router = useRouter();
  const [path, setPath] = useState("locales/common.json");
  const [content, setContent] = useState('{\n  "hello": "你好",\n  "nav": {\n    "home": "首页"\n  }\n}\n');
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function onFilePick(file: File | null) {
    if (!file) return;
    const text = await file.text();
    setContent(text);
    if (!path || path === "locales/common.json") {
      setPath(file.name.endsWith(".json") ? file.name : `${file.name}.json`);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setWarnings([]);
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/orgs/${orgSlug}/projects/${projectSlug}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "上传失败");
        return;
      }
      if (data.warnings?.length) setWarnings(data.warnings);
      window.Blora?.toast?.({
        type: "success",
        message: `已同步 ${data.stringCount} 条字符串 (r${data.revision})`,
      });
      router.refresh();
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="blora-stack" onSubmit={onSubmit}>
      {error && <div className="blora-alert blora-alert--danger">{error}</div>}
      {warnings.length > 0 && (
        <div className="blora-alert blora-alert--warning">
          <strong>警告：</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <label className="blora-field">
        <span className="blora-field__label">文件路径</span>
        <input
          className="blora-input"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          required
          pattern="[a-zA-Z0-9_./-]+\.json"
        />
      </label>
      <label className="blora-field">
        <span className="blora-field__label">从本地选择 JSON</span>
        <input
          className="blora-input"
          type="file"
          accept="application/json,.json"
          onChange={(e) => onFilePick(e.target.files?.[0] ?? null)}
        />
      </label>
      <label className="blora-field">
        <span className="blora-field__label">JSON 内容</span>
        <textarea
          className="blora-textarea blora-text-mono"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={12}
          required
          style={{ fontSize: 13 }}
        />
      </label>
      <button className="blora-btn blora-btn--primary" type="submit" disabled={loading}>
        {loading ? "上传中…" : "上传 / 更新源文件"}
      </button>
    </form>
  );
}
