/**
 * Bloret Image Host client (https://img.bloret.net/api/doc).
 * All app image uploads should go through this module.
 */
import { loadConfig } from "@/lib/config";
import { Logger } from "@/lib/logger";

export type ImageUploadResult = {
  /** Absolute original-image URL */
  url: string;
  /** Absolute WebP preview URL */
  webpUrl: string;
  timestamp: number;
  md5: string;
  filename: string;
};

type UploadApiResponse = {
  success?: boolean;
  message?: string;
  data?: {
    url?: string;
    webpUrl?: string;
    timestamp?: number;
    md5?: string;
    filename?: string;
  };
};

export function imageHostBaseUrl(): string {
  const base = loadConfig().imageHost?.baseUrl?.trim() || "https://img.bloret.net";
  return base.replace(/\/+$/, "");
}

/** Join host base with a path that may already be absolute. */
export function absoluteImageUrl(pathOrUrl: string, base = imageHostBaseUrl()): string {
  const raw = String(pathOrUrl || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return `${base.replace(/\/+$/, "")}${path}`;
}

/**
 * Prefer WebP preview for list/thumbnail display when the URL is an img host original.
 * Leaves foreign / already-.webp URLs unchanged.
 */
export function imagePreviewUrl(imageUrl: string): string {
  const url = String(imageUrl || "").trim();
  if (!url) return url;
  if (/\.webp($|\?)/i.test(url)) return url;
  try {
    const base = imageHostBaseUrl();
    if (url.startsWith(base) || url.includes("img.bloret.net")) {
      // Host pattern: /img/{ts}/{md5} → /img/{ts}/{md5}.webp
      return url.replace(/(\/img\/\d+\/[a-f0-9]+)(\?.*)?$/i, "$1.webp$2");
    }
  } catch {
    /* config unavailable in some tests */
  }
  return url;
}

/**
 * Upload image bytes to Bloret Image Host.
 * @see https://img.bloret.net/api/doc — POST /api/upload field `image`
 */
export async function uploadImageToHost(params: {
  buffer: Buffer;
  filename: string;
  contentType: string;
}): Promise<ImageUploadResult> {
  const base = imageHostBaseUrl();
  const endpoint = `${base}/api/upload`;

  const form = new FormData();
  const blob = new Blob([params.buffer], { type: params.contentType || "application/octet-stream" });
  form.append("image", blob, params.filename || "upload.bin");

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      body: form,
      // No Content-Type header — fetch sets multipart boundary.
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    Logger.error("image host upload network error:", e);
    throw new Error("图床上传失败：网络错误");
  }

  let body: UploadApiResponse = {};
  try {
    body = (await res.json()) as UploadApiResponse;
  } catch {
    throw new Error(`图床上传失败：无效响应 (${res.status})`);
  }

  if (!res.ok || !body.success || !body.data?.url) {
    const msg = body.message || `HTTP ${res.status}`;
    Logger.error("image host upload rejected:", msg);
    throw new Error(`图床上传失败：${msg}`);
  }

  const data = body.data;
  return {
    url: absoluteImageUrl(data.url!, base),
    webpUrl: absoluteImageUrl(data.webpUrl || `${data.url}.webp`, base),
    timestamp: Number(data.timestamp) || 0,
    md5: String(data.md5 || ""),
    filename: String(data.filename || params.filename),
  };
}

/** Map data-URL media subtype to MIME + extension. */
export function parseImageDataUrl(dataUrl: string): {
  ext: string;
  contentType: string;
  buffer: Buffer;
} | null {
  const m = /^data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl || "");
  if (!m) return null;
  const subtype = m[1]!.toLowerCase();
  const ext = subtype === "jpeg" ? "jpg" : subtype;
  const contentType =
    subtype === "jpg" || subtype === "jpeg"
      ? "image/jpeg"
      : subtype === "png"
        ? "image/png"
        : subtype === "gif"
          ? "image/gif"
          : "image/webp";
  try {
    const buffer = Buffer.from(m[2]!, "base64");
    if (!buffer.length) return null;
    return { ext, contentType, buffer };
  } catch {
    return null;
  }
}
