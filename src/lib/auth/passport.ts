import { getEnv } from "@/lib/env";

export type PassportUser = {
  username: string;
  avatar?: string;
  email?: string;
  admin?: boolean;
  tags?: string[];
  apptoken?: string;
};

export function getOAuthAuthorizeUrl(): string {
  const env = getEnv();
  const url = new URL("/app/oauth", env.PASSPORT_BASE_URL);
  url.searchParams.set("app_id", env.PASSPORT_APP_ID);
  url.searchParams.set("redirect_uri", env.OAUTH_REDIRECT_URI);
  return url.toString();
}

export async function verifyOAuthCode(code: string): Promise<PassportUser> {
  const env = getEnv();
  if (!env.PASSPORT_APP_ID || !env.PASSPORT_APP_SECRET) {
    throw new Error("PassPort OAuth is not configured");
  }

  const url = new URL("/app/verify", env.PASSPORT_BASE_URL);
  url.searchParams.set("app_id", env.PASSPORT_APP_ID);
  url.searchParams.set("app_secret", env.PASSPORT_APP_SECRET);
  url.searchParams.set("code", code);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    let message = "Failed to verify OAuth code";
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const data = (await res.json()) as PassportUser;
  if (!data.username) {
    throw new Error("PassPort response missing username");
  }
  return data;
}
