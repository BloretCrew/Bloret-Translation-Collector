/**
 * Translation tasks: create, list mine, update status.
 */
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { applyConfigToProcessEnv } from "../config";
import { db } from "../db";
import {
  organizationMembers,
  organizations,
  projects,
  sourceFiles,
  stringUnits,
  users,
} from "../db/schema";
import {
  createTask,
  deleteTask,
  listMyTasks,
  listTasksForProject,
  updateTaskStatus,
} from "./tasks";

applyConfigToProcessEnv();

const cleanup: { userIds: string[]; orgIds: string[] } = { userIds: [], orgIds: [] };

afterAll(async () => {
  for (const id of cleanup.orgIds) {
    await db.delete(organizations).where(eq(organizations.id, id));
  }
  for (const id of cleanup.userIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describe("translation tasks", () => {
  it("assigns a string×locale and tracks status", async () => {
    const stamp = Date.now().toString(36);
    const [owner] = await db
      .insert(users)
      .values({ username: `task-owner-${stamp}` })
      .returning();
    const [assignee] = await db
      .insert(users)
      .values({ username: `task-assignee-${stamp}` })
      .returning();
    cleanup.userIds.push(owner!.id, assignee!.id);

    const [org] = await db
      .insert(organizations)
      .values({ name: "Task Org", slug: `task-org-${stamp}`, createdBy: owner!.id })
      .returning();
    cleanup.orgIds.push(org!.id);

    await db.insert(organizationMembers).values([
      { orgId: org!.id, userId: owner!.id, role: "owner" },
      { orgId: org!.id, userId: assignee!.id, role: "translator" },
    ]);

    const [project] = await db
      .insert(projects)
      .values({
        orgId: org!.id,
        slug: `tp-${stamp}`,
        name: "Tasks P",
        sourceLocale: "en",
        createdBy: owner!.id,
      })
      .returning();

    const [file] = await db
      .insert(sourceFiles)
      .values({
        projectId: project!.id,
        path: "ui.json",
        rawSource: { save: "Save" },
        updatedBy: owner!.id,
      })
      .returning();

    const [unit] = await db
      .insert(stringUnits)
      .values({
        fileId: file!.id,
        keyPath: "save",
        sourceText: "Save",
        sortOrder: 0,
      })
      .returning();

    const task = await createTask({
      projectId: project!.id,
      locale: "zh-CN",
      assigneeId: assignee!.id,
      createdBy: owner!.id,
      stringId: unit!.id,
      fileId: file!.id,
      note: "please translate",
    });
    expect(task.status).toBe("todo");

    const projectTasks = await listTasksForProject(project!.id, { locale: "zh-CN" });
    expect(projectTasks.some((t) => t.id === task.id)).toBe(true);

    const mine = await listMyTasks(assignee!.id, false);
    expect(mine.some((t) => t.id === task.id)).toBe(true);

    const forbidden = await updateTaskStatus(task.id, "doing", owner!.id, false);
    expect(forbidden.ok).toBe(false);

    const ok = await updateTaskStatus(task.id, "doing", assignee!.id, false);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.row.status).toBe("doing");

    const done = await updateTaskStatus(task.id, "done", owner!.id, true);
    expect(done.ok).toBe(true);

    const openMine = await listMyTasks(assignee!.id, false);
    expect(openMine.some((t) => t.id === task.id)).toBe(false);

    await deleteTask(task.id);
  });
});
