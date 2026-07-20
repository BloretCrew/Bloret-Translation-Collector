import { Router } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { requireOrgAccess, requireProjectAccess } from "@/lib/access";
import { db } from "@/lib/db";
import {
  organizationMembers,
  organizations,
  projectLanguages,
  projects,
  sourceFiles,
  stringUnits,
  users,
} from "@/lib/db/schema";
import {
  ROLE_LABELS,
  canApproveTranslations,
  canEditTranslations,
  canExport,
  canManageOrg,
  canManageProjects,
  canSuggestTranslations,
  canUploadFiles,
} from "@/lib/permissions/roles";
import { getFileProgress, getProjectProgress } from "@/lib/services/files";
import { isLocaleAssignee } from "@/lib/services/glossary";
import { resolveReadme, type ReadmeView } from "@/lib/readme";
import { requirePageAuth } from "@/middleware/requireAuth";

export const pagesRouter = Router();

pagesRouter.get("/", async (req, res, next) => {
  try {
    if (req.session?.isLoggedIn) return res.redirect("/app");

    const err = typeof req.query.error === "string" ? req.query.error : null;
    const errorMsg =
      err === "oauth_denied"
        ? "你取消了授权，或 PassPort 未返回授权码。"
        : err
          ? decodeURIComponent(err)
          : null;

    return res.render("home", {
      title: "Bloret Translation",
      layout: "landing",
      errorMsg,
    });
  } catch (e) {
    next(e);
  }
});

pagesRouter.use("/app", requirePageAuth);

pagesRouter.get("/app/tasks", async (req, res, next) => {
  try {
    const session = requireSession(req)!;
    const { listMyTasks } = await import("@/lib/services/tasks");
    const raw = await listMyTasks(session.userId!, true);
    const orgIds = [...new Set(raw.map((t) => t.orgId))] as string[];
    const orgs =
      orgIds.length === 0
        ? []
        : await db
            .select({ id: organizations.id, slug: organizations.slug })
            .from(organizations)
            .where(inArray(organizations.id, orgIds));
    const slugByOrg = new Map(orgs.map((o) => [o.id, o.slug]));
    const tasks = raw.map((t) => ({
      ...t,
      orgSlug: slugByOrg.get(t.orgId) ?? "",
    }));
    return res.render("app/tasks", { title: "我的任务", tasks });
  } catch (e) {
    next(e);
  }
});

pagesRouter.get("/app/settings", async (req, res, next) => {
  try {
    const tabParam = typeof req.query.tab === "string" ? req.query.tab : "shortcuts";
    const activeTab = ["shortcuts"].includes(tabParam) ? tabParam : "shortcuts";
    return res.render("app/settings", { title: "用户设置", activeTab });
  } catch (e) {
    next(e);
  }
});

pagesRouter.get("/app", async (req, res, next) => {
  try {
    const session = requireSession(req)!;
    const orgs = await db
      .select({
        id: organizations.id,
        slug: organizations.slug,
        name: organizations.name,
        description: organizations.description,
        role: organizationMembers.role,
        projectCount: sql<number>`(
          select count(*)::int from projects p where p.org_id = ${organizations.id}
        )`,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizationMembers.orgId, organizations.id))
      .where(eq(organizationMembers.userId, session.userId!))
      .orderBy(desc(organizations.createdAt));

    return res.render("app/orgs", {
      title: "我的组织",
      orgs,
      roleLabels: ROLE_LABELS,
    });
  } catch (e) {
    next(e);
  }
});

pagesRouter.get("/app/orgs/new", (_req, res) => {
  return res.render("app/org-new", { title: "新建组织" });
});

