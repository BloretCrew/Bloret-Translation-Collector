"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function OrgSettingsForm({
  orgSlug,
  initialName,
  initialDescription,
}: {
  orgSlug: string;
  initialName: string;
  initialDescription: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/orgs/${orgSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "保存失败");
        return;
      }
      window.Blora?.toast?.({ type: "success", message: "组织已更新" });
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
      <label className="blora-field">
        <span className="blora-field__label">组织名称</span>
        <input
          className="blora-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={80}
        />
      </label>
      <label className="blora-field">
        <span className="blora-field__label">简介</span>
        <textarea
          className="blora-textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={500}
        />
      </label>
      <p className="blora-text-faint" style={{ fontSize: 13 }}>
        Slug <code className="blora-code">{orgSlug}</code> 创建后不可修改。
      </p>
      <button className="blora-btn blora-btn--primary" type="submit" disabled={loading}>
        {loading ? "保存中…" : "保存"}
      </button>
    </form>
  );
}
