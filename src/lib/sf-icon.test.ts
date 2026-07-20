import { describe, expect, it } from "vitest";
import { normalizeSfName, sfIcon, sfIconUrl } from "./sf-icon";

describe("sf-icon", () => {
  it("builds SF URL without color for CSS mask use", () => {
    expect(sfIconUrl("building.2")).toBe("https://img.bloret.net/SF/building.2");
    expect(sfIconUrl("house.svg")).toBe("https://img.bloret.net/SF/house");
  });

  it("encodes color query when provided", () => {
    expect(sfIconUrl("star", "#1456f0")).toBe(
      "https://img.bloret.net/SF/star?color=" + encodeURIComponent("#1456f0"),
    );
  });

  it("renders theme-aware mask span", () => {
    const html = sfIcon("gearshape", { className: "sf-icon--sm" });
    expect(html).toContain('class="sf-icon sf-icon--sm"');
    expect(html).toContain("--sf-url:url(");
    expect(html).toContain("https://img.bloret.net/SF/gearshape");
    expect(html).toContain('aria-hidden="true"');
  });

  it("supports labeled icons", () => {
    const html = sfIcon("trash", { label: "删除" });
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="删除"');
  });

  it("normalizes .svg suffix", () => {
    expect(normalizeSfName("plus.circle.fill.svg")).toBe("plus.circle.fill");
  });
});