pagesRouter.get("/app/o/:org", async (req, res, next) => {
  try {
    const session = requireSession(req)!;
    const orgSlug = req.params.org;

    const access = await requireOrgAccess(orgSlug, session.userId!);
    if ("error" in access) {
      if (access.error === "not_found") return res.status(404).render("404", { title: "未找到" });
      return res.redirect("/app");
    }

    const isMember = access.membership != null;
    const projectList = await db
      .select()
      .from(projects)
      .where(
        isMember
          ? eq(projects.orgId, access.org.id)
          : and(eq(projects.orgId, access.org.id), eq(projects.visibility, "public")),
      )
      .orderBy(desc(projects.updatedAt));

    const projectIds = projectList.map((p) => p.id);
    const allLangs =
      projectIds.length === 0
        ? []
        : await db
            .select()
            .from(projectLanguages)
            .where(inArray(projectLanguages.projectId, projectIds));

    const langMap = new Map<string, { locale: string; displayName: string | null }[]>();
    for (const l of allLangs) {
      if (!l.enabled) continue;
      const arr = langMap.get(l.projectId) ?? [];
      arr.push({ locale: l.locale, displayName: l.displayName });
      langMap.set(l.projectId, arr);
    }

    const readmeView = await resolveReadme({
      readme: access.org.readme,
      readmeUrl: access.org.readmeUrl,
    });

    return res.render("app/org", {
      title: access.org.name,
      orgSlug,
      org: access.org,
      role: access.role,
      roleLabel: isMember ? ROLE_LABELS[access.role] : "公开访客",
      canManage: isMember && canManageOrg(access.role),
      canManageProjects: isMember && canManageProjects(access.role),
      readmeView,
      projects: projectList.map((p) => ({
        ...p,
        targetLanguages: langMap.get(p.id) ?? [],
        targetLocales: (langMap.get(p.id) ?? []).map((l) => l.locale),
      })),
    });
  } catch (e) {
    next(e);
  }
});

