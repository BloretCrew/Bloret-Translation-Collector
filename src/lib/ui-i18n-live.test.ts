import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetLiveI18nCacheForTests,
  mergeCatalogs,
  fetchLiveCatalog,
  fetchUiI18nManifest,
} from "./ui-i18n-live";

describe("ui-i18n-live", () => {
  afterEach(() => {
    _resetLiveI18nCacheForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("mergeCatalogs prefers non-empty live over disk", () => {
    const disk = { a: "disk-a", b: "disk-b", c: "disk-c" };
    const live = { a: "live-a", b: "", d: "live-d" };
    expect(mergeCatalogs(disk, live)).toEqual({
      a: "live-a",
      b: "disk-b",
      c: "disk-c",
      d: "live-d",
    });
    expect(mergeCatalogs(disk, null)).toEqual(disk);
    expect(mergeCatalogs(disk, {})).toEqual(disk);
  });

  it("fetchLiveCatalog loads via public translated API shape", async () => {
    // Force enabled config path by stubbing loadConfig through fetch only:
    // when uiI18n is disabled (default in tests without config), returns null.
    // We mock fetch and rely on real loadConfig — if config.json has uiI18n
    // enabled in this workspace, exercise the happy path.
    const { loadConfig } = await import("./config");
    const cfg = loadConfig();
    if (!cfg.uiI18n.enabled) {
      expect(await fetchLiveCatalog("ru")).toBeNull();
      return;
    }

    const body = { 登录: "Войти", 设置: "Настройки" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes("/manifest")) {
          return new Response(
            JSON.stringify({ lang: { ru: { name: "俄语", file: "ru.json", contributor: [] } }, project: {} }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (u.includes("/translated")) {
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("nope", { status: 404 });
      }),
    );

    const cat = await fetchLiveCatalog("ru");
    expect(cat).toEqual(body);
    // Second call within TTL should not re-fetch translated (may still use cache)
    const cat2 = await fetchLiveCatalog("ru");
    expect(cat2).toEqual(body);
  });

  it("fetchUiI18nManifest reports disabled when off", async () => {
    const { loadConfig } = await import("./config");
    if (loadConfig().uiI18n.enabled) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          new Response(JSON.stringify({ lang: {}, project: {} }), { status: 200 }),
        ),
      );
      const r = await fetchUiI18nManifest();
      expect(r.ok).toBe(true);
    } else {
      const r = await fetchUiI18nManifest();
      expect(r.ok).toBe(false);
      expect(r.error).toBe("disabled");
    }
  });
});
