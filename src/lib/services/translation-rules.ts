import type { ProjectTranslationRules } from "@/lib/db/schema";

export type { ProjectTranslationRules };

/** CJK unified ideographs + common CJK punctuation / fullwidth forms used in body text. */
const CJK =
  "\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\u3000-\\u303f\\uff00-\\uffef";

const RE_CJK = new RegExp(`[${CJK}]`);
const RE_LATIN = /[A-Za-z]/;
const RE_DIGIT = /[0-9]/;

const MASK_PREFIX = "\uE000";
const MASK_SUFFIX = "\uE001";

/**
 * Protect common i18n placeholders / URLs / code spans so spacing rules
 * do not split them. Tokens use private-use characters unlikely in source text.
 */
function maskProtectedSegments(text: string): { masked: string; tokens: string[] } {
  const tokens: string[] = [];
  const patterns: RegExp[] = [
    // Mustache / double braces first
    /\{\{[^{}]+\}\}/g,
    // Single-brace placeholders incl. simple ICU: {name}, {0}, {count, plural, ...}
    /\{[^{}]+\}/g,
    // printf-style: %s, %d, %1$s, %.2f
    /%(?:\d+\$)?(?:\.\d+)?[sdifFeEgGxXoc%]/g,
    // Simple URLs
    /https?:\/\/[^\s<>"']+/gi,
    // Inline code
    /`[^`]+`/g,
  ];

  let masked = text;
  for (const re of patterns) {
    masked = masked.replace(re, (match) => {
      const idx = tokens.length;
      tokens.push(match);
      return `${MASK_PREFIX}${idx}${MASK_SUFFIX}`;
    });
  }
  return { masked, tokens };
}

function unmaskProtectedSegments(text: string, tokens: string[]): string {
  return text.replace(
    new RegExp(`${MASK_PREFIX}(\\d+)${MASK_SUFFIX}`, "g"),
    (_, idx: string) => tokens[Number(idx)] ?? "",
  );
}

function anyRuleEnabled(rules: ProjectTranslationRules | null | undefined): boolean {
  if (!rules) return false;
  return Boolean(rules.spaceCjkLatin || rules.spaceCjkDigit || rules.spaceLatinDigit);
}

/**
 * Insert a single ASCII space between two adjacent characters when a rule matches.
 * Idempotent: already-spaced pairs are left alone.
 */
function insertBoundarySpaces(
  text: string,
  shouldSpace: (left: string, right: string) => boolean,
): string {
  if (text.length < 2) return text;
  let out = text[0]!;
  for (let i = 1; i < text.length; i++) {
    const left = text[i - 1]!;
    const right = text[i]!;
    // Skip if already whitespace between (idempotent for prior spaces)
    if (shouldSpace(left, right) && left !== " " && right !== " " && !/\s/.test(left) && !/\s/.test(right)) {
      // Also skip when left is already a space we just inserted — handled by left check
      out += " ";
    }
    out += right;
  }
  return out;
}

function makeBoundaryChecker(rules: ProjectTranslationRules) {
  const cjkLatin = Boolean(rules.spaceCjkLatin);
  const cjkDigit = Boolean(rules.spaceCjkDigit);
  const latinDigit = Boolean(rules.spaceLatinDigit);

  return (left: string, right: string): boolean => {
    const leftCjk = RE_CJK.test(left);
    const rightCjk = RE_CJK.test(right);
    const leftLatin = RE_LATIN.test(left);
    const rightLatin = RE_LATIN.test(right);
    const leftDigit = RE_DIGIT.test(left);
    const rightDigit = RE_DIGIT.test(right);

    if (cjkLatin) {
      if ((leftCjk && rightLatin) || (leftLatin && rightCjk)) return true;
    }
    if (cjkDigit) {
      if ((leftCjk && rightDigit) || (leftDigit && rightCjk)) return true;
    }
    if (latinDigit) {
      if ((leftLatin && rightDigit) || (leftDigit && rightLatin)) return true;
    }
    return false;
  };
}

/**
 * Apply project translation formatting rules to suggestion text.
 * Does not trim; returns input unchanged when no rules are enabled.
 */
export function applyTranslationRules(
  text: string,
  rules: ProjectTranslationRules | null | undefined,
): string {
  if (!text || !anyRuleEnabled(rules)) return text;

  const { masked, tokens } = maskProtectedSegments(text);
  const spaced = insertBoundarySpaces(masked, makeBoundaryChecker(rules!));
  return unmaskProtectedSegments(spaced, tokens);
}

/** Normalize partial API/DB payloads into a full rules object (defaults false). */
export function normalizeTranslationRules(
  raw: unknown,
): ProjectTranslationRules {
  if (!raw || typeof raw !== "object") {
    return {
      spaceCjkLatin: false,
      spaceCjkDigit: false,
      spaceLatinDigit: false,
    };
  }
  const o = raw as Record<string, unknown>;
  return {
    spaceCjkLatin: o.spaceCjkLatin === true,
    spaceCjkDigit: o.spaceCjkDigit === true,
    spaceLatinDigit: o.spaceLatinDigit === true,
  };
}
