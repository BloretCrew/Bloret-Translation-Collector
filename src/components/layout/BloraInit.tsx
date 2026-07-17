"use client";

import { useEffect } from "react";

export function BloraInit() {
  useEffect(() => {
    function run() {
      if (window.Blora) {
        window.Blora.configure?.({
          storageKey: "btc-theme",
          themeStorageKey: "btc-style-theme",
          paletteStorageKey: "btc-palette",
        });
        window.Blora.applyTheme?.("modern");
        window.Blora.init(document);
      }
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
