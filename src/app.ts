import compression from "compression";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { computeAssetV } from "@/lib/asset-v";
import { sessionMiddleware } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { t, i18nMiddleware } from "@/lib/i18n";
import { Logger } from "@/lib/logger";
import {
  COMMON_LOCALES,
  languageLabel,
  languageShortLabel,
  localeLabel,
  localeShortLabel,
} from "@/lib/locales";
import { sfIcon, sfIconUrl } from "@/lib/sf-icon";
import { authRouter } from "@/routes/auth";
import { apiRouter } from "@/routes/api";
import { pagesRouter } from "@/routes/pages";
import { sfIconsRouter } from "@/routes/sf-icons";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

/** Stable across restarts when public assets unchanged (see computeAssetV). */
const ASSET_V = computeAssetV();

export function createApp() {
  const app = express();
  const config = loadConfig();

  app.set("view engine", "ejs");
  app.set("views", path.join(root, "views"));
  app.set("trust proxy", 1);
  // Skip etag on HTML so dynamic pages aren't 304'd with stale session UI
  app.set("etag", "weak");

  // Gzip/brotli-friendly transfer for HTML, CSS, JS (big win for blora.css ~127KB)
  app.use(
    compression({
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers["x-no-compression"]) return false;
        return compression.filter(req, res);
      },
    }),
  );

  // 5mb: context screenshots still arrive as base64 before proxy upload to img.bloret.net
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(i18nMiddleware());
  app.use(sessionMiddleware);

  // CONSOLE-LOG-SPEC: request access log
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      Logger.request(req, res, Date.now() - start);
    });
    next();
  });

  app.use((req, res, next) => {
    res.locals.appName = config.appName;
    res.locals.assetV = ASSET_V;
    res.locals.session = req.session?.isLoggedIn
      ? {
          isLoggedIn: true,
          userId: req.session.userId,
          username: req.session.username,
          avatarUrl: req.session.avatarUrl,
        }
      : { isLoggedIn: false };
    res.locals.path = req.path;
    res.locals.COMMON_LOCALES = COMMON_LOCALES;
    res.locals.localeLabel = localeLabel;
    res.locals.localeShortLabel = localeShortLabel;
    res.locals.languageLabel = languageLabel;
    res.locals.languageShortLabel = languageShortLabel;
    /** SF Symbols via same-origin /sf/{name} (proxy) — use <%- sfIcon('name') %> */
    res.locals.sfIcon = sfIcon;
    res.locals.sfIconUrl = sfIconUrl;
    res.locals.isDev =
      process.env.NODE_ENV !== "production" || process.env.BTC_SHOW_DEV_LOGIN === "1";
    next();
  });

  app.use(
    express.static(path.join(root, "public"), {
      maxAge: "7d",
      etag: true,
      lastModified: true,
      // versioned ?v= assets can be treated as immutable by the browser
      setHeaders(res, filePath) {
        if (/\.(?:css|js|svg|woff2?|png|jpg|webp|ico)$/i.test(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
        }
      },
    }),
  );
  // uploaded context screenshots
  app.use(
    "/uploads",
    express.static(path.join(root, "public", "uploads"), { maxAge: "7d" }),
  );

  // SF Symbols same-origin proxy (CSS mask needs non-tainted images)
  app.use(sfIconsRouter);

  app.use(authRouter);
  app.use("/api", apiRouter);
  app.use(pagesRouter);

  app.use((req, res) => {
    if (req.path.startsWith("/api/")) {
      return res.status(404).json({ error: t("未找到"), code: "NOT_FOUND" });
    }
    return res.status(404).render("404", { title: t("未找到") });
  });

  app.use(
    (err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
      Logger.error(err instanceof Error ? err : String(err));
      const message = err instanceof Error ? err.message : t("服务器错误");
      if (req.path.startsWith("/api/")) {
        return res.status(500).json({ error: message, code: "INTERNAL" });
      }
      return res.status(500).render("error", { title: t("出错了"), message });
    },
  );

  return app;
}
