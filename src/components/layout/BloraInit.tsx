"use client";

import { useEffect } from "react";

/** Product lock: blora-design-2 Mono palette. */
const DEFAULT_PALETTE = "mono";

function applyProductDefaults() {
  if (!window.Blora) return false;

  window.Blora.configure?.({
    colorModeStorageKey: "btc-theme",
    storageKey: "btc-theme",
    paletteStorageKey: "btc-palette",
  });
  window.Blora.applyPalette?.(DEFAULT_PALETTE, document.documentElement, {
    persist: true,
  });
  window.Blora.init(document);
  return true;
}

/**
 * Ensures Mono palette + interactive bindings after blora.js loads.
 * Does not inject a second script — layout already loads /blora/blora.js once.
 */
export function BloraInit() {
  useEffect(() => {
    if (applyProductDefaults()) return;

    let tries = 0;
    const id = window.setInterval(() => {
      tries += 1;
      if (applyProductDefaults() || tries > 40) {
        window.clearInterval(id);
      }
    }, 50);

    return () => window.clearInterval(id);
  }, []);

  return null;
}
