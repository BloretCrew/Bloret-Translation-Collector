import { t } from "@/lib/i18n";
import { loadConfig } from "@/lib/config";
import { Logger } from "@/lib/logger";

export type MtResult =
  | { ok: true; text: string; provider: string }
  | { ok: false; error: string; code?: string };

/** Map BCP-47-ish codes to common MT codes */
function mtLang(code: string): string {
  const c = code.trim();
  if (!c || c === "auto") return "auto";
  const base = c.split(/[-_]/)[0]!.toLowerCase();
  return base || c;
}

/**
 * Call LibreTranslate-compatible API if enabled in config.json `mt`.
 * Body: { q, source, target, format, api_key? }
 */
export async function machineTranslate(params: {
  text: string;
  sourceLocale: string;
  targetLocale: string;
}): Promise<MtResult> {
  const text = params.text.trim();
  if (!text) return { ok: false, error: t('源文为空'), code: "EMPTY" };

  const cfg = loadConfig();
  const mt = cfg.mt;
  if (!mt?.enabled || !mt.endpoint) {
    return {
      ok: false,
      error: t('机器翻译未启用。请在 config.json 中配置 mt.enabled=true 与 mt.endpoint（LibreTranslate 兼容接口）。'),
      code: "DISABLED",
    };
  }

  const source = mtLang(mt.defaultSource || params.sourceLocale || "auto");
  const target = mtLang(params.targetLocale);
  if (!target || target === "auto") {
    return { ok: false, error: t('目标语言无效'), code: "BAD_TARGET" };
  }

  try {
    const body: Record<string, string> = {
      q: text,
      source: source === "auto" ? "auto" : source,
      target,
      format: "text",
    };
    if (mt.apiKey) body.api_key = mt.apiKey;

    const res = await fetch(mt.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let detail = res.statusText;
      try {
        const errBody = (await res.json()) as { error?: string };
        if (errBody.error) detail = errBody.error;
      } catch {
        /* */
      }
      Logger.warn("MT 请求失败:", res.status, detail);
      return { ok: false, error: `MT 服务错误: ${detail}`, code: "UPSTREAM" };
    }

    const data = (await res.json()) as { translatedText?: string; translation?: string };
    const out = (data.translatedText ?? data.translation ?? "").trim();
    if (!out) return { ok: false, error: t('MT 返回空结果'), code: "EMPTY_RESULT" };
    return { ok: true, text: out, provider: "libretranslate" };
  } catch (e) {
    Logger.error(t('MT 调用异常:'), e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : t('MT 网络错误'),
      code: "NETWORK",
    };
  }
}

export function isMtEnabled(): boolean {
  const mt = loadConfig().mt;
  return Boolean(mt?.enabled && mt.endpoint);
}
