import { describe, expect, it } from "vitest";
import {
  absoluteImageUrl,
  imagePreviewUrl,
  parseImageDataUrl,
} from "./image-host";

describe("image-host helpers", () => {
  it("absolutizes relative img host paths", () => {
    expect(absoluteImageUrl("/img/1/abc", "https://img.bloret.net")).toBe(
      "https://img.bloret.net/img/1/abc",
    );
    expect(absoluteImageUrl("https://img.bloret.net/img/1/abc")).toBe(
      "https://img.bloret.net/img/1/abc",
    );
  });

  it("builds webp preview URLs for host originals", () => {
    const original = "https://img.bloret.net/img/1700000000000/a1b2c3d4e5f6";
    expect(imagePreviewUrl(original)).toBe(`${original}.webp`);
    expect(imagePreviewUrl(`${original}.webp`)).toBe(`${original}.webp`);
    expect(imagePreviewUrl("/uploads/contexts/local.png")).toBe("/uploads/contexts/local.png");
  });

  it("parses image data URLs", () => {
    // 1x1 transparent PNG
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const parsed = parseImageDataUrl(png);
    expect(parsed).not.toBeNull();
    expect(parsed!.ext).toBe("png");
    expect(parsed!.contentType).toBe("image/png");
    expect(parsed!.buffer.length).toBeGreaterThan(10);
    expect(parseImageDataUrl("not-an-image")).toBeNull();
  });
});
