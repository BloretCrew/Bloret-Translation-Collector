import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { sessionMiddleware } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { Logger } from "@/lib/logger";
import {
  COMMON_LOCALES,
  languageLabel,
  languageShortLabel,
  localeLabel,
  localeShortLabel,
} from "@/lib/locales";
import { authRouter } from "@/routes/auth";
import { apiRouter } from "@/routes/api";
import { pagesRouter } from "@/routes/pages";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

/** Bust long-lived browser caches after each process start (static maxAge is 1d). */
const ASSET_V = process.env.BTC_ASSET_V || String(Date.now());

export function createApp() {
  const app = express();
  const config = loadConfig();

  app.set("view engine", "ejs");
  app.set("views", path.join(root, "views"));
  app.set("trust proxy", 1);

  // 5mb: context screenshots still arrive as base64 before proxy upload to img.bloret.net
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ extended: false }));
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
    res.locals.isDev =
      process.env.NODE_ENV !== "production" || process.env.BTC_SHOW_DEV_LOGIN === "1";
    next();
  });

  app.use(express.static(path.join(root, "public"), { maxAge: "1d" }));
  // uploaded context screenshots
  app.use(
    "/uploads",
    express.static(path.join(root, "public", "uploads"), { maxAge: "7d" }),
  );

  app.use(authRouter);
  app.use("/api", apiRouter);
  app.use(pagesRouter);

  app.use((req, res) => {
    if (req.path.startsWith("/api/")) {
      return res.status(404).json({ error: "未找到", code: "NOT_FOUND" });
    }
    return res.status(404).render("404", { title: "未找到" });
  });

  app.use(
    (err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
      Logger.error(err instanceof Error ? err : String(err));
      const message = err instanceof Error ? err.message : "服务器错误";
      if (req.path.startsWith("/api/")) {
        return res.status(500).json({ error: message, code: "INTERNAL" });
      }
      return res.status(500).render("error", { title: "出错了", message });
    },
  );

  return app;
}
