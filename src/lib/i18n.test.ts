import { describe, expect, it } from "vitest";
import {
  DEFAULT_LANG,
  SUPPORTED,
  detectLang,
  htmlLang,
  reload,
  t,
  translate,
} from "./i18n";

describe("i18n", () => {
  it("supports zh, en, ru", () => {
    expect(SUPPORTED).toContain("zh");
    expect(SUPPORTED).toContain("en");
    expect(SUPPORTED).toContain("ru");
    expect(DEFAULT_LANG).toBe("zh");
  });

  it("htmlLang maps codes", () => {
    expect(htmlLang("zh")).toBe("zh-CN");
    expect(htmlLang("en")).toBe("en");
    expect(htmlLang("ru")).toBe("ru");
  });

  it("detectLang prefers query then cookie then accept-language", () => {
    expect(detectLang({ query: { lang: "en" }, headers: {} })).toBe("en");
    expect(detectLang({ query: { lang: "ru" }, headers: {} })).toBe("ru");
    expect(
      detectLang({
        query: {},
        headers: { cookie: "btc_lang=ru; other=1" },
      }),
    ).toBe("ru");
    expect(
      detectLang({
        query: {},
        headers: { "accept-language": "ru-RU,ru;q=0.9" },
      }),
    ).toBe("ru");
    expect(detectLang({ query: {}, headers: {} })).toBe("zh");
  });

  it("translate falls back to key", () => {
    reload();
    const missing = "__no_such_key_xyz__";
    expect(translate(missing, "en")).toBe(missing);
    expect(t("未找到", "zh")).toBe("未找到");
  });
});
