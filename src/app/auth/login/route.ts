import { NextRequest, NextResponse } from "next/server";
import { getOAuthAuthorizeUrl } from "@/lib/auth/passport";
import { isPassportConfigured } from "@/lib/env";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Production: redirect to PassPort OAuth.
 * Dev fallback: if OAuth not configured and ?dev=1, create a local session.
 */
export async function GET(request: NextRequest) {
  const next = request.nextUrl.searchParams.get("next") || "/app";

  if (isPassportConfigured()) {
    const url = getOAuthAuthorizeUrl();
    const res = NextResponse.redirect(url);
    // stash next path briefly
    res.cookies.set("btc_oauth_next", next, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return res;
  }

  // Dev login when Passport not configured
  const allowDev = process.env.NODE_ENV !== "production" || request.nextUrl.searchParams.has("dev");
  if (!allowDev) {
    return NextResponse.json(
      { error: "PassPort OAuth 未配置。请在 config.json 中填写 passport.appId / passport.appSecret，或使用 ?dev=1 开发登录。" },
      { status: 503 },
    );
  }

  const username = request.nextUrl.searchParams.get("user") || "dev-user";
  let [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!user) {
    [user] = await db
      .insert(users)
      .values({ username, avatarUrl: null, lastLoginAt: new Date() })
      .returning();
  } else {
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  }

  const session = await getSession();
  session.userId = user!.id;
  session.username = user!.username;
  session.avatarUrl = user!.avatarUrl ?? undefined;
  session.isLoggedIn = true;
  await session.save();

  return NextResponse.redirect(new URL(next, request.url));
}
