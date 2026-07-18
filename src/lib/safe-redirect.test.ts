import { describe, expect, it } from "vitest";
import { safeInternalPath } from "./safe-redirect";

describe("safeInternalPath", () => {
  it("allows relative app paths", () => {
    expect(safeInternalPath("/app")).toBe("/app");
    expect(safeInternalPath("/app/o/demo")).toBe("/app/o/demo");
    expect(safeInternalPath("/app?x=1")).toBe("/app?x=1");
  });

  it("blocks open redirects", () => {
    expect(safeInternalPath("//evil.com")).toBe("/app");
    expect(safeInternalPath("https://evil.com")).toBe("/app");
    expect(safeInternalPath("http://evil.com/phish")).toBe("/app");
    expect(safeInternalPath("\\\\evil.com")).toBe("/app");
    expect(safeInternalPath("javascript:alert(1)")).toBe("/app");
  });

  it("uses fallback for invalid values", () => {
    expect(safeInternalPath(null, "/home")).toBe("/home");
    expect(safeInternalPath("", "/home")).toBe("/home");
    expect(safeInternalPath(123 as unknown as string, "/home")).toBe("/home");
  });
});
