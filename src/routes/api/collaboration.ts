import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { requireProjectAccess } from "@/lib/access";
import {
  forbidden,
  jsonError,
  jsonOk,
  notFound,
  unauthorized,
} from "@/lib/api";
import { db } from "@/lib/db";
import { sourceFiles, stringUnits, translationSuggestions } from "@/lib/db/schema";
import { localeSchema, saveSuggestionSchema } from "@/lib/validators/common";
import {
  canApproveTranslations,
  canSuggestTranslations,
  canVoteSuggestions,
} from "@/lib/permissions/roles";
import {
  approveSuggestion,
  deleteMySuggestion,
  listStringsWithWorkflow,
  listSuggestionsForString,
  toggleVote,
  unapproveLocale,
  upsertMySuggestion,
} from "@/lib/services/collaboration";

export const collaborationRouter = Router();

async function assertStringInProject(
  projectId: string,
  stringId: string,
) {
  const [unit] = await db
    .select({
      id: stringUnits.id,
      fileId: stringUnits.fileId,
      projectId: sourceFiles.projectId,
      keyPath: stringUnits.keyPath,
      sourceText: stringUnits.sourceText,
    })
    .from(stringUnits)
    .innerJoin(sourceFiles, eq(stringUnits.fileId, sourceFiles.id))
    .where(and(eq(stringUnits.id, stringId), eq(sourceFiles.projectId, projectId)))
    .limit(1);
  return unit ?? null;
}

// Override-style list used by editor (workflow-aware)
collaborationRouter.get(
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
      if (!locale) return jsonError(res, "缺少 locale");

      const status = typeof req.query.status === "string" ? req.query.status : null;
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const page = Math.max(1, Number(req.query.page ?? "1") || 1);
      const pageSize = Math.min(
        200,
        Math.max(1, Number(req.query.pageSize ?? "100") || 100),
      );

      const result = await listStringsWithWorkflow({
        fileId: file.id,
        locale,
        status,
        q,
        page,
        pageSize,
      });

      return jsonOk(res, {
        locale,
        page,
        pageSize,
        total: result.total,
        strings: result.strings,
      });
    } catch (err) {
      next(err);
    }
  },
);

// Detail: suggestions for one string × locale
collaborationRouter.get(
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
      );
      if ("error" in access) {
        if (access.error === "not_found") return notFound(res);
        return forbidden(res);
      }

      const unit = await assertStringInProject(access.project.id, req.params.stringId);
      if (!unit) return notFound(res, "字符串不存在");

      const data = await listSuggestionsForString(
        unit.id,
        localeParsed.data,
        session.userId!,
      );

      return jsonOk(res, {
        stringId: unit.id,
        keyPath: unit.keyPath,
        sourceText: unit.sourceText,
        locale: localeParsed.data,
        workflowStatus: data.workflowStatus,
        approvedSuggestionId: data.approvedSuggestionId,
        suggestions: data.suggestions,
        canSuggest: canSuggestTranslations(access.role),
        canVote: canVoteSuggestions(access.role),
        canApprove: canApproveTranslations(access.role),
      });
    } catch (err) {
      next(err);
    }
  },
);

// Submit / update my suggestion (also accept legacy PUT .../translations/:locale)
async function putSuggestion(req: import("express").Request, res: import("express").Response) {
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
  if (!canSuggestTranslations(access.role)) return forbidden(res);

  const unit = await assertStringInProject(access.project.id, req.params.stringId);
  if (!unit) return notFound(res, "字符串不存在");

  const parsed = saveSuggestionSchema.safeParse(req.body);
  if (!parsed.success) return jsonError(res, parsed.error.errors[0]?.message ?? "参数错误");

  const row = await upsertMySuggestion({
    stringId: unit.id,
    locale: localeParsed.data,
    userId: session.userId!,
    text: parsed.data.text,
  });

  return jsonOk(res, {
    id: row.id,
    stringId: unit.id,
    locale: localeParsed.data,
    text: row.text,
    updatedAt: row.updatedAt,
  });
}

collaborationRouter.put(
  "/v1/orgs/:orgSlug/projects/:projectSlug/strings/:stringId/suggestions/:locale",
  async (req, res, next) => {
    try {
      await putSuggestion(req, res);
    } catch (err) {
      next(err);
    }
  },
);

