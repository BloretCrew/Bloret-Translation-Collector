"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AddMemberForm({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("translator");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/orgs/${orgSlug}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "添加失败");
        return;
      }
      setUsername("");
      router.refresh();
      window.Blora?.toast?.({ type: "success", message: `已添加 ${data.username}` });
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="blora-row" onSubmit={onSubmit} style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
      {error && (
        <div className="blora-alert blora-alert--danger" style={{ width: "100%" }}>
          {error}
        </div>
      )}
      <label className="blora-field" style={{ flex: 1, minWidth: 160 }}>
        <span className="blora-field__label">PassPort 用户名</span>
        <input
          className="blora-input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          placeholder="username"
        />
      </label>
      <label className="blora-field">
        <span className="blora-field__label">角色</span>
        <select className="blora-select" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="manager">管理员</option>
          <option value="translator">译者</option>
          <option value="viewer">访客</option>
        </select>
      </label>
      <button className="blora-btn blora-btn--primary" type="submit" disabled={loading}>
        {loading ? "添加中…" : "添加成员"}
      </button>
    </form>
  );
}
