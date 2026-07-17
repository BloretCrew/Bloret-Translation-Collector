import Link from "next/link";
import type { SessionData } from "@/lib/auth/session";

export function AppNavbar({ session }: { session: SessionData | null }) {
  const initial = session?.username?.[0]?.toUpperCase() ?? "?";

  return (
    <nav className="blora-navbar">
      <div className="blora-navbar__brand">
        <Link href={session?.isLoggedIn ? "/app" : "/"} className="blora-row blora-row--center" style={{ gap: "0.5rem", textDecoration: "none", color: "inherit" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/blora/bloret-mini.svg" alt="" width={28} height={28} />
          <span>Bloret Translation</span>
        </Link>
      </div>
      <div className="blora-navbar__menu">
        {session?.isLoggedIn ? (
          <>
            <Link className="blora-navbar__link" href="/app">
              我的组织
            </Link>
            <div className="blora-dropdown">
              <button className="blora-btn blora-btn--ghost blora-btn--sm" data-blora-dropdown-trigger type="button">
                {session.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={session.avatarUrl}
                    alt=""
                    width={24}
                    height={24}
                    style={{ borderRadius: "999px", marginRight: 6, verticalAlign: "middle" }}
                  />
                ) : (
                  <span className="blora-avatar blora-avatar--sm" style={{ marginRight: 6 }}>
                    {initial}
                  </span>
                )}
                {session.username}
                <span aria-hidden> ▾</span>
              </button>
              <div className="blora-dropdown-menu">
                <Link className="blora-dropdown-menu__item" href="/app">
                  工作台
                </Link>
                <div className="blora-dropdown-menu__sep" />
                <a className="blora-dropdown-menu__item" href="/auth/logout">
                  退出登录
                </a>
              </div>
            </div>
          </>
        ) : (
          <a className="blora-btn blora-btn--primary blora-btn--sm" href="/auth/login">
            PassPort 登录
          </a>
        )}
      </div>
    </nav>
  );
}
