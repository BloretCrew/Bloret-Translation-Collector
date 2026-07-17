"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="app-main">
      <div className="blora-container">
        <div className="blora-empty">
          <div className="blora-empty__title">出错了</div>
          <div className="blora-empty__desc">
            {error.message || "发生未知错误，请稍后重试。"}
          </div>
          <div className="app-empty-actions">
            <button type="button" className="blora-btn blora-btn--primary" onClick={reset}>
              重试
            </button>
            <a className="blora-btn blora-btn--ghost" href="/app">
              回到工作台
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
