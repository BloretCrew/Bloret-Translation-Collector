/**
 * Common locales for pickers and display labels (zh UI).
 * Codes stay BCP-47-ish; labels are for humans.
 */
export type LocaleOption = {
  code: string;
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
  if (hit) return `${hit.label} (${hit.code})`;
  return code;
}

export function localeShortLabel(code: string | null | undefined): string {
  if (!code) return "";
  const hit = byCode.get(code.toLowerCase());
  if (hit) return hit.label;
  return code;
}

/** For EJS: merge known options with any project locales not in the catalog */
export function localeOptionsWithExtras(extraCodes: string[] = []): LocaleOption[] {
  const seen = new Set(COMMON_LOCALES.map((l) => l.code.toLowerCase()));
  const extras: LocaleOption[] = [];
  for (const raw of extraCodes) {
    const code = String(raw || "").trim();
    if (!code) continue;
    if (seen.has(code.toLowerCase())) continue;
    seen.add(code.toLowerCase());
    extras.push({ code, label: code });
  }
  return extras.length ? [...COMMON_LOCALES, ...extras] : COMMON_LOCALES;
}
