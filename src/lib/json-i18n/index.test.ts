import { describe, expect, it } from "vitest";
import {
  flattenJson,
  unflattenEntries,
  exportWithStructure,
  parseJsonFile,
} from "./index";

describe("flattenJson", () => {
  it("flattens nested objects", () => {
    const { entries, warnings } = flattenJson({
      nav: { home: "Home", about: "About" },
      title: "App",
    });
    expect(warnings).toEqual([]);
    expect(entries.map((e) => e.keyPath)).toEqual(["nav.home", "nav.about", "title"]);
    expect(entries[0]?.sourceText).toBe("Home");
  });

  it("supports flat keys", () => {
    const { entries } = flattenJson({ "nav.home": "首页" });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.keyPath).toBe("nav.home");
  });

  it("warns on arrays and numbers", () => {
    const { entries, warnings } = flattenJson({
      ok: "yes",
      list: [1, 2],
      n: 3,
    });
    expect(entries).toHaveLength(1);
    expect(warnings.some((w) => w.includes("array"))).toBe(true);
    expect(warnings.some((w) => w.includes("number"))).toBe(true);
  });

  it("rejects non-object root", () => {
    const r = flattenJson(["a"]);
    expect(r.entries).toHaveLength(0);
    expect(r.warnings[0]).toMatch(/object/i);
  });
});

describe("unflattenEntries", () => {
  it("rebuilds nested structure", () => {
    const obj = unflattenEntries([
      { keyPath: "nav.home", text: "首页" },
      { keyPath: "nav.about", text: "关于" },
      { keyPath: "title", text: "应用" },
    ]);
    expect(obj).toEqual({
      nav: { home: "首页", about: "关于" },
      title: "应用",
    });
  });
});

describe("exportWithStructure", () => {
  it("replaces leaves with translations", () => {
    const source = { nav: { home: "Home" }, title: "App" };
    const map = new Map([
      ["nav.home", "首页"],
      ["title", "应用"],
    ]);
    expect(exportWithStructure(source, map)).toEqual({
      nav: { home: "首页" },
      title: "应用",
    });
  });

  it("falls back to source when missing", () => {
    const source = { a: "A", b: "B" };
    const map = new Map([["a", "甲"]]);
    expect(exportWithStructure(source, map, { fallbackToSource: true })).toEqual({
      a: "甲",
      b: "B",
    });
  });
});

describe("parseJsonFile", () => {
  it("parses valid object", () => {
    const r = parseJsonFile('{"x":"y"}');
    expect(r.error).toBeUndefined();
    expect(r.data).toEqual({ x: "y" });
  });

  it("errors on invalid JSON", () => {
    const r = parseJsonFile("{");
    expect(r.error).toBeTruthy();
  });
});