// Legacy path: treat as submit suggestion (collaboration-safe)
collaborationRouter.put(
  "/v1/orgs/:orgSlug/projects/:projectSlug/strings/:stringId/translations/:locale",
  async (req, res, next) => {
    try {
      await putSuggestion(req, res);
    } catch (err) {
      next(err);
    }
  },
);

collaborationRouter.delete(
  "/v1/orgs/:orgSlug/projects/:projectSlug/strings/:stringId/suggestions/:locale",
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
      if (!canSuggestTranslations(access.role)) return forbidden(res);

      const unit = await assertStringInProject(access.project.id, req.params.stringId);
      if (!unit) return notFound(res, "字符串不存在");

      const result = await deleteMySuggestion({
        stringId: unit.id,
        locale: localeParsed.data,
        userId: session.userId!,
      });
      if (!result.ok) {
        if (result.error === "approved") {
          return jsonError(res, "已批准的建议不能直接删除，请先取消批准", 409);
        }
        return notFound(res, "建议不存在");
      }
      return jsonOk(res, { ok: true });
    } catch (err) {
      next(err);
    }
  },
);

collaborationRouter.post(
  "/v1/orgs/:orgSlug/projects/:projectSlug/suggestions/:suggestionId/votes",
  async (req, res, next) => {
    try {
      const session = requireSession(req);
      if (!session) return unauthorized(res);

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
      if (!canVoteSuggestions(access.role)) return forbidden(res);

      const [s] = await db
        .select({
          id: translationSuggestions.id,
          stringId: translationSuggestions.stringId,
          projectId: sourceFiles.projectId,
        })
        .from(translationSuggestions)
        .innerJoin(stringUnits, eq(translationSuggestions.stringId, stringUnits.id))
        .innerJoin(sourceFiles, eq(stringUnits.fileId, sourceFiles.id))
        .where(eq(translationSuggestions.id, req.params.suggestionId))
        .limit(1);

      if (!s || s.projectId !== access.project.id) return notFound(res, "建议不存在");

      const result = await toggleVote(s.id, session.userId!);
      if (!result.ok) {
        if (result.error === "own") return jsonError(res, "不能给自己的建议投票");
        return notFound(res);
      }
      return jsonOk(res, { voted: result.voted });
    } catch (err) {
      next(err);
    }
  },
);

collaborationRouter.post(
  "/v1/orgs/:orgSlug/projects/:projectSlug/suggestions/:suggestionId/approve",
  async (req, res, next) => {
    try {
      const session = requireSession(req);
      if (!session) return unauthorized(res);

      const access = await requireProjectAccess(
        req.params.orgSlug,
        req.params.projectSlug,
        session.userId!,
        "proofreader",
      );
      if ("error" in access) {
        if (access.error === "not_found") return notFound(res);
        return forbidden(res);
      }
      if (!canApproveTranslations(access.role)) {
        return forbidden(res, "仅审核员及以上可批准译文");
      }

      const [s] = await db
        .select({
          id: translationSuggestions.id,
          projectId: sourceFiles.projectId,
        })
        .from(translationSuggestions)
        .innerJoin(stringUnits, eq(translationSuggestions.stringId, stringUnits.id))
        .innerJoin(sourceFiles, eq(stringUnits.fileId, sourceFiles.id))
        .where(eq(translationSuggestions.id, req.params.suggestionId))
        .limit(1);

      if (!s || s.projectId !== access.project.id) return notFound(res, "建议不存在");

      const result = await approveSuggestion(s.id, session.userId!);
      if (!result.ok) {
        if (result.error === "empty") return jsonError(res, "空建议无法批准");
        return notFound(res);
      }
      return jsonOk(res, {
        ok: true,
        stringId: result.suggestion.stringId,
        locale: result.suggestion.locale,
        text: result.suggestion.text,
      });
    } catch (err) {
      next(err);
    }
  },
);

collaborationRouter.post(
  "/v1/orgs/:orgSlug/projects/:projectSlug/strings/:stringId/translations/:locale/unapprove",
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
        "proofreader",
      );
      if ("error" in access) {
        if (access.error === "not_found") return notFound(res);
        return forbidden(res);
      }
      if (!canApproveTranslations(access.role)) {
        return forbidden(res, "仅审核员及以上可取消批准");
      }

      const unit = await assertStringInProject(access.project.id, req.params.stringId);
      if (!unit) return notFound(res, "字符串不存在");

      await unapproveLocale(unit.id, localeParsed.data);
      return jsonOk(res, { ok: true });
    } catch (err) {
      next(err);
    }
  },
);
