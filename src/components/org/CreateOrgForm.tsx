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

export function CreateOrgForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/v1/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, description: description || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "创建失败");
        return;
      }
      router.push(`/app/o/${data.slug}`);
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
        <span className="blora-field__label">组织名称</span>
        <input
          className="blora-input"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(toSlug(e.target.value));
          }}
          required
          maxLength={80}
          placeholder="例如 Bloret Studio"
        />
      </label>
      <label className="blora-field">
        <span className="blora-field__label">Slug（URL 标识）</span>
        <input
          className="blora-input"
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          required
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          placeholder="bloret-studio"
        />
        <span className="blora-field__hint">仅小写字母、数字与连字符</span>
      </label>
      <label className="blora-field">
        <span className="blora-field__label">简介（可选）</span>
        <textarea
          className="blora-textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={500}
        />
      </label>
      <div className="blora-row">
        <button className="blora-btn blora-btn--primary" type="submit" disabled={loading}>
          {loading ? "创建中…" : "创建组织"}
        </button>
        <button className="blora-btn blora-btn--ghost" type="button" onClick={() => router.back()}>
          取消
        </button>
      </div>
    </form>
  );
}
