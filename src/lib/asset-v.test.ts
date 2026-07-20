import { describe, expect, it } from "vitest";
import { computeAssetV, projectRoot } from "./asset-v";
import { existsSync } from "fs";
import path from "path";

describe("computeAssetV", () => {
  it("resolves a project root that contains public/js/app.js", () => {
    const root = projectRoot();
    expect(existsSync(path.join(root, "public", "js", "app.js"))).toBe(true);
  });

  it("returns a stable short hex string for current public assets", () => {
    const a = computeAssetV();
    const b = computeAssetV();
    expect(a).toMatch(/^[a-f0-9]{8,16}$/);
    expect(a).toBe(b);
    // Empty SHA1 of nothing — must never be used as cache buster
    expect(a).not.toBe("da39a3ee5e6b");
  });

  it("honors BTC_ASSET_V env override", () => {
    const prev = process.env.BTC_ASSET_V;
    process.env.BTC_ASSET_V = "manual-v1";
    try {
      expect(computeAssetV()).toBe("manual-v1");
    } finally {
      if (prev === undefined) delete process.env.BTC_ASSET_V;
      else process.env.BTC_ASSET_V = prev;
    }
  });
});
