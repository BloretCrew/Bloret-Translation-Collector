"use client";

import { useEffect } from "react";

/** Blora product default: Mono palette (pure B/W + low-sat grays). */
const DEFAULT_PALETTE = "mono";

export function BloraInit() {
  useEffect(() => {
    function run() {
      if (!window.Blora) return;

      window.Blora.configure?.({
        colorModeStorageKey: "btc-theme",
        // keep legacy key accepted by design-2 configure()
        storageKey: "btc-theme",
        paletteStorageKey: "btc-palette",
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
