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
import {
  sourceFiles,
  stringUnits,
  suggestionComments,
  translationSuggestions,
} from "@/lib/db/schema";
import {
  localeSchema,
  saveSuggestionSchema,
  stringCommentSchema,
  suggestionCommentSchema,
} from "@/lib/validators/common";
import {
  canApproveTranslations,
  canManageProjects,
  canSuggestTranslations,
  canVoteSuggestions,
} from "@/lib/permissions/roles";
import {
  isLocaleAssignee,
  listGlossary,
  matchGlossaryTerms,
} from "@/lib/services/glossary";
import { lookupTranslationMemory } from "@/lib/services/tm";
import { listContexts } from "@/lib/services/contexts";
import { isMtEnabled } from "@/lib/services/mt";
import { lookupStringMt } from "@/lib/services/mt-file";
import {
  addComment,
  addSuggestionComment,
  approveAllSuggestionsByAuthor,
  approveSuggestion,
  deleteComment,
  deleteMySuggestion,
  deleteSuggestionComment,
  listComments,
  listEmojiShortcuts,
  listStringsWithWorkflow,
  listSuggestionComments,
  listSuggestionsForString,
  toggleReaction,
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
      if (!file) return notFound(res, t('文件不存在'));

      const locale = typeof req.query.locale === "string" ? req.query.locale : "";
      if (!locale) return jsonError(res, t('缺少 locale'));

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
      if (!localeParsed.success) return jsonError(res, t('无效语言代码'));

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
      if (!unit) return notFound(res, t('字符串不存在'));

      const data = await listSuggestionsForString(
        unit.id,
        localeParsed.data,
        session.userId!,
      );
      const comments = await listComments(unit.id, localeParsed.data);
      const glossary = await listGlossary(access.project.id);
      const glossaryHits = matchGlossaryTerms(
        glossary,
        unit.sourceText,
        localeParsed.data,
      );
      const tmHits = await lookupTranslationMemory({
        projectId: access.project.id,
        locale: localeParsed.data,
        sourceText: unit.sourceText,
        excludeStringId: unit.id,
        limit: 6,
      });
      const contexts = await listContexts(unit.id);
      const mtText = await lookupStringMt(
        access.project.id,
        unit.fileId,
        localeParsed.data,
        unit.keyPath,
      );

      const localeProofreader = await isLocaleAssignee(
        access.project.id,
        localeParsed.data,
        session.userId!,
        "proofreader",
      );
      const canApprove =
        canApproveTranslations(access.role) || localeProofreader;

      return jsonOk(res, {
        stringId: unit.id,
        keyPath: unit.keyPath,
        sourceText: unit.sourceText,
        locale: localeParsed.data,
        workflowStatus: data.workflowStatus,
        approvedSuggestionId: data.approvedSuggestionId,
        suggestions: data.suggestions,
        comments,
        glossaryHits,
        tmHits,
        contexts,
        /** Uploaded MT reference for this string × locale (sidebar). */
        mt: mtText ? { text: mtText } : null,
        mtEnabled: isMtEnabled(),
        sourceLocale: access.project.sourceLocale,
        viewerUsername: session.username ?? null,
        canSuggest: canSuggestTranslations(access.role),
        canVote: canVoteSuggestions(access.role),
        canApprove,
        canReact: true,
        canComment: true,
        canManage: canManageProjects(access.role),
      });
    } catch (err) {
      next(err);
    }
  },
);

/** Explicit TM lookup API */
collaborationRouter.get(
  "/v1/orgs/:orgSlug/projects/:projectSlug/tm",
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
      const exclude =
        typeof req.query.excludeStringId === "string" ? req.query.excludeStringId : undefined;
      if (!locale || !text) return jsonError(res, t('需要 locale 与 text'));
      const hits = await lookupTranslationMemory({
        projectId: access.project.id,
        locale,
        sourceText: text,
        excludeStringId: exclude,
      });
      return jsonOk(res, { hits });
    } catch (err) {
      next(err);
    }
  },
);

// Comments (discussion)
collaborationRouter.get(
  "/v1/orgs/:orgSlug/projects/:projectSlug/strings/:stringId/comments",
  async (req, res, next) => {
    try {
      const session = requireSession(req);
      if (!session) return unauthorized(res);
      const locale = typeof req.query.locale === "string" ? req.query.locale : "";
      const localeParsed = localeSchema.safeParse(locale);
      if (!localeParsed.success) return jsonError(res, t('缺少或无效 locale'));

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
      if (!unit) return notFound(res, t('字符串不存在'));

      const comments = await listComments(unit.id, localeParsed.data);
      return jsonOk(res, { comments });
    } catch (err) {
      next(err);
    }
  },
);

