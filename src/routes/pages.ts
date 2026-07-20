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
  canUploadFiles,
} from "@/lib/permissions/roles";
import { getFileProgress, getProjectProgress } from "@/lib/services/files";
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

    const projectList = await db
      .select()
      .from(projects)
      .where(eq(projects.orgId, access.org.id))
      .orderBy(desc(projects.updatedAt));

    const projectIds = projectList.map((p) => p.id);
    const allLangs =
      projectIds.length === 0
        ? []
        : await db
            .select()
            .from(projectLanguages)
            .where(inArray(projectLanguages.projectId, projectIds));

    const langMap = new Map<string, string[]>();
    for (const l of allLangs) {
      if (!l.enabled) continue;
      const arr = langMap.get(l.projectId) ?? [];
      arr.push(l.locale);
      langMap.set(l.projectId, arr);
    }

    return res.render("app/org", {
      title: access.org.name,
      orgSlug,
      org: access.org,
      role: access.role,
      roleLabel: ROLE_LABELS[access.role],
      canManage: canManageOrg(access.role),
      canManageProjects: canManageProjects(access.role),
      projects: projectList.map((p) => ({
        ...p,
        targetLocales: langMap.get(p.id) ?? [],
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
      canManage: canManageOrg(access.role),
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
    if (!canManageOrg(access.role)) return res.redirect(`/app/o/${orgSlug}`);

    const tabParam = typeof req.query.tab === "string" ? req.query.tab : "general";
    const activeTab = ["general"].includes(tabParam) ? tabParam : "general";

    return res.render("app/org-settings", {
      title: "组织设置",
      orgSlug,
      org: access.org,
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

pagesRouter.get("/app/o/:org/p/:project", async (req, res, next) => {
  try {
    const session = requireSession(req)!;
    const { org: orgSlug, project: projectSlug } = req.params;

    const access = await requireProjectAccess(orgSlug, projectSlug, session.userId!);
    if ("error" in access) {
      if (access.error === "not_found") return res.status(404).render("404", { title: "未找到" });
      return res.redirect("/app");
    }

    const langs = await db
      .select()
      .from(projectLanguages)
      .where(eq(projectLanguages.projectId, access.project.id));
    const targetLocales = langs.filter((l) => l.enabled).map((l) => l.locale);

    const files = await db
      .select({
        id: sourceFiles.id,
        path: sourceFiles.path,
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
      return { locale, translated, suggested, total, percent };
    });

    return res.render("app/project", {
      title: access.project.name,
      orgSlug,
      projectSlug,
      org: access.org,
      project: access.project,
      role: access.role,
      targetLocales,
      files,
      localeProgress,
      totalStrings: progress.totalStrings,
      defaultLocale: targetLocales[0] ?? null,
      defaultFile: files[0]?.id ?? null,
      canUpload: canUploadFiles(access.role),
      canEdit: canEditTranslations(access.role),
      canExport: canExport(access.role),
    });
  } catch (e) {
    next(e);
  }
});

pagesRouter.get("/app/o/:org/p/:project/settings", async (req, res, next) => {
  try {
    const session = requireSession(req)!;
    const { org: orgSlug, project: projectSlug } = req.params;

    const access = await requireProjectAccess(orgSlug, projectSlug, session.userId!, "manager");
    if ("error" in access) {
      if (access.error === "not_found") return res.status(404).render("404", { title: "未找到" });
      return res.redirect(`/app/o/${orgSlug}`);
    }
    if (!canManageProjects(access.role)) {
      return res.redirect(`/app/o/${orgSlug}/p/${projectSlug}`);
    }

    const langs = await db
      .select()
      .from(projectLanguages)
      .where(eq(projectLanguages.projectId, access.project.id));

    const tabParam = typeof req.query.tab === "string" ? req.query.tab : "general";
    const allowedTabs = ["general", "glossary", "assignees", "danger"] as const;
    const activeTab = (allowedTabs as readonly string[]).includes(tabParam)
      ? tabParam
      : "general";

    return res.render("app/project-settings", {
      title: "项目设置",
      orgSlug,
      projectSlug,
      org: access.org,
      project: access.project,
      targetLocales: langs.filter((l) => l.enabled).map((l) => l.locale),
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
    const targetLocales = langs.filter((l) => l.enabled).map((l) => l.locale);

    const progress = await getFileProgress(file.id);
    const progressMap = new Map(progress.byLocale.map((p) => [p.locale, p]));

    const localeProgress = targetLocales.map((locale) => {
      const p = progressMap.get(locale);
      const translated = p?.translated ?? 0;
      const suggested = p?.suggested ?? 0;
      const total = progress.totalStrings;
      const percent = total === 0 ? 0 : Math.round((translated / total) * 100);
      return { locale, translated, suggested, total, percent };
    });

    return res.render("app/file", {
      title: file.path,
      orgSlug,
      projectSlug,
      org: access.org,
      project: access.project,
      file,
      localeProgress,
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
    const locales = langs.filter((l) => l.enabled).map((l) => l.locale);

    if (files.length === 0 || locales.length === 0) {
      return res.redirect(`/app/o/${orgSlug}/p/${projectSlug}`);
    }

    const fileIdParam = typeof req.query.file === "string" ? req.query.file : null;
    const localeParam = typeof req.query.locale === "string" ? req.query.locale : null;
    const stringParam = typeof req.query.string === "string" ? req.query.string : null;
    const fileId =
      fileIdParam && files.some((f) => f.id === fileIdParam) ? fileIdParam : files[0]!.id;
    const locale =
      localeParam && locales.includes(localeParam) ? localeParam : locales[0]!;

    return res.render("app/translate", {
      title: "翻译工作台",
      orgSlug,
      projectSlug,
      org: access.org,
      project: access.project,
      files,
      locales,
      fileId,
      locale,
      focusString: stringParam,
      canEdit: canEditTranslations(access.role),
      canApprove: canApproveTranslations(access.role),
    });
  } catch (e) {
    next(e);
  }
});
