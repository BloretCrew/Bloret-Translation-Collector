import { describe, expect, it } from "vitest";
import {
  normalizeSfName,
  sfIcon,
  sfIconUrl,
  sfIconUpstreamUrl,
  SF_ICON_PUBLIC_BASE,
} from "./sf-icon";

describe("sf-icon", () => {
  it("builds same-origin /sf URL for CSS mask use", () => {
    expect(sfIconUrl("building.2")).toBe("/sf/building.2");
    expect(sfIconUrl("house.svg")).toBe("/sf/house");
    expect(SF_ICON_PUBLIC_BASE).toBe("/sf");
  });

  it("exposes absolute upstream URL for proxy fetch", () => {
    expect(sfIconUpstreamUrl("building.2")).toBe("https://img.bloret.net/SF/building.2");
  });

  it("encodes color query when provided", () => {
    expect(sfIconUrl("star", "#1456f0")).toBe(
      "/sf/star?color=" + encodeURIComponent("#1456f0"),
    );
  });

  it("renders theme-aware mask span with same-origin url", () => {
    const html = sfIcon("gearshape", { className: "sf-icon--sm" });
    expect(html).toContain('class="sf-icon sf-icon--sm"');
    expect(html).toContain("--sf-url:url(");
    expect(html).toContain("/sf/gearshape");
    expect(html).not.toContain("img.bloret.net");
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
