import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import type { SessionData } from "@/lib/auth/session";

const PUBLIC_PATHS = ["/", "/auth/login", "/auth/callback", "/auth/logout", "/api/health"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith("/blora/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/favicon.ico") return true;
  return false;
}

/**
 * Middleware runs on Edge — cannot read config.json via fs.
 * scripts/run-start.mjs / start.sh inject SESSION_SECRET & COOKIE_SECURE from config.json.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const needsAuth =
    pathname.startsWith("/app") ||
    (pathname.startsWith("/api/") && pathname !== "/api/health");

  if (!needsAuth) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const sessionSecret =
    process.env.SESSION_SECRET ?? "dev-only-session-secret-change-me-32chars";

  const cookieSecure =
    process.env.COOKIE_SECURE === "true"
      ? true
      : process.env.COOKIE_SECURE === "false"
        ? false
        : process.env.NODE_ENV === "production";

  const session = await getIronSession<SessionData>(request, response, {
    password: sessionSecret,
    cookieName: "bloret_translation_session",
    cookieOptions: {
      secure: cookieSecure,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    },
  });

  if (!session.isLoggedIn || !session.userId) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "未登录", code: "UNAUTHORIZED" }, { status: 401 });
    }
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
