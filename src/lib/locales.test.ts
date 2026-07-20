import { describe, expect, it } from "vitest";
import {
  languageLabel,
  languageShortLabel,
  localeLabel,
  localeOptionsWithExtras,
  localeShortLabel,
} from "./locales";

describe("locales", () => {
  it("labels known codes", () => {
    expect(localeLabel("zh-CN")).toContain("简体中文");
    expect(localeLabel("en")).toContain("英语");
    expect(localeShortLabel("ja")).toBe("日语");
  });

  it("falls back to raw code for unknown", () => {
    expect(localeLabel("xx-YY")).toBe("xx-YY");
  });

  it("merges extras into options", () => {
    const opts = localeOptionsWithExtras(["en", "custom-XX"]);
    expect(opts.some((o) => o.code === "en")).toBe(true);
    expect(opts.some((o) => o.code === "custom-XX")).toBe(true);
  });

  it("prefers project displayName for custom languages", () => {
    expect(languageShortLabel("gt", "赣语")).toBe("赣语");
    expect(languageLabel("gt", "赣语")).toBe("赣语 (gt)");
    expect(languageShortLabel("gt", null)).toBe("gt");
    expect(languageShortLabel("gt", "gt")).toBe("gt");
    expect(languageShortLabel("en", null)).toBe("英语");
    expect(languageShortLabel("en", "English")).toBe("English");
  });

  it("uses label map for extras", () => {
    const opts = localeOptionsWithExtras(["yue"], { yue: "粤语" });
    const hit = opts.find((o) => o.code === "yue");
    expect(hit?.label).toBe("粤语");
  });
});
