import Link from "next/link";

export default function OrgNotFound() {
  return (
    <div className="blora-empty">
      <div className="blora-empty__title">组织不存在</div>
      <div className="blora-empty__desc">请检查链接，或从工作台重新进入。</div>
      <div className="app-empty-actions">
        <Link className="blora-btn blora-btn--primary" href="/app">
          我的组织
        </Link>
      </div>
    </div>
  );
}
