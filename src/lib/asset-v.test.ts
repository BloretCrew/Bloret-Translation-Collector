import { describe, expect, it } from "vitest";
import { computeAssetV } from "./asset-v";

describe("computeAssetV", () => {
  it("returns a stable short hex string for current public assets", () => {
    const a = computeAssetV();
    const b = computeAssetV();
    expect(a).toMatch(/^[a-f0-9]{8,16}$/);
    expect(a).toBe(b);
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
