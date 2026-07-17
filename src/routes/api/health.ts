import { Router } from "express";
import { jsonOk } from "@/lib/api";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  return jsonOk(res, {
    status: "ok",
    service: "bloret-translation-collector",
    time: new Date().toISOString(),
  });
});
