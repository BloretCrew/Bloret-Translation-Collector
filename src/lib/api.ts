import { NextResponse } from "next/server";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, { status: 200, ...init });
}

export function jsonCreated<T>(data: T) {
  return NextResponse.json(data, { status: 201 });
}

export function jsonError(message: string, status = 400, code?: string) {
  return NextResponse.json({ error: message, code }, { status });
}

export function unauthorized(message = "未登录") {
  return jsonError(message, 401, "UNAUTHORIZED");
}

export function forbidden(message = "无权限") {
  return jsonError(message, 403, "FORBIDDEN");
}

export function notFound(message = "未找到") {
  return jsonError(message, 404, "NOT_FOUND");
}
