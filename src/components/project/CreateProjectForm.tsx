"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

function toSlug(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function CreateProjectForm({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [sourceLocale, setSourceLocale] = useState("zh-CN");
  const [targetLocales, setTargetLocales] = useState("en, ja");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const locales = targetLocales
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const res = await fetch(`/api/v1/orgs/${orgSlug}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          description: description || null,
          sourceLocale,
          targetLocales: locales,
          visibility: "org",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "创建失败");
        return;
      }
      router.push(`/app/o/${orgSlug}/p/${data.slug}`);
      router.refresh();
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="blora-stack" onSubmit={onSubmit}>
      {error && (
        <div className="blora-alert blora-alert--danger" role="alert">
          {error}
        </div>
      )}
      <label className="blora-field">
        <span className="blora-field__label">项目名称</span>
        <input
          className="blora-input"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(toSlug(e.target.value));
          }}
          required
          placeholder="我的应用"
        />
      </label>
      <label className="blora-field">
        <span className="blora-field__label">Slug</span>
        <input
          className="blora-input"
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          required
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
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
            placeholder="zh-CN"
          />
        </label>
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
      </div>
      <label className="blora-field">
        <span className="blora-field__label">简介（可选）</span>
        <textarea
          className="blora-textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </label>
      <button className="blora-btn blora-btn--primary" type="submit" disabled={loading}>
        {loading ? "创建中…" : "创建项目"}
      </button>
    </form>
  );
}
