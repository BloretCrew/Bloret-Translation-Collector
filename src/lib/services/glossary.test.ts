import { describe, expect, it } from "vitest";
import { matchGlossaryTerms } from "./glossary";

describe("matchGlossaryTerms", () => {
  const terms = [
    {
      id: "1",
      sourceTerm: "账号",
      description: null,
      caseSensitive: false,
      translations: [{ locale: "en", translation: "account" }],
    },
    {
      id: "2",
      sourceTerm: "用户账号",
      description: "longer",
      caseSensitive: false,
      translations: [{ locale: "en", translation: "user account" }],
    },
    {
      id: "3",
      sourceTerm: "API",
      description: null,
      caseSensitive: true,
      translations: [{ locale: "en", translation: "API" }],
    },
  ];

  it("matches contained terms and prefers longer first", () => {
    const hits = matchGlossaryTerms(terms, "请登录用户账号", "en");
    expect(hits.map((h) => h.sourceTerm)).toEqual(["用户账号", "账号"]);
    expect(hits[0]!.translation).toBe("user account");
  });

  it("respects caseSensitive", () => {
    const hits = matchGlossaryTerms(terms, "call the api please", "en");
    expect(hits.some((h) => h.sourceTerm === "API")).toBe(false);
    const hits2 = matchGlossaryTerms(terms, "call the API please", "en");
    expect(hits2.some((h) => h.sourceTerm === "API")).toBe(true);
  });
});