collaborationRouter.post(
  "/v1/orgs/:orgSlug/projects/:projectSlug/strings/:stringId/comments",
  async (req, res, next) => {
    try {
      const session = requireSession(req);
      if (!session) return unauthorized(res);
      const locale = typeof req.body?.locale === "string" ? req.body.locale : req.query.locale;
      const localeParsed = localeSchema.safeParse(locale);
      if (!localeParsed.success) return jsonError(res, t('缺少或无效 locale'));

      const access = await requireProjectAccess(
        req.params.orgSlug,
        req.params.projectSlug,
        session.userId!,
      );
      if ("error" in access) {
        if (access.error === "not_found") return notFound(res);
        return forbidden(res);
      }
      // viewers and above can discuss
      if (access.role === undefined) return forbidden(res);

      const unit = await assertStringInProject(access.project.id, req.params.stringId);
      if (!unit) return notFound(res, t('字符串不存在'));

      const parsed = stringCommentSchema.safeParse(req.body);
      if (!parsed.success) return jsonError(res, t(parsed.error.errors[0]?.message ?? '参数错误'));

      const result = await addComment({
        stringId: unit.id,
        locale: localeParsed.data,
        userId: session.userId!,
        body: parsed.data.body,
        parentId: parsed.data.parentId ?? null,
      });
      if (!result.ok) {
        if (result.error === "parent_not_found") return notFound(res, t('回复的评论不存在'));
        return jsonError(res, t('只能回复同一字符串下的评论'));
      }
      const row = result.row;
      return jsonCreated(res, {
        id: row.id,
        body: row.body,
        parentId: row.parentId,
        authorId: row.authorId,
        createdAt: row.createdAt,
      });
    } catch (err) {
      next(err);
    }
  },
);

collaborationRouter.delete(
  "/v1/orgs/:orgSlug/projects/:projectSlug/comments/:commentId",
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

      const result = await deleteComment(
        req.params.commentId,
        session.userId!,
        canManageProjects(access.role) || canApproveTranslations(access.role),
      );
      if (!result.ok) {
        if (result.error === "forbidden") return forbidden(res, t('只能删除自己的评论'));
        return notFound(res);
      }
      return jsonOk(res, { ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// Comments under a translation suggestion
collaborationRouter.get(
  "/v1/orgs/:orgSlug/projects/:projectSlug/suggestions/:suggestionId/comments",
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

      const [s] = await db
        .select({
          id: translationSuggestions.id,
          projectId: stringUnits.fileId,
        })
        .from(translationSuggestions)
        .innerJoin(stringUnits, eq(translationSuggestions.stringId, stringUnits.id))
        .innerJoin(sourceFiles, eq(stringUnits.fileId, sourceFiles.id))
        .where(
          and(
            eq(translationSuggestions.id, req.params.suggestionId),
            eq(sourceFiles.projectId, access.project.id),
          ),
        )
        .limit(1);
      if (!s) return notFound(res, t('建议不存在'));

      const comments = await listSuggestionComments(s.id);
      return jsonOk(res, { comments });
    } catch (err) {
      next(err);
    }
  },
);

collaborationRouter.post(
  "/v1/orgs/:orgSlug/projects/:projectSlug/suggestions/:suggestionId/comments",
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
      if (access.role === undefined) return forbidden(res);

      const [s] = await db
        .select({ id: translationSuggestions.id })
        .from(translationSuggestions)
        .innerJoin(stringUnits, eq(translationSuggestions.stringId, stringUnits.id))
        .innerJoin(sourceFiles, eq(stringUnits.fileId, sourceFiles.id))
        .where(
          and(
            eq(translationSuggestions.id, req.params.suggestionId),
            eq(sourceFiles.projectId, access.project.id),
          ),
        )
        .limit(1);
      if (!s) return notFound(res, t('建议不存在'));

      const parsed = suggestionCommentSchema.safeParse(req.body);
      if (!parsed.success) return jsonError(res, t(parsed.error.errors[0]?.message ?? '参数错误'));

      const result = await addSuggestionComment({
        suggestionId: s.id,
        userId: session.userId!,
        body: parsed.data.body,
        parentId: parsed.data.parentId ?? null,
      });
      if (!result.ok) {
        if (result.error === "parent_not_found") return notFound(res, t('回复的评论不存在'));
        return jsonError(res, t('只能回复同一建议下的评论'));
      }
      const row = result.row;
      return jsonCreated(res, {
        id: row.id,
        body: row.body,
        parentId: row.parentId,
        suggestionId: row.suggestionId,
        authorId: row.authorId,
        createdAt: row.createdAt,
      });
    } catch (err) {
      next(err);
    }
  },
);

