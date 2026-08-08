import type { Response } from "express";
import { t } from "@/lib/i18n";

export function jsonOk<T>(res: Response, data: T, status = 200) {
  return res.status(status).json(data);
}

export function jsonCreated<T>(res: Response, data: T) {
  return res.status(201).json(data);
}

export function jsonError(res: Response, message: string, status = 400, code?: string) {
  return res.status(status).json({ error: message, code });
}

export function unauthorized(res: Response, message?: string) {
  return jsonError(res, message ?? t("未登录"), 401, "UNAUTHORIZED");
}

export function forbidden(res: Response, message?: string) {
  return jsonError(res, message ?? t("无权限"), 403, "FORBIDDEN");
}

export function notFound(res: Response, message?: string) {
  return jsonError(res, message ?? t("未找到"), 404, "NOT_FOUND");
}
