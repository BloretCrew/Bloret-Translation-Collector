import { Router } from "express";
import { eq } from "drizzle-orm";
import { getOAuthAuthorizeUrl, verifyOAuthCode } from "@/lib/auth/passport";
import { isPassportConfigured, getEnv } from "@/lib/env";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const authRouter = Router();

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function setCookie(
  res: import("express").Response,
  name: string,
  value: string,
  opts: { maxAgeSec: number; httpOnly?: boolean; secure?: boolean },
) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${opts.maxAgeSec}`,
  ];
  if (opts.httpOnly !== false) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", parts.join("; "));
  } else if (Array.isArray(existing)) {
    res.setHeader("Set-Cookie", [...existing, parts.join("; ")]);
  } else {
    res.setHeader("Set-Cookie", [String(existing), parts.join("; ")]);
  }
}

authRouter.get("/auth/login", async (req, res, next) => {
  try {
    const nextPath = typeof req.query.next === "string" ? req.query.next : "/app";

    if (isPassportConfigured()) {
      const url = getOAuthAuthorizeUrl();
      setCookie(res, "btc_oauth_next", nextPath, {
        maxAgeSec: 600,
        secure: getEnv().COOKIE_SECURE,
      });
      return res.redirect(url);
    }

    const allowDev = process.env.NODE_ENV !== "production" || req.query.dev !== undefined;
    if (!allowDev) {
      return res.status(503).json({
        error:
          "PassPort OAuth 未配置。请在 config.json 中填写 passport.appId / passport.appSecret，或使用 ?dev=1 开发登录。",
      });
    }

    const username =
      typeof req.query.user === "string" && req.query.user ? req.query.user : "dev-user";
    let [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (!user) {
      [user] = await db
        .insert(users)
        .values({ username, avatarUrl: null, lastLoginAt: new Date() })
        .returning();
    } else {
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    }

    req.session.userId = user!.id;
    req.session.username = user!.username;
    req.session.avatarUrl = user!.avatarUrl ?? undefined;
    req.session.isLoggedIn = true;
    await req.session.save();

    return res.redirect(nextPath);
  } catch (err) {
    next(err);
  }
});

authRouter.get("/auth/callback", async (req, res, next) => {
  try {
    const code = typeof req.query.code === "string" ? req.query.code : null;
    const nextPath = parseCookie(req.headers.cookie, "btc_oauth_next") || "/app";

    if (!code) {
      return res.redirect("/?error=oauth_denied");
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

      req.session.userId = user!.id;
      req.session.username = user!.username;
      req.session.avatarUrl = user!.avatarUrl ?? undefined;
      req.session.isLoggedIn = true;
      await req.session.save();

      setCookie(res, "btc_oauth_next", "", { maxAgeSec: 0, secure: getEnv().COOKIE_SECURE });
      return res.redirect(nextPath);
    } catch (err) {
      console.error("OAuth callback error:", err);
      const message = err instanceof Error ? encodeURIComponent(err.message) : "oauth_failed";
      return res.redirect(`/?error=${message}`);
    }
  } catch (err) {
    next(err);
  }
});

authRouter.get("/auth/logout", async (req, res, next) => {
  try {
    req.session.destroy();
    return res.redirect("/");
  } catch (err) {
    next(err);
  }
});
