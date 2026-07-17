import Link from "next/link";
import { redirect } from "next/navigation";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { getSession } from "@/lib/auth/session";

type Props = { searchParams: Promise<{ error?: string }> };

export default async function HomePage({ searchParams }: Props) {
  const session = await getSession();
  if (session.isLoggedIn) {
    redirect("/app");
  }

  const sp = await searchParams;
  const errorMsg =
    sp.error === "oauth_denied"
      ? "你取消了授权，或 PassPort 未返回授权码。"
      : sp.error
        ? decodeURIComponent(sp.error)
        : null;

  return (
    <>
      <AppNavbar session={null} />
      <main className="app-main">
        <div className="blora-container">
          {errorMsg && (
            <div className="blora-alert blora-alert--danger u-mb-3" role="alert">
              登录失败：{errorMsg}
            </div>
          )}

          <section className="landing-hero">
            <p className="blora-text-caps blora-text-seal landing-hero__eyebrow">
              Bloret · Localization
            </p>
            <h1 className="landing-hero__title">翻译收集，像 Crowdin 一样协作</h1>
            <p className="landing-hero__lead">
              以「组织 → 项目 → 文件 → 语言」管理本地化。上传 JSON 源文案，邀请译者在线填写，
              一键导出目标语言文件。通过 Bloret PassPort 安全登录。
            </p>
            <div className="blora-row landing-hero__actions">
              <a className="blora-btn blora-btn--primary blora-btn--lg" href="/auth/login">
                PassPort 登录
              </a>
              <Link className="blora-btn blora-btn--outline blora-btn--lg" href="#features">
                了解能力
              </Link>
            </div>
            <p className="blora-text-faint landing-hero__hint">
              本地开发：{" "}
              <a href="/auth/login?user=dev-user&dev=1">以 dev-user 登录</a>
              （config.json 未配置 PassPort 时可用）
            </p>
          </section>

          <hr className="blora-brush" />

          <section id="features" className="feature-grid" aria-label="产品能力">
            <article className="blora-card">
              <h3 className="blora-card__title">组织与权限</h3>
              <p className="blora-card__body blora-text-muted">
                Owner / Manager / Translator / Viewer 四级角色，协作边界清晰。
              </p>
            </article>
            <article className="blora-card">
              <h3 className="blora-card__title">JSON 源文件</h3>
              <p className="blora-card__body blora-text-muted">
                支持扁平与嵌套 i18n JSON，保留结构导出，更新源文不丢已有译文。
              </p>
            </article>
            <article className="blora-card">
              <h3 className="blora-card__title">翻译工作台</h3>
              <p className="blora-card__body blora-text-muted">
                左 key 右译文，筛选未译、自动保存，进度一目了然。
              </p>
            </article>
          </section>
        </div>
      </main>
    </>
  );
}
