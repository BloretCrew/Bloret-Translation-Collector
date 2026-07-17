import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { requireProjectAccess } from "@/lib/access";
import { forbidden, jsonOk, notFound, unauthorized } from "@/lib/api";
import { db } from "@/lib/db";
import { projectLanguages } from "@/lib/db/schema";
import { getProjectProgress } from "@/lib/services/files";

type Ctx = { params: Promise<{ orgSlug: string; projectSlug: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const { orgSlug, projectSlug } = await ctx.params;

  const access = await requireProjectAccess(orgSlug, projectSlug, session.userId!);
  if ("error" in access) {
    if (access.error === "not_found") return notFound();
    return forbidden();
  }

  const langs = await db
    .select()
    .from(projectLanguages)
    .where(eq(projectLanguages.projectId, access.project.id));

  const progress = await getProjectProgress(access.project.id);
  const byLocaleMap = new Map(progress.byLocale.map((p) => [p.locale, p]));

  const merged = langs
    .filter((l) => l.enabled)
    .map((l) => {
      const p = byLocaleMap.get(l.locale);
      return {
        locale: l.locale,
        translated: p?.translated ?? 0,
        total: progress.totalStrings,
        percent:
          progress.totalStrings === 0
            ? 0
            : Math.round(((p?.translated ?? 0) / progress.totalStrings) * 100),
      };
    });

  return jsonOk({
    sourceLocale: access.project.sourceLocale,
    totalStrings: progress.totalStrings,
    languages: merged,
  });
}
