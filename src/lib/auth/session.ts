import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import type { Request, Response, NextFunction } from "express";
import { getEnv } from "@/lib/env";

export type SessionData = {
  userId?: string;
  username?: string;
  avatarUrl?: string;
  isLoggedIn: boolean;
};

export const defaultSession: SessionData = {
  isLoggedIn: false,
};

export type AppSession = IronSession<SessionData>;

export function isCookieSecure(): boolean {
  return getEnv().COOKIE_SECURE;
}

export function getSessionOptions(): SessionOptions {
  const env = getEnv();
  return {
    password: env.SESSION_SECRET,
    cookieName: "bloret_translation_session",
    cookieOptions: {
      secure: isCookieSecure(),
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 14, // 14 days
    },
  };
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session: AppSession;
    }
  }
}

export async function loadSession(req: Request, res: Response): Promise<AppSession> {
  return getIronSession<SessionData>(req, res, getSessionOptions());
}

export async function sessionMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    req.session = await loadSession(req, res);
    next();
  } catch (err) {
    next(err);
  }
}

export function requireSession(req: Request): AppSession | null {
  const session = req.session;
  if (!session?.isLoggedIn || !session.userId) return null;
  return session;
}