pagesRouter.get("/app/o/:org/members", async (req, res, next) => {
  try {
    const session = requireSession(req)!;
    const orgSlug = req.params.org;

    const access = await requireOrgAccess(orgSlug, session.userId!);
    if ("error" in access) {
      if (access.error === "not_found") return res.status(404).render("404", { title: "未找到" });
      return res.redirect("/app");
    }

    const isMember = access.membership != null;
    const members = await db
      .select({
        userId: users.id,
        username: users.username,
        avatarUrl: users.avatarUrl,
        role: organizationMembers.role,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(organizationMembers.userId, users.id))
      .where(eq(organizationMembers.orgId, access.org.id));

    return res.render("app/org-members", {
      title: `成员 · ${access.org.name}`,
      orgSlug,
      org: access.org,
      role: access.role,
      roleLabel: isMember ? ROLE_LABELS[access.role] : "公开访客",
      canManage: isMember && canManageOrg(access.role),
      canManageProjects: isMember && canManageProjects(access.role),
      members,
      roleLabels: ROLE_LABELS,
      currentUserId: session.userId!,
    });
  } catch (e) {
    next(e);
  }
});

pagesRouter.get("/app/o/:org/settings", async (req, res, next) => {
  try {
    const session = requireSession(req)!;
    const orgSlug = req.params.org;

    const access = await requireOrgAccess(orgSlug, session.userId!);
    if ("error" in access) {
      if (access.error === "not_found") return res.status(404).render("404", { title: "未找到" });
      return res.redirect("/app");
    }
    if (!access.membership || !canManageOrg(access.role)) {
      return res.redirect(`/app/o/${orgSlug}`);
    }

    const tabParam = typeof req.query.tab === "string" ? req.query.tab : "general";
    const activeTab = ["general", "readme"].includes(tabParam) ? tabParam : "general";

    return res.render("app/org-settings", {
      title: `设置 · ${access.org.name}`,
      orgSlug,
      org: access.org,
      role: access.role,
      roleLabel: ROLE_LABELS[access.role],
      canManage: true,
      canManageProjects: canManageProjects(access.role),
      activeTab,
    });
  } catch (e) {
    next(e);
  }
});

pagesRouter.get("/app/o/:org/projects/new", async (req, res, next) => {
  try {
    const session = requireSession(req)!;
    const orgSlug = req.params.org;

    const access = await requireOrgAccess(orgSlug, session.userId!, "manager");
    if ("error" in access) {
      if (access.error === "not_found") return res.status(404).render("404", { title: "未找到" });
      return res.redirect(`/app/o/${orgSlug}`);
    }
    if (!canManageProjects(access.role)) return res.redirect(`/app/o/${orgSlug}`);

    return res.render("app/project-new", {
      title: "新建项目",
      orgSlug,
      org: access.org,
    });
  } catch (e) {
    next(e);
  }
});

type ProjectPageCtx = {
  orgSlug: string;
  projectSlug: string;
  org: { id: string; slug: string; name: string; description: string | null };
  project: {
    id: string;
    orgId: string;
    slug: string;
    name: string;
    description: string | null;
    readme: string | null;
    readmeUrl: string | null;
    sourceLocale: string;
    visibility: string;
  };
  role: string;
  targetLocales: string[];
  targetLanguages: { locale: string; displayName: string | null }[];
  files: {
    id: string;
    path: string;
    format: string;
    sourceRevision: number;
    updatedAt: Date;
    stringCount: number;
  }[];
  localeProgress: {
    locale: string;
    displayName: string | null;
    translated: number;
    suggested: number;
    total: number;
    percent: number;
  }[];
  totalStrings: number;
  defaultLocale: string | null;
  defaultFile: string | null;
  canUpload: boolean;
  canEdit: boolean;
  canExport: boolean;
  canManageSettings: boolean;
  readmeView: ReadmeView | null;
};

/** Shared project page payload (dashboard / sources / import / export / settings shell). */
async function loadProjectPageContext(
  orgSlug: string,
  projectSlug: string,
  userId: string,
  minRole?: "manager",
): Promise<{ error: "not_found" | "forbidden" } | ProjectPageCtx> {
  const access = await requireProjectAccess(orgSlug, projectSlug, userId, minRole);
  if ("error" in access && access.error) {
    return { error: access.error === "forbidden" ? "forbidden" : "not_found" };
  }
  if ("error" in access) {
    return { error: "not_found" };
  }

  const langs = await db
    .select()
    .from(projectLanguages)
    .where(eq(projectLanguages.projectId, access.project.id));
  const targetLanguages = langs
    .filter((l) => l.enabled)
    .map((l) => ({ locale: l.locale, displayName: l.displayName }));
  const targetLocales = targetLanguages.map((l) => l.locale);

  const files = await db
    .select({
      id: sourceFiles.id,
      path: sourceFiles.path,
      format: sourceFiles.format,
      sourceRevision: sourceFiles.sourceRevision,
      updatedAt: sourceFiles.updatedAt,
      stringCount: sql<number>`(
          select count(*)::int from ${stringUnits} s
          where s.file_id = ${sourceFiles.id} and s.orphaned = false
        )`,
    })
    .from(sourceFiles)
    .where(eq(sourceFiles.projectId, access.project.id))
    .orderBy(desc(sourceFiles.updatedAt));

  const progress = await getProjectProgress(access.project.id);
  const progressMap = new Map(progress.byLocale.map((p) => [p.locale, p]));

  const localeProgress = targetLocales.map((locale) => {
    const p = progressMap.get(locale);
    const translated = p?.translated ?? 0;
    const suggested = p?.suggested ?? 0;
    const total = progress.totalStrings;
    const percent = total === 0 ? 0 : Math.round((translated / total) * 100);
    const language = targetLanguages.find((l) => l.locale === locale);
    return {
      locale,
      displayName: language?.displayName ?? null,
      translated,
      suggested,
      total,
      percent,
    };
  });

  return {
    orgSlug,
    projectSlug,
    org: access.org,
    project: access.project,
    role: access.role,
    targetLocales,
    targetLanguages,
    files,
    localeProgress,
    totalStrings: progress.totalStrings,
    defaultLocale: targetLocales[0] ?? null,
    defaultFile: files[0]?.id ?? null,
    canUpload: canUploadFiles(access.role),
    canEdit: canEditTranslations(access.role),
    canExport: canExport(access.role),
    canManageSettings: canManageProjects(access.role),
    readmeView: null,
  };
}

pagesRouter.get("/app/o/:org/p/:project", async (req, res, next) => {
  try {
    const session = requireSession(req)!;
    const { org: orgSlug, project: projectSlug } = req.params;

    const ctx = await loadProjectPageContext(orgSlug, projectSlug, session.userId!);
    if ("error" in ctx) {
      if (ctx.error === "not_found") return res.status(404).render("404", { title: "未找到" });
      return res.redirect("/app");
    }

    const readmeView = await resolveReadme({
      readme: ctx.project.readme,
      readmeUrl: ctx.project.readmeUrl,
    });

    return res.render("app/project", {
      title: ctx.project.name,
      ...ctx,
      readmeView,
    });
  } catch (e) {
    next(e);
  }
});

pagesRouter.get("/app/o/:org/p/:project/sources", async (req, res, next) => {
  try {
    const session = requireSession(req)!;
    const { org: orgSlug, project: projectSlug } = req.params;

    const ctx = await loadProjectPageContext(orgSlug, projectSlug, session.userId!);
    if ("error" in ctx) {
      if (ctx.error === "not_found") return res.status(404).render("404", { title: "未找到" });
      return res.redirect("/app");
    }

    return res.render("app/project-sources", {
      title: `源文件 · ${ctx.project.name}`,
      ...ctx,
    });
  } catch (e) {
    next(e);
  }
});

pagesRouter.get("/app/o/:org/p/:project/import", async (req, res, next) => {
  try {
    const session = requireSession(req)!;
    const { org: orgSlug, project: projectSlug } = req.params;

    const ctx = await loadProjectPageContext(orgSlug, projectSlug, session.userId!);
    if ("error" in ctx) {
      if (ctx.error === "not_found") return res.status(404).render("404", { title: "未找到" });
      return res.redirect("/app");
    }
    if (!ctx.canUpload) {
      return res.redirect(`/app/o/${orgSlug}/p/${projectSlug}`);
    }

    return res.render("app/project-import", {
      title: `导入 · ${ctx.project.name}`,
      ...ctx,
    });
  } catch (e) {
    next(e);
  }
});

pagesRouter.get("/app/o/:org/p/:project/export", async (req, res, next) => {
  try {
    const session = requireSession(req)!;
    const { org: orgSlug, project: projectSlug } = req.params;

    const ctx = await loadProjectPageContext(orgSlug, projectSlug, session.userId!);
    if ("error" in ctx) {
      if (ctx.error === "not_found") return res.status(404).render("404", { title: "未找到" });
      return res.redirect("/app");
    }
    if (!ctx.canExport) {
      return res.redirect(`/app/o/${orgSlug}/p/${projectSlug}`);
    }

    return res.render("app/project-export", {
      title: `导出 · ${ctx.project.name}`,
      ...ctx,
    });
  } catch (e) {
    next(e);
  }
});

pagesRouter.get("/app/o/:org/p/:project/settings", async (req, res, next) => {
  try {
    const session = requireSession(req)!;
    const { org: orgSlug, project: projectSlug } = req.params;

    const ctx = await loadProjectPageContext(orgSlug, projectSlug, session.userId!, "manager");
    if ("error" in ctx) {
      if (ctx.error === "not_found") return res.status(404).render("404", { title: "未找到" });
      return res.redirect(`/app/o/${orgSlug}`);
    }
    if (!ctx.canManageSettings) {
      return res.redirect(`/app/o/${orgSlug}/p/${projectSlug}`);
    }

    const tabParam = typeof req.query.tab === "string" ? req.query.tab : "general";
    const allowedTabs = ["general", "readme", "glossary", "assignees", "danger"] as const;
    const activeTab = (allowedTabs as readonly string[]).includes(tabParam)
      ? tabParam
      : "general";

    return res.render("app/project-settings", {
      title: `设置 · ${ctx.project.name}`,
      ...ctx,
      activeTab,
    });
  } catch (e) {
    next(e);
  }
});

pagesRouter.get("/app/o/:org/p/:project/files/:fileId", async (req, res, next) => {
  try {
    const session = requireSession(req)!;
    const { org: orgSlug, project: projectSlug, fileId } = req.params;

    const access = await requireProjectAccess(orgSlug, projectSlug, session.userId!);
    if ("error" in access) {
      if (access.error === "not_found") return res.status(404).render("404", { title: "未找到" });
      return res.redirect("/app");
    }

    const [file] = await db
      .select()
      .from(sourceFiles)
      .where(and(eq(sourceFiles.id, fileId), eq(sourceFiles.projectId, access.project.id)))
      .limit(1);
    if (!file) return res.status(404).render("404", { title: "未找到" });

    const langs = await db
      .select()
      .from(projectLanguages)
      .where(eq(projectLanguages.projectId, access.project.id));
    const targetLanguages = langs
      .filter((l) => l.enabled)
      .map((l) => ({ locale: l.locale, displayName: l.displayName }));
    const targetLocales = targetLanguages.map((l) => l.locale);

    const progress = await getFileProgress(file.id);
    const progressMap = new Map(progress.byLocale.map((p) => [p.locale, p]));

    const localeProgress = targetLocales.map((locale) => {
      const p = progressMap.get(locale);
      const translated = p?.translated ?? 0;
      const suggested = p?.suggested ?? 0;
      const total = progress.totalStrings;
      const percent = total === 0 ? 0 : Math.round((translated / total) * 100);
      const language = targetLanguages.find((l) => l.locale === locale);
      return {
        locale,
        displayName: language?.displayName ?? null,
        translated,
        suggested,
        total,
        percent,
      };
    });

    return res.render("app/file", {
      title: file.path,
      orgSlug,
      projectSlug,
      org: access.org,
      project: access.project,
      file,
      localeProgress,
      targetLanguages,
      canUpload: canUploadFiles(access.role),
      canEdit: canEditTranslations(access.role),
      canExport: canExport(access.role),
      defaultLocale: targetLocales[0] ?? null,
      updatedAtLabel: file.updatedAt.toLocaleString("zh-CN"),
    });
  } catch (e) {
    next(e);
  }
});

pagesRouter.get("/app/o/:org/p/:project/translate", async (req, res, next) => {
  try {
    const session = requireSession(req)!;
    const { org: orgSlug, project: projectSlug } = req.params;

    const access = await requireProjectAccess(orgSlug, projectSlug, session.userId!);
    if ("error" in access) {
      if (access.error === "not_found") return res.status(404).render("404", { title: "未找到" });
      return res.redirect("/app");
    }

    const files = await db
      .select({ id: sourceFiles.id, path: sourceFiles.path })
      .from(sourceFiles)
      .where(eq(sourceFiles.projectId, access.project.id));

    const langs = await db
      .select()
      .from(projectLanguages)
      .where(eq(projectLanguages.projectId, access.project.id));
    const localeLanguages = langs
      .filter((l) => l.enabled)
      .map((l) => ({ locale: l.locale, displayName: l.displayName }));
    const locales = localeLanguages.map((l) => l.locale);

    if (files.length === 0 || locales.length === 0) {
      return res.redirect(`/app/o/${orgSlug}/p/${projectSlug}`);
    }

    const fileIdParam = typeof req.query.file === "string" ? req.query.file : null;
    const localeParam = typeof req.query.locale === "string" ? req.query.locale : null;
    const stringParam = typeof req.query.string === "string" ? req.query.string : null;
    const modeParam = typeof req.query.mode === "string" ? req.query.mode : null;
    const fileId =
      fileIdParam && files.some((f) => f.id === fileIdParam) ? fileIdParam : files[0]!.id;
    const locale =
      localeParam && locales.includes(localeParam) ? localeParam : locales[0]!;

    const canEdit = canEditTranslations(access.role);
    const canModeTranslate = canSuggestTranslations(access.role);
    const localeProofreader = await isLocaleAssignee(
      access.project.id,
      locale,
      session.userId!,
      "proofreader",
    );
    const canApprove =
      canApproveTranslations(access.role) || localeProofreader;
    const canModeProofread = canApprove;

    let initialMode: "translate" | "proofread" | "readonly" = "readonly";
    if (modeParam === "translate" && canModeTranslate) initialMode = "translate";
    else if (modeParam === "proofread" && canModeProofread) initialMode = "proofread";
    else if (canModeTranslate) initialMode = "translate";
    else if (canModeProofread) initialMode = "proofread";

    return res.render("app/translate", {
      title: "翻译工作台",
      orgSlug,
      projectSlug,
      org: access.org,
      project: access.project,
      files,
      locales,
      localeLanguages,
      fileId,
      locale,
      focusString: stringParam,
      canEdit,
      canApprove,
      canModeTranslate,
      canModeProofread,
      initialMode,
    });
  } catch (e) {
    next(e);
  }
});
