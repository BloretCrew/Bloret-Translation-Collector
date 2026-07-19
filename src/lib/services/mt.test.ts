import { describe, expect, it } from "vitest";
import { applyConfigToProcessEnv } from "../config";
import { isMtEnabled, machineTranslate } from "./mt";

applyConfigToProcessEnv();

describe("machine translation", () => {
  it("reports disabled when config mt is off or missing endpoint", () => {
    // default config.json in this repo has no mt block → disabled
    expect(isMtEnabled()).toBe(false);
  });

  it("returns DISABLED when MT is not configured", async () => {
    const result = await machineTranslate({
      text: "Hello world",
      sourceLocale: "en",
      targetLocale: "zh",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("DISABLED");
    }
  });

  it("rejects empty source text", async () => {
    const result = await machineTranslate({
      text: "   ",
      sourceLocale: "en",
      targetLocale: "zh",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("EMPTY");
    }
  });
});
