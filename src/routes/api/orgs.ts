import { t } from "@/lib/i18n";
import { randomBytes } from "crypto";
import { Router } from "express";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { requireOrgAccess, requireProjectAccess } from "@/lib/access";
import {
  forbidden,
  jsonCreated,
  jsonError,
  jsonOk,
  notFound,
  unauthorized,
} from "@/lib/api";
import { db } from "@/lib/db";
import {
  organizationMembers,
  organizations,
  projectLanguages,
  projects,
  sourceFiles,
  stringUnits,
  translations,
  users,
} from "@/lib/db/schema";
import {
  absoluteImageUrl,
  parseImageDataUrl,
  uploadImageToHost,
} from "@/lib/image-host";
import {
  addMemberSchema,
  createOrgSchema,
  createProjectSchema,
  localeSchema,
  saveTranslationSchema,
  setLanguagesSchema,
  updateMemberSchema,
  updateOrgSchema,
  updateProjectSchema,
  uploadBatchSchema,
  uploadFileSchema,
} from "@/lib/validators/common";
import {
  canEditTranslations,
  canExport,
  canManageOrg,
  canManageProjects,
  canUploadFiles,
} from "@/lib/permissions/roles";
import {
  buildProjectExport,
  type ExportFilenameMode,
  type ExportMode,
  type ExportPack,
  getFileProgress,
  getProjectProgress,
  upsertSourceFile,
} from "@/lib/services/files";
import { Logger } from "@/lib/logger";
import { slugify } from "@/lib/slug";

export const orgsRouter = Router();

/** Stable project count subquery (plain table name — avoids drizzle alias quirks) */
const orgProjectCountSql = sql<number>`(
  select count(*)::int from projects p where p.org_id = ${organizations.id}
)`;

// —— Orgs list / create ——
orgsRouter.get("/v1/orgs", async (req, res, next) => {
  try {
    const session = requireSession(req);
    if (!session) return unauthorized(res);

    const rows = await db
      .select({
        id: organizations.id,
        slug: organizations.slug,
        name: organizations.name,
        description: organizations.description,
        iconUrl: organizations.iconUrl,
        role: organizationMembers.role,
        createdAt: organizations.createdAt,
        projectCount: orgProjectCountSql,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizationMembers.orgId, organizations.id))
      .where(eq(organizationMembers.userId, session.userId!))
      .orderBy(desc(organizations.createdAt));

    return jsonOk(res, { orgs: rows });
  } catch (err) {
    next(err);
  }
});

orgsRouter.post("/v1/orgs", async (req, res, next) => {
  try {
    const session = requireSession(req);
    if (!session) return unauthorized(res);

    const rawBody =
      req.body && typeof req.body === "object" ? { ...(req.body as Record<string, unknown>) } : {};
    // Server-side fallback when client sends empty slug (e.g. non-Latin name)
    if (
      typeof rawBody.name === "string" &&
      (!rawBody.slug || String(rawBody.slug).length < 2)
    ) {
      rawBody.slug = slugify(rawBody.name, "org");
    }

    const parsed = createOrgSchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonError(res, parsed.error.errors[0]?.message ?? t('参数错误'));
    }

    const { name, slug, description, visibility } = parsed.data;

    try {
      const org = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(organizations)
          .values({
            name,
            slug,
            description: description ?? null,
            visibility,
            createdBy: session.userId!,
          })
          .returning();

        await tx.insert(organizationMembers).values({
          orgId: created!.id,
          userId: session.userId!,
          role: "owner",
        });

        return created!;
      });

      return jsonCreated(res, {
        id: org.id,
        slug: org.slug,
        name: org.name,
        description: org.description,
        visibility: org.visibility,
        role: "owner" as const,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("unique") || msg.includes("duplicate")) {
        return jsonError(res, "组织 slug 已存在", 409);
      }
      Logger.error(e);
      return jsonError(res, "创建失败", 500);
    }
  } catch (err) {
    next(err);
  }
});

