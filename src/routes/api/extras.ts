import { Router } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
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
  organizationMembers,
  organizations,
  sourceFiles,
  stringUnits,
  users,
} from "@/lib/db/schema";
import { localeSchema } from "@/lib/validators/common";
import {
  canManageProjects,
  canSuggestTranslations,
  canUploadFiles,
} from "@/lib/permissions/roles";
import { machineTranslate, isMtEnabled } from "@/lib/services/mt";
import {
  createTask,
  deleteTask,
  listMyTasks,
  listTasksForProject,
  updateTaskStatus,
} from "@/lib/services/tasks";
import { addContext, deleteContext, listContexts } from "@/lib/services/contexts";
import { upsertMySuggestion } from "@/lib/services/collaboration";

export const extrasRouter = Router();

async function assertStringInProject(projectId: string, stringId: string) {
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

// —— Machine translation ——
extrasRouter.get("/v1/mt/status", async (req, res, next) => {
  try {
    if (!requireSession(req)) return unauthorized(res);
    return jsonOk(res, { enabled: isMtEnabled() });
  } catch (err) {
    next(err);
  }
});

extrasRouter.post(
  "/v1/orgs/:orgSlug/projects/:projectSlug/mt",
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
      if (!canSuggestTranslations(access.role)) return forbidden(res);

      const text = typeof req.body?.text === "string" ? req.body.text : "";
      const targetLocale =
        typeof req.body?.targetLocale === "string" ? req.body.targetLocale : "";
      const sourceLocale =
        typeof req.body?.sourceLocale === "string"
          ? req.body.sourceLocale
          : access.project.sourceLocale;
      const stringId = typeof req.body?.stringId === "string" ? req.body.stringId : null;
      const asSuggestion = req.body?.asSuggestion === true;

      const localeParsed = localeSchema.safeParse(targetLocale);
      if (!localeParsed.success) return jsonError(res, "无效目标语言");

      const result = await machineTranslate({
        text,
        sourceLocale,
        targetLocale: localeParsed.data,
      });
      if (!result.ok) {
        return jsonError(res, result.error, result.code === "DISABLED" ? 503 : 502, result.code);
      }

      let suggestionId: string | undefined;
      if (asSuggestion && stringId) {
        const unit = await assertStringInProject(access.project.id, stringId);
        if (unit) {
          const row = await upsertMySuggestion({
            stringId: unit.id,
            locale: localeParsed.data,
            userId: session.userId!,
            text: result.text,
          });
          suggestionId = row.id;
        }
      }

      return jsonOk(res, {
        text: result.text,
        provider: result.provider,
        suggestionId,
      });
    } catch (err) {
      next(err);
    }
  },
);

// —— Tasks ——
const createTaskSchema = z.object({
  locale: localeSchema,
  username: z.string().min(1).max(64),
  stringId: z.string().uuid().optional().nullable(),
  fileId: z.string().uuid().optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

extrasRouter.get("/v1/me/tasks", async (req, res, next) => {
  try {
    const session = requireSession(req);
    if (!session) return unauthorized(res);
    const includeDone = req.query.all === "1";
    const tasks = await listMyTasks(session.userId!, includeDone);
    const orgIds = [...new Set(tasks.map((t) => t.orgId).filter(Boolean))] as string[];
    const orgs =
      orgIds.length === 0
        ? []
        : await db
            .select({ id: organizations.id, slug: organizations.slug })
            .from(organizations)
            .where(inArray(organizations.id, orgIds));
    const slugByOrg = new Map(orgs.map((o) => [o.id, o.slug]));
    return jsonOk(res, {
      tasks: tasks.map((t) => ({
        ...t,
        orgSlug: slugByOrg.get(t.orgId) ?? "",
      })),
    });
  } catch (err) {
    next(err);
  }
});

extrasRouter.get(
  "/v1/orgs/:orgSlug/projects/:projectSlug/tasks",
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
      const mine = req.query.mine === "1";
      const tasks = await listTasksForProject(access.project.id, {
        locale,
        assigneeId: mine ? session.userId! : undefined,
      });
      return jsonOk(res, { tasks });
    } catch (err) {
      next(err);
    }
  },
);

