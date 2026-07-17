"use client";

import { useEffect } from "react";

/** Blora product defaults: Studio theme + Dusk palette (key: studio). */
const DEFAULT_THEME = "studio";
const DEFAULT_PALETTE = "studio"; // display name: Dusk

export function BloraInit() {
  useEffect(() => {
    function run() {
      if (!window.Blora) return;

      window.Blora.configure?.({
        storageKey: "btc-theme",
        themeStorageKey: "btc-style-theme",
        paletteStorageKey: "btc-palette",
      });

      // Pin Studio morphology, then Dusk colors (do not rely on theme default alone)
      window.Blora.applyTheme?.(DEFAULT_THEME, document.documentElement, {
        applyDefaultPalette: false,
      });
      window.Blora.applyPalette?.(DEFAULT_PALETTE);
      window.Blora.init(document);
    }

    if (window.Blora) {
      run();
      return;
    }

    const existing = document.querySelector('script[data-blora="1"]');
    if (existing) {
      existing.addEventListener("load", run);
      return;
    }

    const script = document.createElement("script");
    script.src = "/blora/blora.js";
    script.async = true;
    script.dataset.blora = "1";
    script.onload = run;
    document.body.appendChild(script);
  }, []);

  return null;
}
