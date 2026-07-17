import Link from "next/link";
import { redirect } from "next/navigation";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { getSession } from "@/lib/auth/session";

export default async function HomePage() {
  const session = await getSession();
  if (session.isLoggedIn) {
    redirect("/app");
  }

  return (
    <>
      <AppNavbar session={null} />
      <main className="app-main">
        <div className="blora-container">
          <section className="landing-hero">
            <p className="blora-text-caps blora-text-seal">Bloret · Localization</p>
            <h1>翻译收集，像 Crowdin 一样协作</h1>
            <p>
              以「组织 → 项目 → 文件 → 语言」管理本地化。上传 JSON 源文案，邀请译者在线填写，
              一键导出目标语言文件。通过 Bloret PassPort 安全登录。
            </p>
            <div className="blora-row blora-row--center">
              <a className="blora-btn blora-btn--primary blora-btn--lg" href="/auth/login">
                PassPort 登录
              </a>
              <Link className="blora-btn blora-btn--outline blora-btn--lg" href="#features">
                了解能力
              </Link>
            </div>
          </section>

          <hr className="blora-brush" />

          <section id="features" className="feature-grid">
            <div className="blora-card">
              <h3 className="blora-card__title">组织与权限</h3>
              <p className="blora-card__body blora-text-muted">
                Owner / Manager / Translator / Viewer 四级角色，协作边界清晰。
              </p>
            </div>
            <div className="blora-card">
              <h3 className="blora-card__title">JSON 源文件</h3>
              <p className="blora-card__body blora-text-muted">
                支持扁平与嵌套 i18n JSON，保留结构导出，更新源文不丢已有译文。
              </p>
            </div>
            <div className="blora-card">
              <h3 className="blora-card__title">翻译工作台</h3>
              <p className="blora-card__body blora-text-muted">
                左 key 右译文，筛选未译、自动保存，进度一目了然。
              </p>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