extrasRouter.post(
  "/v1/orgs/:orgSlug/projects/:projectSlug/tasks",
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

      const parsed = createTaskSchema.safeParse(req.body);
      if (!parsed.success) return jsonError(res, parsed.error.errors[0]?.message ?? "参数错误");

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, parsed.data.username))
        .limit(1);
      if (!user) return jsonError(res, "用户不存在", 404);

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
      if (!mem) return jsonError(res, "用户不是本组织成员");

      if (parsed.data.stringId) {
        const unit = await assertStringInProject(access.project.id, parsed.data.stringId);
        if (!unit) return notFound(res, "字符串不存在");
      }

      const task = await createTask({
        projectId: access.project.id,
        locale: parsed.data.locale,
        assigneeId: user.id,
        createdBy: session.userId!,
        stringId: parsed.data.stringId,
        fileId: parsed.data.fileId,
        note: parsed.data.note,
      });
      return jsonCreated(res, task);
    } catch (err) {
      next(err);
    }
  },
);

extrasRouter.patch(
  "/v1/orgs/:orgSlug/projects/:projectSlug/tasks/:taskId",
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
      const status = req.body?.status;
      if (status !== "todo" && status !== "doing" && status !== "done") {
        return jsonError(res, "无效状态");
      }
      const result = await updateTaskStatus(
        req.params.taskId,
        status,
        session.userId!,
        canManageProjects(access.role),
      );
      if (!result.ok) {
        if (result.error === "forbidden") return forbidden(res);
        return notFound(res);
      }
      return jsonOk(res, result.row);
    } catch (err) {
      next(err);
    }
  },
);

extrasRouter.delete(
  "/v1/orgs/:orgSlug/projects/:projectSlug/tasks/:taskId",
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
      await deleteTask(req.params.taskId);
      return jsonOk(res, { ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// —— Context screenshots (base64 upload) ——
extrasRouter.get(
  "/v1/orgs/:orgSlug/projects/:projectSlug/strings/:stringId/contexts",
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
      const unit = await assertStringInProject(access.project.id, req.params.stringId);
      if (!unit) return notFound(res);
      const contexts = await listContexts(unit.id);
      return jsonOk(res, { contexts });
    } catch (err) {
      next(err);
    }
  },
);

extrasRouter.post(
  "/v1/orgs/:orgSlug/projects/:projectSlug/strings/:stringId/contexts",
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
      if (!canUploadFiles(access.role) && !canSuggestTranslations(access.role)) {
        return forbidden(res);
      }

      const unit = await assertStringInProject(access.project.id, req.params.stringId);
      if (!unit) return notFound(res);

      const dataUrl = typeof req.body?.imageBase64 === "string" ? req.body.imageBase64 : "";
      const caption = typeof req.body?.caption === "string" ? req.body.caption : null;
      const m = /^data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
      if (!m) return jsonError(res, "请上传 data URL 格式的图片 (png/jpg/gif/webp)");

      const ext = m[1]!.toLowerCase().replace("jpeg", "jpg");
      const buf = Buffer.from(m[2]!, "base64");
      if (buf.length > 3 * 1024 * 1024) return jsonError(res, "图片不能超过 3MB");

      const dir = join(process.cwd(), "public", "uploads", "contexts");
      mkdirSync(dir, { recursive: true });
      const name = `${randomBytes(12).toString("hex")}.${ext}`;
      writeFileSync(join(dir, name), buf);
      const imageUrl = `/uploads/contexts/${name}`;

      const row = await addContext({
        stringId: unit.id,
        imageUrl,
        caption,
        userId: session.userId!,
      });
      return jsonCreated(res, row);
    } catch (err) {
      next(err);
    }
  },
);

extrasRouter.delete(
  "/v1/orgs/:orgSlug/projects/:projectSlug/contexts/:contextId",
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
      if (!canManageProjects(access.role) && !canUploadFiles(access.role)) {
        return forbidden(res);
      }
      await deleteContext(req.params.contextId);
      return jsonOk(res, { ok: true });
    } catch (err) {
      next(err);
    }
  },
);
