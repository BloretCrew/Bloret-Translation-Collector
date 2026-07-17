import { Router } from "express";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { jsonOk, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const meRouter = Router();

meRouter.get("/v1/me", async (req, res, next) => {
  try {
    const session = requireSession(req);
    if (!session) return unauthorized(res);

    const [user] = await db.select().from(users).where(eq(users.id, session.userId!)).limit(1);
    if (!user) return unauthorized(res, "用户不存在");

    return jsonOk(res, {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
    });
  } catch (err) {
    next(err);
  }
});
