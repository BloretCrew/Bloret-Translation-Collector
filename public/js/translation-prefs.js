/**
 * Translator preferences related to project translation rules.
 * Stored in localStorage; shared by user settings + editor.
 */
(function () {
  const STORAGE_KEY = "btc-translation-prefs";
  const VERSION = 1;

  /** @typedef {{ v: number, skipProjectRules: boolean }} TranslationPrefs */

  /** @returns {TranslationPrefs} */
  function defaults() {
    return { v: VERSION, skipProjectRules: false };
  }

  /** @returns {TranslationPrefs} */
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return defaults();
      return {
        v: VERSION,
        skipProjectRules: parsed.skipProjectRules === true,
      };
    } catch {
      return defaults();
    }
  }

  /**
   * @param {Partial<TranslationPrefs>} patch
   * @returns {TranslationPrefs}
   */
  function save(patch) {
    const next = {
      ...load(),
      ...(patch && typeof patch === "object" ? patch : {}),
      v: VERSION,
    };
    next.skipProjectRules = next.skipProjectRules === true;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota */
    }
    return next;
  }

  window.BTC = window.BTC || {};
  window.BTC.translationPrefs = { load, save, defaults, STORAGE_KEY };
})();
