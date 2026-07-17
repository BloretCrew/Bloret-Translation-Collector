"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ROLE_LABELS } from "@/lib/permissions/roles";
import type { MemberRole } from "@/lib/db/schema";

type Member = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  role: MemberRole;
};

export function MemberList({
  orgSlug,
  members,
  canManage,
  currentUserId,
}: {
  orgSlug: string;
  members: Member[];
  canManage: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function changeRole(userId: string, role: string) {
    setError("");
    setBusyId(userId);
    try {
      const res = await fetch(`/api/v1/orgs/${orgSlug}/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "修改失败");
        return;
      }
      window.Blora?.toast?.({ type: "success", message: "角色已更新" });
      router.refresh();
    } catch {
      setError("网络错误");
    } finally {
      setBusyId(null);
    }
  }

  async function removeMember(userId: string, username: string) {
    if (!confirm(`确定移除成员 ${username}？`)) return;
    setError("");
    setBusyId(userId);
    try {
      const res = await fetch(`/api/v1/orgs/${orgSlug}/members/${userId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "移除失败");
        return;
      }
      window.Blora?.toast?.({ type: "success", message: `已移除 ${username}` });
      router.refresh();
    } catch {
      setError("网络错误");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="blora-stack">
      {error && <div className="blora-alert blora-alert--danger">{error}</div>}
      <div className="blora-table-wrap">
        <table className="blora-table">
          <thead>
            <tr>
              <th>用户</th>
              <th>角色</th>
              {canManage && <th>操作</th>}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const isOwner = m.role === "owner";
              const isSelf = m.userId === currentUserId;
              return (
                <tr key={m.userId}>
                  <td>
                    <div className="blora-row blora-row--center" style={{ gap: 8 }}>
                      {m.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.avatarUrl}
                          alt=""
                          width={28}
                          height={28}
                          style={{ borderRadius: 999 }}
                        />
                      ) : (
                        <span className="blora-avatar blora-avatar--sm">
                          {m.username[0]?.toUpperCase()}
                        </span>
                      )}
                      {m.username}
                      {isSelf && (
                        <span className="blora-badge blora-badge--pill" style={{ fontSize: 10 }}>
                          我
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    {canManage && !isOwner ? (
                      <select
                        className="blora-select"
                        value={m.role}
                        disabled={busyId === m.userId}
                        onChange={(e) => void changeRole(m.userId, e.target.value)}
                      >
                        <option value="manager">管理员</option>
                        <option value="translator">译者</option>
                        <option value="viewer">访客</option>
                      </select>
                    ) : (
                      ROLE_LABELS[m.role]
                    )}
                  </td>
                  {canManage && (
                    <td>
                      {!isOwner && (
                        <button
                          type="button"
                          className="blora-btn blora-btn--danger blora-btn--xs"
                          disabled={busyId === m.userId}
                          onClick={() => void removeMember(m.userId, m.username)}
                        >
                          移除
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
