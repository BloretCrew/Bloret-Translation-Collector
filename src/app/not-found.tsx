import Link from "next/link";

export default function NotFound() {
  return (
    <main className="app-main">
      <div className="blora-container">
        <div className="blora-empty" style={{ paddingTop: 80 }}>
          <div className="blora-empty__title">页面不存在</div>
          <div className="blora-empty__desc">链接可能已失效，或你没有访问权限。</div>
          <div className="blora-row blora-row--center" style={{ marginTop: 24 }}>
            <Link className="blora-btn blora-btn--primary" href="/app">
              回到工作台
            </Link>
            <Link className="blora-btn blora-btn--ghost" href="/">
              首页
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