collaborationRouter.delete(
  "/v1/orgs/:orgSlug/projects/:projectSlug/suggestion-comments/:commentId",
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

      // Ensure comment belongs to this project
      const [owned] = await db
        .select({ id: suggestionComments.id })
        .from(suggestionComments)
        .innerJoin(
          translationSuggestions,
          eq(suggestionComments.suggestionId, translationSuggestions.id),
        )
        .innerJoin(stringUnits, eq(translationSuggestions.stringId, stringUnits.id))
        .innerJoin(sourceFiles, eq(stringUnits.fileId, sourceFiles.id))
        .where(
          and(
            eq(suggestionComments.id, req.params.commentId),
            eq(sourceFiles.projectId, access.project.id),
          ),
        )
        .limit(1);
      if (!owned) return notFound(res);

      const result = await deleteSuggestionComment(
        req.params.commentId,
        session.userId!,
        canManageProjects(access.role) || canApproveTranslations(access.role),
      );
      if (!result.ok) {
        if (result.error === "forbidden") return forbidden(res, t('只能删除自己的评论'));
        return notFound(res);
      }
      return jsonOk(res, { ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// Submit / update my suggestion (also accept legacy PUT .../translations/:locale)
async function putSuggestion(req: import("express").Request, res: import("express").Response) {
  const session = requireSession(req);
  if (!session) return unauthorized(res);

  const orgSlug = String(req.params.orgSlug ?? "");
  const projectSlug = String(req.params.projectSlug ?? "");
  const stringId = String(req.params.stringId ?? "");
  const localeParsed = localeSchema.safeParse(req.params.locale);
  if (!localeParsed.success) return jsonError(res, t('无效语言代码'));

  const access = await requireProjectAccess(
    orgSlug,
    projectSlug,
    session.userId!,
    "translator",
  );
  if ("error" in access) {
    if (access.error === "not_found") return notFound(res);
    return forbidden(res);
  }
  if (!canSuggestTranslations(access.role)) return forbidden(res);

  const unit = await assertStringInProject(access.project.id, stringId);
  if (!unit) return notFound(res, t('字符串不存在'));

  const parsed = saveSuggestionSchema.safeParse(req.body);
  if (!parsed.success) return jsonError(res, t(parsed.error.errors[0]?.message ?? '参数错误'));

  const row = await upsertMySuggestion({
    stringId: unit.id,
    locale: localeParsed.data,
    userId: session.userId!,
    text: parsed.data.text,
    skipRules: parsed.data.skipRules === true,
    translationRules: access.project.translationRules,
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
      if (!localeParsed.success) return jsonError(res, t('无效语言代码'));

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
      if (!unit) return notFound(res, t('字符串不存在'));

      const result = await deleteMySuggestion({
        stringId: unit.id,
        locale: localeParsed.data,
        userId: session.userId!,
      });
      if (!result.ok) {
        if (result.error === "approved") {
          return jsonError(res, t('已批准的建议不能直接删除，请先取消批准'), 409);
        }
        return notFound(res, t('建议不存在'));
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

      if (!s || s.projectId !== access.project.id) return notFound(res, t('建议不存在'));

      const result = await toggleVote(s.id, session.userId!);
      if (!result.ok) {
        if (result.error === "own") return jsonError(res, t('不能给自己的建议投票'));
        return notFound(res);
      }
      return jsonOk(res, { voted: result.voted });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Toggle emoji reaction (BBS-style) on a suggestion, suggestion comment, or string comment.
 * Body: { type, targetId, emoji }
 */
collaborationRouter.post(
  "/v1/orgs/:orgSlug/projects/:projectSlug/react",
  async (req, res, next) => {
    try {
      const session = requireSession(req);
      if (!session) return unauthorized(res);
      if (!session.username) return unauthorized(res, t('请先登录'));

      const body = z
        .object({
          type: z.enum(["suggestion", "suggestion_comment", "string_comment"]),
          targetId: z.string().uuid(),
          emoji: z.string().min(1).max(32),
        })
        .safeParse(req.body ?? {});
      if (!body.success) return jsonError(res, t('无效的回应参数'));

      const access = await requireProjectAccess(
        req.params.orgSlug,
        req.params.projectSlug,
        session.userId!,
        "viewer",
      );
      if ("error" in access) {
        if (access.error === "not_found") return notFound(res);
        return forbidden(res);
      }

      const result = await toggleReaction({
        type: body.data.type,
        targetId: body.data.targetId,
        projectId: access.project.id,
        userId: session.userId!,
        username: session.username,
        emoji: body.data.emoji,
      });
      if (!result.ok) {
        if (result.error === "invalid_emoji") return jsonError(res, t('无效的表情'));
        return notFound(res);
      }
      return jsonOk(res, {
        ok: true,
        reactions: result.reactions,
        added: result.added,
      });
    } catch (err) {
      next(err);
    }
  },
);

collaborationRouter.get("/v1/me/emoji-shortcuts", async (req, res, next) => {
  try {
    const session = requireSession(req);
    const list = await listEmojiShortcuts(session?.userId ?? null);
    return jsonOk(res, { emojis: list });
  } catch (err) {
    next(err);
  }
});

collaborationRouter.post(
  "/v1/orgs/:orgSlug/projects/:projectSlug/suggestions/:suggestionId/approve",
  async (req, res, next) => {
    try {
      const session = requireSession(req);
      if (!session) return unauthorized(res);

      // Min role translator so locale proofreader assignees (org translator) can reach the check
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
      const [s] = await db
        .select({
          id: translationSuggestions.id,
          locale: translationSuggestions.locale,
          projectId: sourceFiles.projectId,
        })
        .from(translationSuggestions)
        .innerJoin(stringUnits, eq(translationSuggestions.stringId, stringUnits.id))
        .innerJoin(sourceFiles, eq(stringUnits.fileId, sourceFiles.id))
        .where(eq(translationSuggestions.id, req.params.suggestionId))
        .limit(1);

      if (!s || s.projectId !== access.project.id) return notFound(res, t('建议不存在'));

      const localeProofreader = await isLocaleAssignee(
        access.project.id,
        s.locale,
        session.userId!,
        "proofreader",
      );
      if (!canApproveTranslations(access.role) && !localeProofreader) {
        return forbidden(res, t('仅审核员、语言审核指派或管理员可批准译文'));
      }

      const result = await approveSuggestion(s.id, session.userId!);
      if (!result.ok) {
        if (result.error === "empty") return jsonError(res, t('空建议无法批准'));
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

/**
 * One-click approve: all non-empty suggestions by one author for a project × locale.
 * Body: { authorId: uuid, locale: string }
 */
collaborationRouter.post(
  "/v1/orgs/:orgSlug/projects/:projectSlug/suggestions/approve-all",
  async (req, res, next) => {
    try {
      const session = requireSession(req);
      if (!session) return unauthorized(res);

      const body = z
        .object({
          authorId: z.string().uuid(),
          locale: localeSchema,
        })
        .safeParse(req.body ?? {});
      if (!body.success) {
        return jsonError(res, t('请指定译者和目标语言'));
      }

      // Min role translator so locale proofreader assignees can reach the check
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

      const localeProofreader = await isLocaleAssignee(
        access.project.id,
        body.data.locale,
        session.userId!,
        "proofreader",
      );
      if (!canApproveTranslations(access.role) && !localeProofreader) {
        return forbidden(res, t('仅审核员、语言审核指派或管理员可批准译文'));
      }

      const result = await approveAllSuggestionsByAuthor({
        projectId: access.project.id,
        locale: body.data.locale,
        authorId: body.data.authorId,
        approverId: session.userId!,
      });

      return jsonOk(res, {
        ok: true,
        approved: result.approved,
        alreadyApproved: result.alreadyApproved,
        total: result.total,
        locale: body.data.locale,
        authorId: body.data.authorId,
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
      if (!localeParsed.success) return jsonError(res, t('无效语言代码'));

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

      const unit = await assertStringInProject(access.project.id, req.params.stringId);
      if (!unit) return notFound(res, t('字符串不存在'));

      const localeProofreader = await isLocaleAssignee(
        access.project.id,
        localeParsed.data,
        session.userId!,
        "proofreader",
      );
      if (!canApproveTranslations(access.role) && !localeProofreader) {
        return forbidden(res, t('仅审核员、语言审核指派或管理员可取消批准'));
      }

      await unapproveLocale(unit.id, localeParsed.data);
      return jsonOk(res, { ok: true });
    } catch (err) {
      next(err);
    }
  },
);
