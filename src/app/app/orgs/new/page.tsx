import Link from "next/link";
import { CreateOrgForm } from "@/components/org/CreateOrgForm";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";

export default function NewOrgPage() {
  return (
    <div className="app-narrow blora-stack blora-stack--lg">
      <Breadcrumbs items={[{ label: "组织", href: "/app" }, { label: "新建" }]} />
      <div>
        <h1 className="blora-h2">新建组织</h1>
        <p className="blora-text-muted">组织是项目与成员的容器，类似 Crowdin Organization。</p>
      </div>
      <div className="blora-panel">
        <CreateOrgForm />
      </div>
      <p className="blora-text-faint">
        <Link href="/app">返回列表</Link>
      </p>
    </div>
  );
}
