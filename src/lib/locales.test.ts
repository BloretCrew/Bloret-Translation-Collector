import { describe, expect, it } from "vitest";
import { localeLabel, localeOptionsWithExtras, localeShortLabel } from "./locales";

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
});
