import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { verifyOAuthCode } from "@/lib/auth/passport";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.cookies.get("btc_oauth_next")?.value || "/app";

  if (!code) {
    // User denied or missing code
    return NextResponse.redirect(new URL("/?error=oauth_denied", request.url));
  }

  try {
    const profile = await verifyOAuthCode(code);
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, profile.username))
      .limit(1);

    if (!user) {
      [user] = await db
        .insert(users)
        .values({
          username: profile.username,
          avatarUrl: profile.avatar ?? null,
          lastLoginAt: new Date(),
        })
        .returning();
    } else {
      [user] = await db
        .update(users)
        .set({
          avatarUrl: profile.avatar ?? user.avatarUrl,
          lastLoginAt: new Date(),
        })
        .where(eq(users.id, user.id))
        .returning();
    }

    const session = await getSession();
    session.userId = user!.id;
    session.username = user!.username;
    session.avatarUrl = user!.avatarUrl ?? undefined;
    session.isLoggedIn = true;
    await session.save();

    const res = NextResponse.redirect(new URL(next, request.url));
    res.cookies.set("btc_oauth_next", "", { maxAge: 0, path: "/" });
    return res;
  } catch (err) {
    console.error("OAuth callback error:", err);
    const message = err instanceof Error ? encodeURIComponent(err.message) : "oauth_failed";
    return NextResponse.redirect(new URL(`/?error=${message}`, request.url));
  }
}
