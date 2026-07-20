import { describe, expect, it } from "vitest";
import {
  isAllowedReadmeUrl,
  normalizeUrl,
  renderMarkdown,
  sanitizeHtml,
} from "./readme";

describe("normalizeUrl", () => {
  it("accepts https raw github urls", () => {
    const u =
      "https://raw.githubusercontent.com/BloretCrew/Bloret-Launcher/refs/heads/Windows/README.md";
    expect(normalizeUrl(u)).toBe(u);
  });

  it("rejects http and localhost", () => {
    expect(normalizeUrl("http://example.com/README.md")).toBeNull();
    expect(normalizeUrl("https://localhost/r.md")).toBeNull();
    expect(normalizeUrl("https://192.168.1.1/r.md")).toBeNull();
  });
});

describe("isAllowedReadmeUrl", () => {
  it("validates", () => {
    expect(isAllowedReadmeUrl("https://example.com/a.md")).toBe(true);
    expect(isAllowedReadmeUrl("not-a-url")).toBe(false);
  });
});

describe("renderMarkdown / sanitizeHtml", () => {
  it("renders headings and links", () => {
    const html = renderMarkdown("# Hello\n\n[site](https://example.com)");
    expect(html).toContain("<h1");
    expect(html).toContain("Hello");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("strips script tags", () => {
    const dirty = sanitizeHtml('<p>ok</p><script>alert(1)</script><img src=x onerror=alert(1)>');
    expect(dirty).not.toContain("script");
    expect(dirty).not.toContain("onerror");
  });

  it("blocks javascript hrefs", () => {
    const dirty = sanitizeHtml('<a href="javascript:alert(1)">x</a>');
    expect(dirty).not.toMatch(/javascript:/i);
  });
});
