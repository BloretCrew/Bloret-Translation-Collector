/**
 * Common locales for pickers and display labels.
 * Labels are Chinese source-as-key strings; call sites / helpers run t() at request time.
 */
import { t } from "@/lib/i18n";

export type LocaleOption = {
  code: string;
  /** Chinese source label (i18n key) */
  label: string;
};

export const COMMON_LOCALES: LocaleOption[] = [
  { code: "zh-CN", label: "简体中文" },
  { code: "zh-TW", label: "繁體中文" },
  { code: "en", label: "英语" },
  { code: "en-US", label: "英语（美国）" },
  { code: "en-GB", label: "英语（英国）" },
  { code: "ja", label: "日语" },
  { code: "ko", label: "韩语" },
  { code: "fr", label: "法语" },
  { code: "de", label: "德语" },
  { code: "es", label: "西班牙语" },
  { code: "pt", label: "葡萄牙语" },
  { code: "pt-BR", label: "葡萄牙语（巴西）" },
  { code: "ru", label: "俄语" },
  { code: "it", label: "意大利语" },
  { code: "vi", label: "越南语" },
  { code: "th", label: "泰语" },
  { code: "id", label: "印尼语" },
  { code: "ms", label: "马来语" },
  { code: "ar", label: "阿拉伯语" },
  { code: "hi", label: "印地语" },
  { code: "tr", label: "土耳其语" },
  { code: "pl", label: "波兰语" },
  { code: "nl", label: "荷兰语" },
  { code: "sv", label: "瑞典语" },
  { code: "uk", label: "乌克兰语" },
];

const byCode = new Map(COMMON_LOCALES.map((l) => [l.code.toLowerCase(), l]));

export function localeLabel(code: string | null | undefined): string {
  if (!code) return "";
  const hit = byCode.get(code.toLowerCase());
  if (hit) return `${t(hit.label)} (${hit.code})`;
  return code;
}

export function localeShortLabel(code: string | null | undefined): string {
  if (!code) return "";
  const hit = byCode.get(code.toLowerCase());
  if (hit) return t(hit.label);
  return code;
}

/**
 * Project-aware label: prefer stored displayName, then COMMON_LOCALES, then code.
 * Use for any UI that shows a project language (progress, export, editor, …).
 */
export function languageLabel(
  locale: string | null | undefined,
  displayName?: string | null,
  opts?: { withCode?: boolean },
): string {
  if (!locale) return t((displayName || "").trim()) || (displayName || "").trim();
  const custom = (displayName || "").trim();
  const known = byCode.get(locale.toLowerCase());
  const withCode = opts?.withCode !== false;

  // Known catalog locales always use i18n labels (ignore stored Chinese displayName).
  if (known) {
    const label = t(known.label);
    return withCode ? `${label} (${known.code})` : label;
  }

  // Custom / unknown locale: translate displayName when it is a source-as-key string.
  if (custom && custom.toLowerCase() !== locale.toLowerCase()) {
    const label = t(custom);
    return withCode ? `${label} (${locale})` : label;
  }
  // Custom locale without a usable display name — last resort is the code.
  return custom || locale;
}

export function languageShortLabel(
  locale: string | null | undefined,
  displayName?: string | null,
): string {
  return languageLabel(locale, displayName, { withCode: false });
}

/** For EJS: merge known options with any project locales not in the catalog */
export function localeOptionsWithExtras(
  extraCodes: string[] = [],
  labelByCode: Record<string, string | null | undefined> = {},
): LocaleOption[] {
  const seen = new Set(COMMON_LOCALES.map((l) => l.code.toLowerCase()));
  const extras: LocaleOption[] = [];
  for (const raw of extraCodes) {
    const code = String(raw || "").trim();
    if (!code) continue;
    if (seen.has(code.toLowerCase())) continue;
    seen.add(code.toLowerCase());
    const fromMap =
      labelByCode[code] ||
      labelByCode[code.toLowerCase()] ||
      Object.entries(labelByCode).find(([k]) => k.toLowerCase() === code.toLowerCase())?.[1];
    const label = t(((fromMap || "").trim() || code));
    extras.push({ code, label });
  }
  // Return copies with translated labels for current request
  const base = COMMON_LOCALES.map((l) => ({ code: l.code, label: t(l.label) }));
  return extras.length ? [...base, ...extras] : base;
}
