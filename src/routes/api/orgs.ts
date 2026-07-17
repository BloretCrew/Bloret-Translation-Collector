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
  addMemberSchema,
  createOrgSchema,
  createProjectSchema,
  localeSchema,
  saveTranslationSchema,
  setLanguagesSchema,
  updateMemberSchema,
  updateOrgSchema,
  updateProjectSchema,
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
  exportFileLocale,
  getFileProgress,
  getProjectProgress,
  upsertSourceFile,
} from "@/lib/services/files";
import { Logger } from "@/lib/logger";

export const orgsRouter = Router();

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
        role: organizationMembers.role,
        createdAt: organizations.createdAt,
        projectCount: sql<number>`(
          select count(*)::int from ${projects} p where p.org_id = ${organizations.id}
        )`,
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

    const parsed = createOrgSchema.safeParse(req.body);
    if (!parsed.success) {
      return jsonError(res, parsed.error.errors[0]?.message ?? "参数错误");
    }

    const { name, slug, description } = parsed.data;

    try {
      const org = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(organizations)
          .values({
            name,
            slug,
            description: description ?? null,
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
      role: access.role,
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
    if (!canManageOrg(access.role)) return forbidden(res, "仅所有者可修改组织");

    const parsed = updateOrgSchema.safeParse(req.body);
    if (!parsed.success) return jsonError(res, parsed.error.errors[0]?.message ?? "参数错误");

    const [updated] = await db
      .update(organizations)
      .set({
        ...("name" in parsed.data ? { name: parsed.data.name } : {}),
        ...("description" in parsed.data
          ? { description: parsed.data.description ?? null }
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
    if (!parsed.success) return jsonError(res, parsed.error.errors[0]?.message ?? "参数错误");

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
    if (!parsed.success) return jsonError(res, parsed.error.errors[0]?.message ?? "参数错误");

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

    const list = await db
      .select()
      .from(projects)
      .where(eq(projects.orgId, access.org.id))
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

    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) return jsonError(res, parsed.error.errors[0]?.message ?? "参数错误");

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
          await tx.insert(projectLanguages).values(
            data.targetLocales.map((locale) => ({
              projectId: created!.id,
              locale,
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
      sourceLocale: access.project.sourceLocale,
      visibility: access.project.visibility,
      targetLocales: langs.filter((l) => l.enabled).map((l) => l.locale),
      role: access.role,
      org: { slug: access.org.slug, name: access.org.name },
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
    if (!parsed.success) return jsonError(res, parsed.error.errors[0]?.message ?? "参数错误");

    const [updated] = await db
      .update(projects)
      .set({
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description ?? null }
          : {}),
        ...(parsed.data.sourceLocale !== undefined
          ? { sourceLocale: parsed.data.sourceLocale }
          : {}),
        ...(parsed.data.visibility !== undefined ? { visibility: parsed.data.visibility } : {}),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, access.project.id))
      .returning();

    return jsonOk(res, updated);
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
    if (!parsed.success) return jsonError(res, parsed.error.errors[0]?.message ?? "参数错误");

    const locales = [...new Set(parsed.data.locales)];

    await db.transaction(async (tx) => {
      await tx.delete(projectLanguages).where(eq(projectLanguages.projectId, access.project.id));
      if (locales.length) {
        await tx.insert(projectLanguages).values(
          locales.map((locale) => ({
            projectId: access.project.id,
            locale,
            enabled: true,
          })),
        );
      }
    });

    return jsonOk(res, { locales });
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
    if (!parsed.success) return jsonError(res, parsed.error.errors[0]?.message ?? "参数错误");

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

      if (!file) return notFound(res, "文件不存在");

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

      if (!file) return notFound(res, "文件不存在");

      await db.delete(sourceFiles).where(eq(sourceFiles.id, file.id));
      return jsonOk(res, { ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// —— Strings ——
orgsRouter.get(
  "/v1/orgs/:orgSlug/projects/:projectSlug/files/:fileId/strings",
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
      if (!file) return notFound(res, "文件不存在");

      const locale = typeof req.query.locale === "string" ? req.query.locale : "";
      const status = typeof req.query.status === "string" ? req.query.status : null;
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const page = Math.max(1, Number(req.query.page ?? "1") || 1);
      const pageSize = Math.min(
        200,
        Math.max(1, Number(req.query.pageSize ?? "100") || 100),
      );
      const offset = (page - 1) * pageSize;

      const conditions = [eq(stringUnits.fileId, req.params.fileId), eq(stringUnits.orphaned, false)];

      if (q) {
        conditions.push(
          or(ilike(stringUnits.keyPath, `%${q}%`), ilike(stringUnits.sourceText, `%${q}%`))!,
        );
      }

      if (locale && status === "empty") {
        conditions.push(
          or(
            isNull(translations.id),
            eq(translations.status, "empty"),
            sql`coalesce(${translations.text}, '') = ''`,
          )!,
        );
      } else if (locale && status === "translated") {
        conditions.push(eq(translations.status, "translated"));
        conditions.push(sql`${translations.text} <> ''`);
      }

      const joinOn = and(
        eq(translations.stringId, stringUnits.id),
        locale ? eq(translations.locale, locale) : sql`false`,
      );

      const [countRow] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(stringUnits)
        .leftJoin(translations, joinOn)
        .where(and(...conditions));

      const rows = await db
        .select({
          id: stringUnits.id,
          keyPath: stringUnits.keyPath,
          sourceText: stringUnits.sourceText,
          sortOrder: stringUnits.sortOrder,
          translationText: translations.text,
          translationStatus: translations.status,
        })
        .from(stringUnits)
        .leftJoin(translations, joinOn)
        .where(and(...conditions))
        .orderBy(asc(stringUnits.sortOrder))
        .limit(pageSize)
        .offset(offset);

      return jsonOk(res, {
        locale,
        page,
        pageSize,
        total: Number(countRow?.total ?? 0),
        strings: rows.map((r) => ({
          id: r.id,
          keyPath: r.keyPath,
          sourceText: r.sourceText,
          translation: r.translationText ?? "",
          status: r.translationStatus ?? "empty",
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// —— Save translation ——
orgsRouter.put(
  "/v1/orgs/:orgSlug/projects/:projectSlug/strings/:stringId/translations/:locale",
  async (req, res, next) => {
    try {
      const session = requireSession(req);
      if (!session) return unauthorized(res);

      const localeParsed = localeSchema.safeParse(req.params.locale);
      if (!localeParsed.success) return jsonError(res, "无效语言代码");

      const access = await requireProjectAccess(
        req.params.orgSlug,
        req.params.projectSlug,
        session.userId!,
        "translator",
      );
      if ("error" in access) {
        if (access.error === "not_found") return notFound(res);
        return forbidden(res);
      }
      if (!canEditTranslations(access.role)) return forbidden(res);

      const locale = localeParsed.data;
      const stringId = req.params.stringId;

      const [lang] = await db
        .select()
        .from(projectLanguages)
        .where(
          and(
            eq(projectLanguages.projectId, access.project.id),
            eq(projectLanguages.locale, locale),
            eq(projectLanguages.enabled, true),
          ),
        )
        .limit(1);
      if (!lang) return jsonError(res, "语言未在项目中启用");

      const [unit] = await db
        .select({
          id: stringUnits.id,
          fileId: stringUnits.fileId,
          projectId: sourceFiles.projectId,
        })
        .from(stringUnits)
        .innerJoin(sourceFiles, eq(stringUnits.fileId, sourceFiles.id))
        .where(and(eq(stringUnits.id, stringId), eq(sourceFiles.projectId, access.project.id)))
        .limit(1);

      if (!unit) return notFound(res, "字符串不存在");

      const parsed = saveTranslationSchema.safeParse(req.body);
      if (!parsed.success) return jsonError(res, parsed.error.errors[0]?.message ?? "参数错误");

      const text = parsed.data.text;
      const status = text.trim().length > 0 ? ("translated" as const) : ("empty" as const);

      const [existing] = await db
        .select()
        .from(translations)
        .where(and(eq(translations.stringId, stringId), eq(translations.locale, locale)))
        .limit(1);

      let row;
      if (existing) {
        [row] = await db
          .update(translations)
          .set({
            text,
            status,
            updatedBy: session.userId!,
            updatedAt: new Date(),
          })
          .where(eq(translations.id, existing.id))
          .returning();
      } else {
        [row] = await db
          .insert(translations)
          .values({
            stringId,
            locale,
            text,
            status,
            updatedBy: session.userId!,
          })
          .returning();
      }

      return jsonOk(res, {
        id: row!.id,
        stringId,
        locale,
        text: row!.text,
        status: row!.status,
        updatedAt: row!.updatedAt,
      });
    } catch (err) {
      next(err);
    }
  },
);

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
    const fallback = req.query.fallback !== "empty";

    if (!localeRaw) return jsonError(res, "缺少 locale 参数");
    const localeParsed = localeSchema.safeParse(localeRaw);
    if (!localeParsed.success) return jsonError(res, "无效语言代码");
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
      .select()
      .from(sourceFiles)
      .where(eq(sourceFiles.projectId, access.project.id));

    if (fileId) {
      files = files.filter((f) => f.id === fileId);
      if (!files.length) return notFound(res, "文件不存在");
    }

    if (files.length === 0) return jsonError(res, "项目中没有源文件");

    if (files.length === 1) {
      const result = await exportFileLocale(files[0]!.id, locale, fallback);
      if (!result) return notFound(res);
      const filename = result.path.replace(/\.json$/i, "") + `.${locale}.json`;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.status(200).send(JSON.stringify(result.data, null, 2));
    }

    const bundle: Record<string, unknown> = {};
    for (const f of files) {
      const result = await exportFileLocale(f.id, locale, fallback);
      if (result) bundle[result.path] = result.data;
    }

    const filename = `${req.params.projectSlug}.${locale}.bundle.json`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(JSON.stringify(bundle, null, 2));
  } catch (err) {
    next(err);
  }
});
