"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteFileButton({
  orgSlug,
  projectSlug,
  fileId,
  path,
}: {
  orgSlug: string;
  projectSlug: string;
  fileId: string;
  path: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onDelete() {
    if (!confirm(`确定删除源文件 ${path}？相关字符串与译文将一并删除。`)) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/v1/orgs/${orgSlug}/projects/${projectSlug}/files/${fileId}`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.Blora?.toast?.({ type: "error", message: data.error || "删除失败" });
        return;
      }
      window.Blora?.toast?.({ type: "success", message: "文件已删除" });
      router.push(`/app/o/${orgSlug}/p/${projectSlug}`);
      router.refresh();
    } catch {
      window.Blora?.toast?.({ type: "error", message: "网络错误" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      className="blora-btn blora-btn--danger blora-btn--sm"
      disabled={loading}
      onClick={() => void onDelete()}
    >
      {loading ? "删除中…" : "删除文件"}
    </button>
  );
}
