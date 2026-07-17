import { requireSession } from "@/lib/auth/session";
import { jsonOk, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();

  const [user] = await db.select().from(users).where(eq(users.id, session.userId!)).limit(1);
  if (!user) return unauthorized("用户不存在");

  return jsonOk({
    id: user.id,
    username: user.username,
    avatarUrl: user.avatarUrl,
  });
}
