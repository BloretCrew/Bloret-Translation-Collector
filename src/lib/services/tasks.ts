import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  projects,
  sourceFiles,
  stringUnits,
  translationTasks,
  users,
} from "@/lib/db/schema";

export async function listTasksForProject(projectId: string, filters?: {
  locale?: string;
  assigneeId?: string;
  status?: string;
}) {
  const conditions = [eq(translationTasks.projectId, projectId)];
  if (filters?.locale) conditions.push(eq(translationTasks.locale, filters.locale));
  if (filters?.assigneeId) conditions.push(eq(translationTasks.assigneeId, filters.assigneeId));
  if (filters?.status === "todo" || filters?.status === "doing" || filters?.status === "done") {
    conditions.push(eq(translationTasks.status, filters.status));
  }

  return db
    .select({
      id: translationTasks.id,
      locale: translationTasks.locale,
      stringId: translationTasks.stringId,
      fileId: translationTasks.fileId,
      assigneeId: translationTasks.assigneeId,
      status: translationTasks.status,
      note: translationTasks.note,
      createdAt: translationTasks.createdAt,
      updatedAt: translationTasks.updatedAt,
      assigneeUsername: users.username,
      keyPath: stringUnits.keyPath,
      sourceText: stringUnits.sourceText,
      filePath: sourceFiles.path,
    })
    .from(translationTasks)
    .innerJoin(users, eq(translationTasks.assigneeId, users.id))
    .leftJoin(stringUnits, eq(translationTasks.stringId, stringUnits.id))
    .leftJoin(sourceFiles, eq(translationTasks.fileId, sourceFiles.id))
    .where(and(...conditions))
    .orderBy(desc(translationTasks.updatedAt));
}

export async function listMyTasks(userId: string, includeDone = false) {
  const conditions = [eq(translationTasks.assigneeId, userId)];
  if (!includeDone) {
    conditions.push(sql`${translationTasks.status} <> 'done'`);
  }
  return db
    .select({
      id: translationTasks.id,
      locale: translationTasks.locale,
      stringId: translationTasks.stringId,
      fileId: translationTasks.fileId,
      status: translationTasks.status,
      note: translationTasks.note,
      projectId: translationTasks.projectId,
      projectSlug: projects.slug,
      projectName: projects.name,
      orgId: projects.orgId,
      keyPath: stringUnits.keyPath,
      sourceText: stringUnits.sourceText,
      filePath: sourceFiles.path,
      updatedAt: translationTasks.updatedAt,
    })
    .from(translationTasks)
    .innerJoin(projects, eq(translationTasks.projectId, projects.id))
    .leftJoin(stringUnits, eq(translationTasks.stringId, stringUnits.id))
    .leftJoin(sourceFiles, eq(translationTasks.fileId, sourceFiles.id))
    .where(and(...conditions))
    .orderBy(desc(translationTasks.updatedAt));
}

export async function createTask(params: {
  projectId: string;
  locale: string;
  assigneeId: string;
  createdBy: string;
  stringId?: string | null;
  fileId?: string | null;
  note?: string | null;
}) {
  const [row] = await db
    .insert(translationTasks)
    .values({
      projectId: params.projectId,
      locale: params.locale,
      assigneeId: params.assigneeId,
      createdBy: params.createdBy,
      stringId: params.stringId ?? null,
      fileId: params.fileId ?? null,
      note: params.note ?? null,
      status: "todo",
    })
    .returning();
  return row!;
}

export async function updateTaskStatus(
  taskId: string,
  status: "todo" | "doing" | "done",
  actorId: string,
  canManage: boolean,
) {
  const [task] = await db
    .select()
    .from(translationTasks)
    .where(eq(translationTasks.id, taskId))
    .limit(1);
  if (!task) return { ok: false as const, error: "not_found" as const };
  if (task.assigneeId !== actorId && !canManage) {
    return { ok: false as const, error: "forbidden" as const };
  }
  const [row] = await db
    .update(translationTasks)
    .set({ status, updatedAt: new Date() })
    .where(eq(translationTasks.id, taskId))
    .returning();
  return { ok: true as const, row: row! };
}

export async function deleteTask(taskId: string) {
  await db.delete(translationTasks).where(eq(translationTasks.id, taskId));
}
