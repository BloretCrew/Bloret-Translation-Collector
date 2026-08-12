import { t } from "@/lib/i18n";
import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { requireProjectAccess } from "@/lib/access";
import {
  forbidden,
  jsonCreated,
  jsonError,
  jsonOk,
  notFound,
  unauthorized,
} from "@/lib/api";
import { db } from "@/lib/db";
import { glossaryTerms, organizationMembers, users } from "@/lib/db/schema";
import { localeSchema } from "@/lib/validators/common";
import {
  canApproveTranslations,
  canManageProjects,
  canSuggestTranslations,
} from "@/lib/permissions/roles";
import {
  addLocaleAssignee,
  createGlossaryTerm,
  deleteGlossaryTerm,
  isLocaleAssignee,
  listGlossary,
  listLocaleAssignees,
  matchGlossaryTerms,
  removeLocaleAssignee,
  upsertGlossaryTranslation,
} from "@/lib/services/glossary";

export const glossaryRouter = Router();

const createTermSchema = z.object({
  sourceTerm: z.string().min(1).max(200),
  description: z.string().max(500).optional().nullable(),
  translations: z
    .array(
      z.object({
        locale: localeSchema,
        translation: z.string().min(1).max(500),
      }),
    )
    .optional(),
});

glossaryRouter.get(
  "/v1/orgs/:orgSlug/projects/:projectSlug/glossary",
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
      const locale = typeof req.query.locale === "string" ? req.query.locale : undefined;
      const terms = await listGlossary(access.project.id, locale);
      return jsonOk(res, { terms });
    } catch (err) {
      next(err);
    }
  },
);

/** Match glossary against a source string (for editor) */
glossaryRouter.get(
  "/v1/orgs/:orgSlug/projects/:projectSlug/glossary/match",
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
      const locale = typeof req.query.locale === "string" ? req.query.locale : "";
      const text = typeof req.query.text === "string" ? req.query.text : "";
      if (!locale) return jsonError(res, t('缺少 locale'));
      const terms = await listGlossary(access.project.id);
      const hits = matchGlossaryTerms(terms, text, locale);
      return jsonOk(res, { hits });
    } catch (err) {
      next(err);
    }
  },
);

glossaryRouter.post(
  "/v1/orgs/:orgSlug/projects/:projectSlug/glossary",
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
      // Translators and above may add glossary terms
      if (!canSuggestTranslations(access.role)) return forbidden(res);

      const parsed = createTermSchema.safeParse(req.body);
      if (!parsed.success) return jsonError(res, t(parsed.error.errors[0]?.message ?? '参数错误'));

      try {
        const term = await createGlossaryTerm({
          projectId: access.project.id,
          sourceTerm: parsed.data.sourceTerm,
          description: parsed.data.description,
          userId: session.userId!,
          translations: parsed.data.translations,
        });
        return jsonCreated(res, { id: term.id, sourceTerm: term.sourceTerm });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg.includes("unique") || msg.includes("duplicate")) {
          return jsonError(res, t('该源术语已存在'), 409);
        }
        if (msg === "empty_term") return jsonError(res, t('术语不能为空'));
        throw e;
      }
    } catch (err) {
      next(err);
    }
  },
);

glossaryRouter.put(
  "/v1/orgs/:orgSlug/projects/:projectSlug/glossary/:termId/translations/:locale",
  async (req, res, next) => {
    try {
      const session = requireSession(req);
      if (!session) return unauthorized(res);
      const localeParsed = localeSchema.safeParse(req.params.locale);
      if (!localeParsed.success) return jsonError(res, t('无效语言'));

      const access = await requireProjectAccess(
        req.params.orgSlug,
        req.params.projectSlug,
        session.userId!,
      );
      if ("error" in access) {
        if (access.error === "not_found") return notFound(res);
        return forbidden(res);
      }
      if (!canSuggestTranslations(access.role)) return forbidden(res);

      const translation =
        typeof req.body?.translation === "string" ? req.body.translation.trim() : "";
      if (!translation) return jsonError(res, t('译文不能为空'));

      const [term] = await db
        .select()
        .from(glossaryTerms)
        .where(
          and(
            eq(glossaryTerms.id, req.params.termId),
            eq(glossaryTerms.projectId, access.project.id),
          ),
        )
        .limit(1);
      if (!term) return notFound(res, t('术语不存在'));

      const row = await upsertGlossaryTranslation(term.id, localeParsed.data, translation);
      return jsonOk(res, row);
    } catch (err) {
      next(err);
    }
  },
);

glossaryRouter.delete(
  "/v1/orgs/:orgSlug/projects/:projectSlug/glossary/:termId",
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
      if (!canManageProjects(access.role)) return forbidden(res);

      const [term] = await db
        .select()
        .from(glossaryTerms)
        .where(
          and(
            eq(glossaryTerms.id, req.params.termId),
            eq(glossaryTerms.projectId, access.project.id),
          ),
        )
        .limit(1);
      if (!term) return notFound(res);
      await deleteGlossaryTerm(term.id);
      return jsonOk(res, { ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// —— Locale assignees ——
glossaryRouter.get(
  "/v1/orgs/:orgSlug/projects/:projectSlug/assignees",
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
      const locale = typeof req.query.locale === "string" ? req.query.locale : undefined;
      const assignees = await listLocaleAssignees(access.project.id, locale);
      return jsonOk(res, { assignees });
    } catch (err) {
      next(err);
    }
  },
);

glossaryRouter.post(
  "/v1/orgs/:orgSlug/projects/:projectSlug/assignees",
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
      if (!canManageProjects(access.role)) return forbidden(res);

      const localeParsed = localeSchema.safeParse(req.body?.locale);
      if (!localeParsed.success) return jsonError(res, t('无效语言'));
      const kind = req.body?.kind === "translator" ? "translator" : "proofreader";
      const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
      if (!username) return jsonError(res, t('请填写用户名'));

      const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
      if (!user) return jsonError(res, t('用户不存在，请先让对方登录或添加为组织成员'), 404);

      // must be org member
      const [mem] = await db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.orgId, access.org.id),
            eq(organizationMembers.userId, user.id),
          ),
        )
        .limit(1);
      if (!mem) return jsonError(res, t('用户不是本组织成员'), 400);

      const result = await addLocaleAssignee({
        projectId: access.project.id,
        locale: localeParsed.data,
        userId: user.id,
        kind,
      });
      if (!result.ok) return jsonError(res, t('该指派已存在'), 409);
      return jsonCreated(res, {
        id: result.row.id,
        locale: result.row.locale,
        userId: user.id,
        username: user.username,
        kind: result.row.kind,
      });
    } catch (err) {
      next(err);
    }
  },
);

glossaryRouter.delete(
  "/v1/orgs/:orgSlug/projects/:projectSlug/assignees/:assigneeId",
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
      if (!canManageProjects(access.role)) return forbidden(res);
      await removeLocaleAssignee(req.params.assigneeId);
      return jsonOk(res, { ok: true });
    } catch (err) {
      next(err);
    }
  },
);

/** Helper used by collaboration approve path */
export async function userCanApproveLocale(
  projectId: string,
  locale: string,
  userId: string,
  orgRole: Parameters<typeof canApproveTranslations>[0],
) {
  if (canApproveTranslations(orgRole)) return true;
  return isLocaleAssignee(projectId, locale, userId, "proofreader");
}
