import { describe, expect, it } from "vitest";
import {
  detectJsonFormatMeta,
  serializeJson,
  jsonHandler,
  propertiesHandler,
  inferFormatFromPath,
  localeSuffixPath,
  buildZip,
} from "./index";

describe("detectJsonFormatMeta", () => {
  it("detects 2-space indent and trailing newline", () => {
    const raw = '{\n  "a": "1",\n  "b": "2"\n}\n';
    const meta = detectJsonFormatMeta(raw);
    expect(meta.indent).toBe(2);
    expect(meta.trailingNewline).toBe(true);
    expect(meta.newline).toBe("\n");
  });

  it("detects minified", () => {
    const meta = detectJsonFormatMeta('{"a":"1","b":"2"}');
    expect(meta.indent).toBe(0);
    expect(meta.trailingNewline).toBe(false);
  });

  it("detects tab indent", () => {
    const raw = '{\n\t"a": "1"\n}\n';
    expect(detectJsonFormatMeta(raw).indent).toBe("\t");
  });

  it("detects CRLF", () => {
    const raw = '{\r\n  "a": "1"\r\n}\r\n';
    const meta = detectJsonFormatMeta(raw);
    expect(meta.newline).toBe("\r\n");
    expect(meta.indent).toBe(2);
  });
});

describe("serializeJson fidelity", () => {
  it("round-trips structure with translations while keeping indent", () => {
    const raw = '{\n  "nav": {\n    "home": "Home"\n  },\n  "title": "App"\n}\n';
    const parsed = jsonHandler.parse(raw);
    expect(parsed.error).toBeUndefined();
    const map = new Map([
      ["nav.home", "首页"],
      ["title", "应用"],
    ]);
    const out = jsonHandler.export(raw, parsed.data, map, parsed.formatMeta, {
      fallbackToSource: true,
    });
    expect(out).toBe('{\n  "nav": {\n    "home": "首页"\n  },\n  "title": "应用"\n}\n');
  });

  it("preserves key order from raw content", () => {
    const raw = '{\n  "z": "Z",\n  "a": "A"\n}\n';
    const parsed = jsonHandler.parse(raw);
    const out = jsonHandler.export(
      raw,
      parsed.data,
      new Map([["z", "子"]]),
      parsed.formatMeta,
    );
    expect(out.indexOf('"z"')).toBeLessThan(out.indexOf('"a"'));
    expect(out).toContain('"z": "子"');
  });

  it("minified export stays minified", () => {
    const raw = '{"hello":"world"}';
    const parsed = jsonHandler.parse(raw);
    const out = jsonHandler.export(
      raw,
      parsed.data,
      new Map([["hello", "世界"]]),
      parsed.formatMeta,
    );
    expect(out).toBe('{"hello":"世界"}');
  });

  it("preserves unusual spacing exactly (only value changes)", () => {
    // no space after colon, extra spaces, mixed
    const raw = '{\n  "a":"A" ,\n  "b" :  "B"\n}';
    const parsed = jsonHandler.parse(raw);
    const out = jsonHandler.export(
      raw,
      parsed.data,
      new Map([["a", "甲"]]),
      parsed.formatMeta,
    );
    expect(out).toBe('{\n  "a":"甲" ,\n  "b" :  "B"\n}');
  });

  it("does not insert indent digits when format_meta.indent is string \"2\"", () => {
    const raw = '{\n  "x": "one"\n}\n';
    const parsed = jsonHandler.parse(raw);
    // Simulate jsonb / form data that stringified the indent
    const out = jsonHandler.export(
      raw,
      parsed.data,
      new Map([["x", "一"]]),
      { ...parsed.formatMeta, indent: "2" as unknown as number },
    );
    expect(out).not.toMatch(/\n2"/);
    expect(out).toBe('{\n  "x": "一"\n}\n');
  });

  it("leaves non-string leaves and array strings unchanged", () => {
    const raw = '{\n  "n": 3,\n  "list": ["a", "b"],\n  "ok": "yes"\n}\n';
    const parsed = jsonHandler.parse(raw);
    const out = jsonHandler.export(
      raw,
      parsed.data,
      new Map([["ok", "好"]]),
      parsed.formatMeta,
    );
    expect(out).toBe('{\n  "n": 3,\n  "list": ["a", "b"],\n  "ok": "好"\n}\n');
  });
});

describe("normalizeJsonIndent", () => {
  it("coerces numeric strings to numbers", async () => {
    const { normalizeJsonIndent } = await import("./json");
    expect(normalizeJsonIndent("2")).toBe(2);
    expect(normalizeJsonIndent("4")).toBe(4);
    expect(normalizeJsonIndent("\t")).toBe("\t");
    expect(normalizeJsonIndent(0)).toBe(0);
  });
});

describe("properties handler", () => {
  it("parses keys and preserves comments on export", () => {
    const raw = [
      "# UI strings",
      "nav.home=Home",
      "",
      "title=App",
      "",
    ].join("\n");
    const parsed = propertiesHandler.parse(raw);
    expect(parsed.error).toBeUndefined();
    expect(parsed.entries.map((e) => e.keyPath)).toEqual(["nav.home", "title"]);
    const out = propertiesHandler.export(
      raw,
      parsed.data,
      new Map([["nav.home", "首页"]]),
      parsed.formatMeta,
    );
    expect(out).toContain("# UI strings");
    expect(out).toContain("nav.home=首页");
    expect(out).toContain("title=App");
  });
});

describe("registry", () => {
  it("infers format from path", () => {
    expect(inferFormatFromPath("locales/a.json").id).toBe("json");
    expect(inferFormatFromPath("messages.properties").id).toBe("properties");
  });
});

describe("localeSuffixPath", () => {
  it("inserts locale before extension", () => {
    expect(localeSuffixPath("locales/common.json", "zh-CN")).toBe(
      "locales/common.zh-CN.json",
    );
    expect(localeSuffixPath("app.properties", "ja")).toBe("app.ja.properties");
  });
});

describe("buildZip", () => {
  it("creates a non-empty zip with entries", () => {
    const buf = buildZip([
      { path: "a.json", data: '{"x":1}' },
      { path: "dir/b.json", data: "{}" },
    ]);
    expect(buf.length).toBeGreaterThan(50);
    // local file header signature
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });
});

describe("serializeJson helpers", () => {
  it("applies indent 4", () => {
    const s = serializeJson({ a: "b" }, { indent: 4, trailingNewline: true });
    expect(s).toBe('{\n    "a": "b"\n}\n');
  });
});