// —— Single org ——
orgsRouter.get("/v1/orgs/:orgSlug", async (req, res, next) => {
  try {
    const session = requireSession(req);
    if (!session) return unauthorized(res);

    const access = await requireOrgAccess(req.params.orgSlug, session.userId!);
    if ("error" in access) {
      if (access.error === "not_found") return notFound(res, "组织不存在");
      return forbidden(res);
    }

    return jsonOk(res, {
      id: access.org.id,
      slug: access.org.slug,
      name: access.org.name,
      description: access.org.description,
      visibility: access.org.visibility,
      iconUrl: access.org.iconUrl,
      role: access.role,
      membership: access.membership != null,
      createdAt: access.org.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

orgsRouter.patch("/v1/orgs/:orgSlug", async (req, res, next) => {
  try {
    const session = requireSession(req);
    if (!session) return unauthorized(res);

    const access = await requireOrgAccess(req.params.orgSlug, session.userId!);
    if ("error" in access) {
      if (access.error === "not_found") return notFound(res, "组织不存在");
      return forbidden(res);
    }
    if (!canManageOrg(access.role) || !access.membership) {
      return forbidden(res, "仅所有者可修改组织");
    }

    const parsed = updateOrgSchema.safeParse(req.body);
    if (!parsed.success) return jsonError(res, parsed.error.errors[0]?.message ?? t('参数错误'));

    const [updated] = await db
      .update(organizations)
      .set({
        ...("name" in parsed.data ? { name: parsed.data.name } : {}),
        ...("description" in parsed.data
          ? { description: parsed.data.description ?? null }
          : {}),
        ...(parsed.data.visibility !== undefined
          ? { visibility: parsed.data.visibility }
          : {}),
        ...(parsed.data.readme !== undefined
          ? { readme: parsed.data.readme?.trim() ? parsed.data.readme : null }
          : {}),
        ...(parsed.data.readmeUrl !== undefined
          ? {
              readmeUrl: parsed.data.readmeUrl?.trim()
                ? parsed.data.readmeUrl.trim()
                : null,
            }
          : {}),
        ...(parsed.data.iconUrl !== undefined
          ? {
              iconUrl: parsed.data.iconUrl?.trim()
                ? absoluteImageUrl(parsed.data.iconUrl.trim())
                : null,
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, access.org.id))
      .returning();

    return jsonOk(res, updated);
  } catch (err) {
    next(err);
  }
});

/** Upload org icon via Bloret Image Host (data URL body). */
orgsRouter.post("/v1/orgs/:orgSlug/icon", async (req, res, next) => {
  try {
    const session = requireSession(req);
    if (!session) return unauthorized(res);

    const access = await requireOrgAccess(req.params.orgSlug, session.userId!);
    if ("error" in access) {
      if (access.error === "not_found") return notFound(res, "组织不存在");
      return forbidden(res);
    }
    if (!canManageOrg(access.role) || !access.membership) {
      return forbidden(res, "仅所有者可修改组织图标");
    }

    const dataUrl = typeof req.body?.imageBase64 === "string" ? req.body.imageBase64 : "";
    const parsed = parseImageDataUrl(dataUrl);
    if (!parsed) return jsonError(res, t('请上传 data URL 格式的图片 (png/jpg/gif/webp)'));
    if (parsed.buffer.length > 2 * 1024 * 1024) return jsonError(res, t('图标不能超过 2MB'));

    let uploaded;
    try {
      uploaded = await uploadImageToHost({
        buffer: parsed.buffer,
        filename: `org-icon-${randomBytes(6).toString("hex")}.${parsed.ext}`,
        contentType: parsed.contentType,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('图床上传失败');
      return jsonError(res, msg, 502);
    }

    const iconUrl = absoluteImageUrl(uploaded.url);
    const [updated] = await db
      .update(organizations)
      .set({ iconUrl, updatedAt: new Date() })
      .where(eq(organizations.id, access.org.id))
      .returning({ id: organizations.id, iconUrl: organizations.iconUrl });

    return jsonOk(res, {
      iconUrl: updated!.iconUrl || iconUrl,
      webpUrl: absoluteImageUrl(uploaded.webpUrl),
    });
  } catch (err) {
    next(err);
  }
});

/** Clear org icon. */
orgsRouter.delete("/v1/orgs/:orgSlug/icon", async (req, res, next) => {
  try {
    const session = requireSession(req);
    if (!session) return unauthorized(res);

    const access = await requireOrgAccess(req.params.orgSlug, session.userId!);
    if ("error" in access) {
      if (access.error === "not_found") return notFound(res, "组织不存在");
      return forbidden(res);
    }
    if (!canManageOrg(access.role) || !access.membership) {
      return forbidden(res, "仅所有者可修改组织图标");
    }

    await db
      .update(organizations)
      .set({ iconUrl: null, updatedAt: new Date() })
      .where(eq(organizations.id, access.org.id));

    return jsonOk(res, { iconUrl: null });
  } catch (err) {
    next(err);
  }
});

// —— Members ——
orgsRouter.get("/v1/orgs/:orgSlug/members", async (req, res, next) => {
  try {
    const session = requireSession(req);
    if (!session) return unauthorized(res);

    const access = await requireOrgAccess(req.params.orgSlug, session.userId!);
    if ("error" in access) {
      if (access.error === "not_found") return notFound(res, "组织不存在");
      return forbidden(res);
    }

    const members = await db
      .select({
        id: organizationMembers.id,
        userId: users.id,
        username: users.username,
        avatarUrl: users.avatarUrl,
        role: organizationMembers.role,
        createdAt: organizationMembers.createdAt,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(organizationMembers.userId, users.id))
      .where(eq(organizationMembers.orgId, access.org.id));

    return jsonOk(res, { members });
  } catch (err) {
    next(err);
  }
});

orgsRouter.post("/v1/orgs/:orgSlug/members", async (req, res, next) => {
  try {
    const session = requireSession(req);
    if (!session) return unauthorized(res);

    const access = await requireOrgAccess(req.params.orgSlug, session.userId!);
    if ("error" in access) {
      if (access.error === "not_found") return notFound(res, "组织不存在");
      return forbidden(res);
    }
    if (!canManageOrg(access.role)) return forbidden(res, "仅所有者可管理成员");

    const parsed = addMemberSchema.safeParse(req.body);
    if (!parsed.success) return jsonError(res, parsed.error.errors[0]?.message ?? t('参数错误'));

    const { username, role } = parsed.data;

    let [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (!user) {
      [user] = await db.insert(users).values({ username }).returning();
    }

    try {
      const [member] = await db
        .insert(organizationMembers)
        .values({
          orgId: access.org.id,
          userId: user!.id,
          role,
        })
        .returning();

      return jsonCreated(res, {
        id: member!.id,
        userId: user!.id,
        username: user!.username,
        avatarUrl: user!.avatarUrl,
        role: member!.role,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("unique") || msg.includes("duplicate")) {
        return jsonError(res, "该用户已是成员", 409);
      }
      throw e;
    }
  } catch (err) {
    next(err);
  }
});

orgsRouter.patch("/v1/orgs/:orgSlug/members/:userId", async (req, res, next) => {
  try {
    const session = requireSession(req);
    if (!session) return unauthorized(res);

    const access = await requireOrgAccess(req.params.orgSlug, session.userId!);
    if ("error" in access) {
      if (access.error === "not_found") return notFound(res, "组织不存在");
      return forbidden(res);
    }
    if (!canManageOrg(access.role)) return forbidden(res, "仅所有者可修改角色");

    const parsed = updateMemberSchema.safeParse(req.body);
    if (!parsed.success) return jsonError(res, parsed.error.errors[0]?.message ?? t('参数错误'));

    const [target] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.orgId, access.org.id),
          eq(organizationMembers.userId, req.params.userId),
        ),
      )
      .limit(1);

    if (!target) return notFound(res, "成员不存在");
    if (target.role === "owner") return jsonError(res, "不能修改所有者角色");

    const [updated] = await db
      .update(organizationMembers)
      .set({ role: parsed.data.role })
      .where(eq(organizationMembers.id, target.id))
      .returning();

    return jsonOk(res, updated);
  } catch (err) {
    next(err);
  }
});

orgsRouter.delete("/v1/orgs/:orgSlug/members/:userId", async (req, res, next) => {
  try {
    const session = requireSession(req);
    if (!session) return unauthorized(res);

    const access = await requireOrgAccess(req.params.orgSlug, session.userId!);
    if ("error" in access) {
      if (access.error === "not_found") return notFound(res, "组织不存在");
      return forbidden(res);
    }
    if (!canManageOrg(access.role)) return forbidden(res, "仅所有者可移除成员");

    const [target] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.orgId, access.org.id),
          eq(organizationMembers.userId, req.params.userId),
        ),
      )
      .limit(1);

    if (!target) return notFound(res, "成员不存在");
    if (target.role === "owner") return jsonError(res, "不能移除所有者");

    await db.delete(organizationMembers).where(eq(organizationMembers.id, target.id));
    return jsonOk(res, { ok: true });
  } catch (err) {
    next(err);
  }
});

// —— Projects ——
orgsRouter.get("/v1/orgs/:orgSlug/projects", async (req, res, next) => {
  try {
    const session = requireSession(req);
    if (!session) return unauthorized(res);

    const access = await requireOrgAccess(req.params.orgSlug, session.userId!);
    if ("error" in access) {
      if (access.error === "not_found") return notFound(res, "组织不存在");
      return forbidden(res);
    }

    // Non-members of public orgs only see projects marked public.
    const list = await db
      .select()
      .from(projects)
      .where(
        access.membership
          ? eq(projects.orgId, access.org.id)
          : and(eq(projects.orgId, access.org.id), eq(projects.visibility, "public")),
      )
      .orderBy(desc(projects.updatedAt));

    const projectIds = list.map((p) => p.id);
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

    return jsonOk(res, {
      projects: list.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        description: p.description,
        iconUrl: p.iconUrl,
        sourceLocale: p.sourceLocale,
        visibility: p.visibility,
        targetLocales: langMap.get(p.id) ?? [],
        updatedAt: p.updatedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

orgsRouter.post("/v1/orgs/:orgSlug/projects", async (req, res, next) => {
  try {
    const session = requireSession(req);
    if (!session) return unauthorized(res);

    const access = await requireOrgAccess(req.params.orgSlug, session.userId!, "manager");
    if ("error" in access) {
      if (access.error === "not_found") return notFound(res, "组织不存在");
      return forbidden(res);
    }
    if (!canManageProjects(access.role)) return forbidden(res);

    const rawBody =
      req.body && typeof req.body === "object" ? { ...(req.body as Record<string, unknown>) } : {};
    if (
      typeof rawBody.name === "string" &&
      (!rawBody.slug || String(rawBody.slug).length < 2)
    ) {
      rawBody.slug = slugify(rawBody.name, "project");
    }

    const parsed = createProjectSchema.safeParse(rawBody);
    if (!parsed.success) return jsonError(res, parsed.error.errors[0]?.message ?? t('参数错误'));

    const data = parsed.data;

    try {
      const project = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(projects)
          .values({
            orgId: access.org.id,
            slug: data.slug,
            name: data.name,
            description: data.description ?? null,
            sourceLocale: data.sourceLocale,
            visibility: data.visibility,
            createdBy: session.userId!,
          })
          .returning();

        if (data.targetLocales.length) {
          const languageByCode = new Map(
            (data.languages ?? []).map((language) => [language.locale.toLowerCase(), language]),
          );
          await tx.insert(projectLanguages).values(
            data.targetLocales.map((locale) => ({
              projectId: created!.id,
              locale,
              displayName: languageByCode.get(locale.toLowerCase())?.displayName?.trim() || null,
              enabled: true,
            })),
          );
        }

        return created!;
      });

      return jsonCreated(res, {
        id: project.id,
        slug: project.slug,
        name: project.name,
        sourceLocale: project.sourceLocale,
        visibility: project.visibility,
        targetLocales: data.targetLocales,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("unique") || msg.includes("duplicate")) {
        return jsonError(res, "项目 slug 已存在", 409);
      }
      Logger.error(e);
      return jsonError(res, "创建失败", 500);
    }
  } catch (err) {
    next(err);
  }
});

orgsRouter.get("/v1/orgs/:orgSlug/projects/:projectSlug", async (req, res, next) => {
  try {
    const session = requireSession(req);
    if (!session) return unauthorized(res);

    const access = await requireProjectAccess(
      req.params.orgSlug,
      req.params.projectSlug,
      session.userId!,
    );
    if ("error" in access) {
      if (access.error === "not_found") return notFound(res);
      return forbidden(res);
    }

    const langs = await db
      .select()
      .from(projectLanguages)
      .where(eq(projectLanguages.projectId, access.project.id));

    return jsonOk(res, {
      id: access.project.id,
      slug: access.project.slug,
      name: access.project.name,
      description: access.project.description,
      iconUrl: access.project.iconUrl,
      sourceLocale: access.project.sourceLocale,
      visibility: access.project.visibility,
      targetLocales: langs.filter((l) => l.enabled).map((l) => l.locale),
      role: access.role,
      org: {
        slug: access.org.slug,
        name: access.org.name,
        iconUrl: access.org.iconUrl,
      },
    });
  } catch (err) {
    next(err);
  }
});

orgsRouter.patch("/v1/orgs/:orgSlug/projects/:projectSlug", async (req, res, next) => {
  try {
    const session = requireSession(req);
    if (!session) return unauthorized(res);

    const access = await requireProjectAccess(
      req.params.orgSlug,
      req.params.projectSlug,
      session.userId!,
      "manager",
    );
    if ("error" in access) {
      if (access.error === "not_found") return notFound(res);
      return forbidden(res);
    }
    if (!canManageProjects(access.role)) return forbidden(res);

    const parsed = updateProjectSchema.safeParse(req.body);
    if (!parsed.success) return jsonError(res, parsed.error.errors[0]?.message ?? t('参数错误'));

    const [updated] = await db
      .update(projects)
      .set({
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description ?? null }
          : {}),
        ...(parsed.data.readme !== undefined
          ? { readme: parsed.data.readme?.trim() ? parsed.data.readme : null }
          : {}),
        ...(parsed.data.readmeUrl !== undefined
          ? {
              readmeUrl: parsed.data.readmeUrl?.trim()
                ? parsed.data.readmeUrl.trim()
                : null,
            }
          : {}),
        ...(parsed.data.iconUrl !== undefined
          ? {
              iconUrl: parsed.data.iconUrl?.trim()
                ? absoluteImageUrl(parsed.data.iconUrl.trim())
                : null,
            }
          : {}),
        ...(parsed.data.sourceLocale !== undefined
          ? { sourceLocale: parsed.data.sourceLocale }
          : {}),
        ...(parsed.data.visibility !== undefined ? { visibility: parsed.data.visibility } : {}),
        ...(parsed.data.translationRules !== undefined
          ? { translationRules: parsed.data.translationRules }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, access.project.id))
      .returning();

    return jsonOk(res, updated);
  } catch (err) {
    next(err);
  }
});

/** Upload project icon via Bloret Image Host. */
orgsRouter.post("/v1/orgs/:orgSlug/projects/:projectSlug/icon", async (req, res, next) => {
  try {
    const session = requireSession(req);
    if (!session) return unauthorized(res);

    const access = await requireProjectAccess(
      req.params.orgSlug,
      req.params.projectSlug,
      session.userId!,
      "manager",
    );
    if ("error" in access) {
      if (access.error === "not_found") return notFound(res);
      return forbidden(res);
    }
    if (!canManageProjects(access.role)) return forbidden(res);

    const dataUrl = typeof req.body?.imageBase64 === "string" ? req.body.imageBase64 : "";
    const parsed = parseImageDataUrl(dataUrl);
    if (!parsed) return jsonError(res, t('请上传 data URL 格式的图片 (png/jpg/gif/webp)'));
    if (parsed.buffer.length > 2 * 1024 * 1024) return jsonError(res, t('图标不能超过 2MB'));

    let uploaded;
    try {
      uploaded = await uploadImageToHost({
        buffer: parsed.buffer,
        filename: `project-icon-${randomBytes(6).toString("hex")}.${parsed.ext}`,
        contentType: parsed.contentType,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('图床上传失败');
      return jsonError(res, msg, 502);
    }

    const iconUrl = absoluteImageUrl(uploaded.url);
    const [updated] = await db
      .update(projects)
      .set({ iconUrl, updatedAt: new Date() })
      .where(eq(projects.id, access.project.id))
      .returning({ id: projects.id, iconUrl: projects.iconUrl });

    return jsonOk(res, {
      iconUrl: updated!.iconUrl || iconUrl,
      webpUrl: absoluteImageUrl(uploaded.webpUrl),
    });
  } catch (err) {
    next(err);
  }
});

/** Clear project icon. */
orgsRouter.delete("/v1/orgs/:orgSlug/projects/:projectSlug/icon", async (req, res, next) => {
  try {
    const session = requireSession(req);
    if (!session) return unauthorized(res);

    const access = await requireProjectAccess(
      req.params.orgSlug,
      req.params.projectSlug,
      session.userId!,
      "manager",
    );
    if ("error" in access) {
      if (access.error === "not_found") return notFound(res);
      return forbidden(res);
    }
    if (!canManageProjects(access.role)) return forbidden(res);

    await db
      .update(projects)
      .set({ iconUrl: null, updatedAt: new Date() })
      .where(eq(projects.id, access.project.id));

    return jsonOk(res, { iconUrl: null });
  } catch (err) {
    next(err);
  }
});

orgsRouter.delete("/v1/orgs/:orgSlug/projects/:projectSlug", async (req, res, next) => {
  try {
    const session = requireSession(req);
    if (!session) return unauthorized(res);

    const access = await requireProjectAccess(
      req.params.orgSlug,
      req.params.projectSlug,
      session.userId!,
      "manager",
    );
    if ("error" in access) {
      if (access.error === "not_found") return notFound(res);
      return forbidden(res);
    }
    if (!canManageProjects(access.role)) return forbidden(res);

    await db
      .delete(projects)
      .where(and(eq(projects.id, access.project.id), eq(projects.orgId, access.org.id)));

    return jsonOk(res, { ok: true });
  } catch (err) {
    next(err);
  }
});

// —— Languages ——
orgsRouter.put("/v1/orgs/:orgSlug/projects/:projectSlug/languages", async (req, res, next) => {
  try {
    const session = requireSession(req);
    if (!session) return unauthorized(res);

    const access = await requireProjectAccess(
      req.params.orgSlug,
      req.params.projectSlug,
      session.userId!,
      "manager",
    );
    if ("error" in access) {
      if (access.error === "not_found") return notFound(res);
      return forbidden(res);
    }
    if (!canManageProjects(access.role)) return forbidden(res);

    const parsed = setLanguagesSchema.safeParse(req.body);
    if (!parsed.success) return jsonError(res, parsed.error.errors[0]?.message ?? t('参数错误'));

    const languageRows = parsed.data.languages
      ? parsed.data.languages.map((language) => ({
          locale: language.locale,
          displayName: language.displayName?.trim() || null,
        }))
      : (parsed.data.locales ?? []).map((locale) => ({
          locale,
          displayName: null,
        }));
    const dedupedLanguages = Array.from(
      new Map(languageRows.map((language) => [language.locale.toLowerCase(), language])).values(),
    );

    await db.transaction(async (tx) => {
      await tx.delete(projectLanguages).where(eq(projectLanguages.projectId, access.project.id));
      if (dedupedLanguages.length) {
        await tx.insert(projectLanguages).values(
          dedupedLanguages.map((language) => ({
            projectId: access.project.id,
            locale: language.locale,
            displayName: language.displayName,
            enabled: true,
          })),
        );
      }
    });

    return jsonOk(res, {
      locales: dedupedLanguages.map((language) => language.locale),
      languages: dedupedLanguages,
    });
  } catch (err) {
    next(err);
  }
});

// —— Progress ——
orgsRouter.get("/v1/orgs/:orgSlug/projects/:projectSlug/progress", async (req, res, next) => {
  try {
    const session = requireSession(req);
    if (!session) return unauthorized(res);

    const access = await requireProjectAccess(
      req.params.orgSlug,
      req.params.projectSlug,
      session.userId!,
    );
    if ("error" in access) {
      if (access.error === "not_found") return notFound(res);
      return forbidden(res);
    }

    const langs = await db
      .select()
      .from(projectLanguages)
      .where(eq(projectLanguages.projectId, access.project.id));

    const progress = await getProjectProgress(access.project.id);
    const byLocaleMap = new Map(progress.byLocale.map((p) => [p.locale, p]));

    const merged = langs
      .filter((l) => l.enabled)
      .map((l) => {
        const p = byLocaleMap.get(l.locale);
        return {
          locale: l.locale,
          translated: p?.translated ?? 0,
          total: progress.totalStrings,
          percent:
            progress.totalStrings === 0
              ? 0
              : Math.round(((p?.translated ?? 0) / progress.totalStrings) * 100),
        };
      });

    return jsonOk(res, {
      sourceLocale: access.project.sourceLocale,
      totalStrings: progress.totalStrings,
      languages: merged,
    });
  } catch (err) {
    next(err);
  }
});

// —— Files ——
orgsRouter.get("/v1/orgs/:orgSlug/projects/:projectSlug/files", async (req, res, next) => {
  try {
    const session = requireSession(req);
    if (!session) return unauthorized(res);

    const access = await requireProjectAccess(
      req.params.orgSlug,
      req.params.projectSlug,
      session.userId!,
    );
    if ("error" in access) {
      if (access.error === "not_found") return notFound(res);
      return forbidden(res);
    }

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

    return jsonOk(res, { files });
  } catch (err) {
    next(err);
  }
});

orgsRouter.post("/v1/orgs/:orgSlug/projects/:projectSlug/files", async (req, res, next) => {
  try {
    const session = requireSession(req);
    if (!session) return unauthorized(res);

    const access = await requireProjectAccess(
      req.params.orgSlug,
      req.params.projectSlug,
      session.userId!,
      "manager",
    );
    if ("error" in access) {
      if (access.error === "not_found") return notFound(res);
      return forbidden(res);
    }
    if (!canUploadFiles(access.role)) return forbidden(res);

    const parsed = uploadFileSchema.safeParse(req.body);
    if (!parsed.success) return jsonError(res, parsed.error.errors[0]?.message ?? t('参数错误'));

    const result = await upsertSourceFile({
      projectId: access.project.id,
      path: parsed.data.path,
      content: parsed.data.content,
      userId: session.userId!,
    });

    if ("error" in result && result.error) {
      return jsonError(res, result.error, 400);
    }

    return jsonCreated(res, result);
  } catch (err) {
    next(err);
  }
});

/** Batch upload / update multiple source files in one request. */
orgsRouter.post("/v1/orgs/:orgSlug/projects/:projectSlug/files/batch", async (req, res, next) => {
  try {
    const session = requireSession(req);
    if (!session) return unauthorized(res);

    const access = await requireProjectAccess(
      req.params.orgSlug,
      req.params.projectSlug,
      session.userId!,
      "manager",
    );
    if ("error" in access) {
      if (access.error === "not_found") return notFound(res);
      return forbidden(res);
    }
    if (!canUploadFiles(access.role)) return forbidden(res);

    const parsed = uploadBatchSchema.safeParse(req.body);
    if (!parsed.success) return jsonError(res, parsed.error.errors[0]?.message ?? t('参数错误'));

    // Validate all first (fail fast on parse errors)
    const results: Array<
      | {
          path: string;
          ok: true;
          fileId: string;
          revision: number;
          stringCount: number;
          orphanedCount: number;
          warnings: string[];
          unchanged?: boolean;
          format?: string;
        }
      | { path: string; ok: false; error: string; warnings?: string[] }
    > = [];

    for (const file of parsed.data.files) {
      const result = await upsertSourceFile({
        projectId: access.project.id,
        path: file.path,
        content: file.content,
        userId: session.userId!,
      });
      if ("error" in result && result.error) {
        results.push({
          path: file.path,
          ok: false,
          error: result.error,
          warnings: "warnings" in result ? (result.warnings as string[]) : undefined,
        });
      } else {
        const ok = result as {
          fileId: string;
          path: string;
          revision: number;
          stringCount: number;
          orphanedCount: number;
          warnings: string[];
          unchanged?: boolean;
          format?: string;
        };
        results.push({
          path: file.path,
          ok: true,
          fileId: ok.fileId,
          revision: ok.revision,
          stringCount: ok.stringCount,
          orphanedCount: ok.orphanedCount,
          warnings: ok.warnings ?? [],
          unchanged: ok.unchanged,
          format: ok.format,
        });
      }
    }

    const failed = results.filter((r) => !r.ok).length;
    const okCount = results.length - failed;
    return jsonCreated(res, {
      results,
      summary: { total: results.length, ok: okCount, failed },
    });
  } catch (err) {
    next(err);
  }
});

orgsRouter.get(
  "/v1/orgs/:orgSlug/projects/:projectSlug/files/:fileId",
  async (req, res, next) => {
    try {
      const session = requireSession(req);
      if (!session) return unauthorized(res);

      const access = await requireProjectAccess(
        req.params.orgSlug,
        req.params.projectSlug,
        session.userId!,
      );
      if ("error" in access) {
        if (access.error === "not_found") return notFound(res);
        return forbidden(res);
      }

      const [file] = await db
        .select()
        .from(sourceFiles)
        .where(
          and(eq(sourceFiles.id, req.params.fileId), eq(sourceFiles.projectId, access.project.id)),
        )
        .limit(1);

      if (!file) return notFound(res, t('文件不存在'));

      const progress = await getFileProgress(file.id);

      return jsonOk(res, {
        id: file.id,
        path: file.path,
        sourceRevision: file.sourceRevision,
        updatedAt: file.updatedAt,
        progress,
      });
    } catch (err) {
      next(err);
    }
  },
);

orgsRouter.delete(
  "/v1/orgs/:orgSlug/projects/:projectSlug/files/:fileId",
  async (req, res, next) => {
    try {
      const session = requireSession(req);
      if (!session) return unauthorized(res);

      const access = await requireProjectAccess(
        req.params.orgSlug,
        req.params.projectSlug,
        session.userId!,
        "manager",
      );
      if ("error" in access) {
        if (access.error === "not_found") return notFound(res);
        return forbidden(res);
      }
      if (!canUploadFiles(access.role)) return forbidden(res);

      const [file] = await db
        .select()
        .from(sourceFiles)
        .where(
          and(eq(sourceFiles.id, req.params.fileId), eq(sourceFiles.projectId, access.project.id)),
        )
        .limit(1);

      if (!file) return notFound(res, t('文件不存在'));

      await db.delete(sourceFiles).where(eq(sourceFiles.id, file.id));
      return jsonOk(res, { ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// Strings / suggestions / votes / approve → collaboration router

// —— Export ——
orgsRouter.get("/v1/orgs/:orgSlug/projects/:projectSlug/export", async (req, res, next) => {
  try {
    const session = requireSession(req);
    if (!session) return unauthorized(res);

    const access = await requireProjectAccess(
      req.params.orgSlug,
      req.params.projectSlug,
      session.userId!,
    );
    if ("error" in access) {
      if (access.error === "not_found") return notFound(res);
      return forbidden(res);
    }
    if (!canExport(access.role)) return forbidden(res);

    const localeRaw = typeof req.query.locale === "string" ? req.query.locale : null;
    const fileId = typeof req.query.fileId === "string" ? req.query.fileId : null;
    // mode: approved | top_voted | source | empty  (legacy fallback=empty|source)
    let mode: ExportMode = "source";
    if (typeof req.query.mode === "string") {
      const m = req.query.mode;
      if (m === "approved" || m === "top_voted" || m === "source" || m === "empty") mode = m;
    } else if (req.query.fallback === "empty") {
      mode = "empty";
    } else if (req.query.fallback === "false") {
      mode = "empty";
    }

    // pack: file (single) | zip | bundle — multi-file default zip
    let pack: ExportPack = "file";
    if (typeof req.query.pack === "string") {
      if (req.query.pack === "zip" || req.query.pack === "bundle" || req.query.pack === "file") {
        pack = req.query.pack;
      }
    }

    let filenameMode: ExportFilenameMode = "locale_suffix";
    if (req.query.filename === "original" || req.query.filename === "locale_suffix") {
      filenameMode = req.query.filename;
    }

    if (!localeRaw) return jsonError(res, "缺少 locale 参数");
    const localeParsed = localeSchema.safeParse(localeRaw);
    if (!localeParsed.success) return jsonError(res, t('无效语言代码'));
    const locale = localeParsed.data;

    const [lang] = await db
      .select()
      .from(projectLanguages)
      .where(
        and(eq(projectLanguages.projectId, access.project.id), eq(projectLanguages.locale, locale)),
      )
      .limit(1);
    if (!lang) return jsonError(res, "语言未在项目中启用");

    let files = await db
      .select({
        id: sourceFiles.id,
        path: sourceFiles.path,
        format: sourceFiles.format,
      })
      .from(sourceFiles)
      .where(eq(sourceFiles.projectId, access.project.id));

    if (fileId) {
      files = files.filter((f) => f.id === fileId);
      if (!files.length) return notFound(res, t('文件不存在'));
    }

    if (files.length === 0) return jsonError(res, "项目中没有源文件");

    // Multi-file: default to zip when pack not specified
    if (files.length > 1 && typeof req.query.pack !== "string") {
      pack = "zip";
    }
    // Single file with explicit pack=zip still zips; otherwise stream file body
    if (files.length === 1 && typeof req.query.pack !== "string") {
      pack = "file";
    }

    const payload = await buildProjectExport({
      files,
      locale,
      mode,
      pack,
      filenameMode,
      projectSlug: req.params.projectSlug,
    });

    if ("error" in payload) return jsonError(res, payload.error, 400);

    res.setHeader("Content-Type", payload.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${payload.downloadName.replace(/"/g, "")}"`,
    );
    res.setHeader("X-Export-Mode", payload.mode);
    res.setHeader("X-Export-Pack", payload.pack);
    res.setHeader("X-Export-Fidelity", payload.fidelity);
    return res.status(200).send(payload.body);
  } catch (err) {
    next(err);
  }
});
