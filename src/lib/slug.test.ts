import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("slugifies latin names", () => {
    expect(slugify("Bloret Studio")).toBe("bloret-studio");
    expect(slugify("  My_App  ")).toBe("my-app");
  });

  it("falls back for non-Latin-only names instead of empty string", () => {
    const s = slugify("翻译工作室", "org");
    expect(s.length).toBeGreaterThanOrEqual(2);
    expect(s).toMatch(/^org-[a-z0-9]+$/);
    // must satisfy createOrg slug schema shape
    expect(s).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it("falls back for empty input", () => {
    const s = slugify("", "project");
    expect(s).toMatch(/^project-[a-z0-9]+$/);
  });
});
