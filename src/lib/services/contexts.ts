import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { stringContexts, users } from "@/lib/db/schema";

export async function listContexts(stringId: string) {
  return db
    .select({
      id: stringContexts.id,
      imageUrl: stringContexts.imageUrl,
      caption: stringContexts.caption,
      uploadedBy: stringContexts.uploadedBy,
      username: users.username,
      createdAt: stringContexts.createdAt,
    })
    .from(stringContexts)
    .leftJoin(users, eq(stringContexts.uploadedBy, users.id))
    .where(eq(stringContexts.stringId, stringId));
}

export async function addContext(params: {
  stringId: string;
  imageUrl: string;
  caption?: string | null;
  userId: string;
}) {
  const [row] = await db
    .insert(stringContexts)
    .values({
      stringId: params.stringId,
      imageUrl: params.imageUrl,
      caption: params.caption ?? null,
      uploadedBy: params.userId,
    })
    .returning();
  return row!;
}

export async function deleteContext(id: string) {
  await db.delete(stringContexts).where(eq(stringContexts.id, id));
}
