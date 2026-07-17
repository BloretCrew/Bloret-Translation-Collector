import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { sessionMiddleware } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { authRouter } from "@/routes/auth";
import { apiRouter } from "@/routes/api";
import { pagesRouter } from "@/routes/pages";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

export function createApp() {
  const app = express();
  const config = loadConfig();

  app.set("view engine", "ejs");
  app.set("views", path.join(root, "views"));
  app.set("trust proxy", 1);

  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(sessionMiddleware);

  app.use((req, res, next) => {
    res.locals.appName = config.appName;
    res.locals.session = req.session?.isLoggedIn
      ? {
          isLoggedIn: true,
          userId: req.session.userId,
          username: req.session.username,
          avatarUrl: req.session.avatarUrl,
        }
      : { isLoggedIn: false };
    res.locals.path = req.path;
    next();
  });

  app.use(express.static(path.join(root, "public"), { maxAge: "1d" }));

  app.use(authRouter);
  app.use("/api", apiRouter);
  app.use(pagesRouter);

  app.use((req, res) => {
    if (req.path.startsWith("/api/")) {
      return res.status(404).json({ error: "未找到", code: "NOT_FOUND" });
    }
    return res.status(404).render("404", { title: "未找到" });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    const message = err instanceof Error ? err.message : "服务器错误";
    if (req.path.startsWith("/api/")) {
      return res.status(500).json({ error: message, code: "INTERNAL" });
    }
    return res.status(500).render("error", { title: "出错了", message });
  });

  return app;
}
