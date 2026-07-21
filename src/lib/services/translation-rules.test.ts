import { describe, expect, it } from "vitest";
import {
  applyTranslationRules,
  normalizeTranslationRules,
  type ProjectTranslationRules,
} from "./translation-rules";

const allOn: ProjectTranslationRules = {
  spaceCjkLatin: true,
  spaceCjkDigit: true,
  spaceLatinDigit: true,
};

describe("applyTranslationRules", () => {
  it("returns text unchanged when rules are off or empty", () => {
    expect(applyTranslationRules("你好world", null)).toBe("你好world");
    expect(applyTranslationRules("你好world", {})).toBe("你好world");
    expect(applyTranslationRules("你好world", { spaceCjkLatin: false })).toBe(
      "你好world",
    );
  });

  it("returns empty string as-is", () => {
    expect(applyTranslationRules("", allOn)).toBe("");
  });

  it("spaces CJK and Latin", () => {
    const rules = { spaceCjkLatin: true };
    expect(applyTranslationRules("你好world", rules)).toBe("你好 world");
    expect(applyTranslationRules("hello世界", rules)).toBe("hello 世界");
    expect(applyTranslationRules("测试Test完成", rules)).toBe("测试 Test 完成");
  });

  it("spaces CJK and digits", () => {
    const rules = { spaceCjkDigit: true };
    expect(applyTranslationRules("版本2", rules)).toBe("版本 2");
    expect(applyTranslationRules("3个文件", rules)).toBe("3 个文件");
  });

  it("spaces Latin and digits", () => {
    const rules = { spaceLatinDigit: true };
    expect(applyTranslationRules("iOS15", rules)).toBe("iOS 15");
    expect(applyTranslationRules("v2beta", rules)).toBe("v 2 beta");
  });

  it("is idempotent", () => {
    const once = applyTranslationRules("你好world版本2iOS15", allOn);
    const twice = applyTranslationRules(once, allOn);
    expect(twice).toBe(once);
    expect(once).toBe("你好 world 版本 2 iOS 15");
  });

  it("does not double-space already correct pairs", () => {
    expect(applyTranslationRules("你好 world", { spaceCjkLatin: true })).toBe(
      "你好 world",
    );
  });

  it("protects {name} and {0} placeholders", () => {
    const rules = { spaceCjkLatin: true, spaceCjkDigit: true };
    expect(applyTranslationRules("欢迎{name}回来", rules)).toBe("欢迎{name}回来");
    expect(applyTranslationRules("共{0}项", rules)).toBe("共{0}项");
    expect(applyTranslationRules("你好{name}world", rules)).toBe("你好{name}world");
  });

  it("protects printf and mustache placeholders", () => {
    const rules = { spaceCjkLatin: true, spaceLatinDigit: true };
    expect(applyTranslationRules("共%s个", { spaceCjkLatin: true, spaceCjkDigit: true })).toBe(
      "共%s个",
    );
    expect(applyTranslationRules("Hello%1$s世界", rules)).toBe("Hello%1$s世界");
    expect(applyTranslationRules("你好{{count}}个", { spaceCjkDigit: true })).toBe(
      "你好{{count}}个",
    );
  });

  it("protects URLs", () => {
    const rules = { spaceCjkLatin: true };
    expect(applyTranslationRules("见https://example.com/a文档", rules)).toBe(
      "见https://example.com/a文档",
    );
  });

  it("does not trim leading/trailing whitespace", () => {
    expect(applyTranslationRules("  你好world  ", { spaceCjkLatin: true })).toBe(
      "  你好 world  ",
    );
  });
});

describe("normalizeTranslationRules", () => {
  it("defaults all flags to false", () => {
    expect(normalizeTranslationRules(null)).toEqual({
      spaceCjkLatin: false,
      spaceCjkDigit: false,
      spaceLatinDigit: false,
    });
    expect(normalizeTranslationRules({ spaceCjkLatin: true, extra: 1 })).toEqual({
      spaceCjkLatin: true,
      spaceCjkDigit: false,
      spaceLatinDigit: false,
    });
  });
});
