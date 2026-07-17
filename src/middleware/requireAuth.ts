import type { Request, Response, NextFunction } from "express";
import { requireSession } from "@/lib/auth/session";
import { unauthorized } from "@/lib/api";

/** Protect HTML pages under /app */
export function requirePageAuth(req: Request, res: Response, next: NextFunction) {
  const session = requireSession(req);
  if (!session) {
    const nextUrl = encodeURIComponent(req.originalUrl || "/app");
    return res.redirect(`/auth/login?next=${nextUrl}`);
  }
  next();
}

/** Protect JSON API under /api (except health) */
export function requireApiAuth(req: Request, res: Response, next: NextFunction) {
  const session = requireSession(req);
  if (!session) return unauthorized(res);
  next();
}
