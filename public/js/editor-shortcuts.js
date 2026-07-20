/**
 * Translation workbench keyboard shortcuts (per-browser preferences).
 * Stored in localStorage; shared by editor + user settings page.
 */
(function () {
  const STORAGE_KEY = "btc-editor-shortcuts";
  const VERSION = 1;

  /** @typedef {{ key: string, mod?: boolean, ctrl?: boolean, alt?: boolean, shift?: boolean, meta?: boolean }} ShortcutBinding */

  /** @type {Record<string, { label: string, hint: string, scope: string, default: ShortcutBinding }>} */
  const ACTIONS = {
    saveAndNext: {
      label: "保存并下一条",
      hint: "在译文框中生效",
      scope: "draft",
      default: { key: "Enter", mod: true },
    },
    saveOnly: {
      label: "仅保存",
      hint: "在译文框中生效",
      scope: "draft",
      default: { key: "s", mod: true },
    },
    prevString: {
      label: "上一条字符串",
      hint: "焦点不在输入框时",
      scope: "global",
      default: { key: "ArrowUp" },
    },
    nextString: {
      label: "下一条字符串",
      hint: "焦点不在输入框时",
      scope: "global",
      default: { key: "ArrowDown" },
    },
    sendComment: {
      label: "发送评论",
      hint: "在讨论输入框中生效",
      scope: "comment",
      default: { key: "Enter", mod: true },
    },
  };

  function isMac() {
    try {
      return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");
    } catch {
      return false;
    }
  }

  function normalizeBinding(raw) {
    if (!raw || typeof raw !== "object" || !raw.key) return null;
    const key = String(raw.key);
    if (!key) return null;
    return {
      key,
      mod: Boolean(raw.mod),
      ctrl: Boolean(raw.ctrl),
      alt: Boolean(raw.alt),
      shift: Boolean(raw.shift),
      meta: Boolean(raw.meta),
    };
  }

  function defaultMap() {
    /** @type {Record<string, ShortcutBinding>} */
    const out = {};
    for (const [id, meta] of Object.entries(ACTIONS)) {
      out[id] = { ...meta.default };
    }
    return out;
  }

  function load() {
    const map = defaultMap();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return map;
      const parsed = JSON.parse(raw);
      const custom = parsed && typeof parsed === "object" ? parsed.shortcuts || parsed : null;
      if (!custom || typeof custom !== "object") return map;
      for (const id of Object.keys(ACTIONS)) {
        const n = normalizeBinding(custom[id]);
        if (n) map[id] = n;
      }
    } catch {
      /* keep defaults */
    }
    return map;
  }

  function save(map) {
    const shortcuts = {};
    for (const id of Object.keys(ACTIONS)) {
      const n = normalizeBinding(map[id]) || { ...ACTIONS[id].default };
      shortcuts[id] = n;
    }
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: VERSION, updatedAt: new Date().toISOString(), shortcuts }),
    );
    return shortcuts;
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY);
    return defaultMap();
  }

  /**
   * Build binding from a KeyboardEvent (for capture UI).
   * Primary modifier (Ctrl/Cmd) is stored as `mod` when either is held alone with the key.
   */
  function fromEvent(e) {
    if (!e || e.key === "Escape" || e.key === "Tab") return null;
    // Ignore pure modifiers
    if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return null;

    const ctrl = e.ctrlKey;
    const meta = e.metaKey;
    const alt = e.altKey;
    const shift = e.shiftKey;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

    // Prefer portable "mod" when only primary modifier is used
    if ((ctrl || meta) && !(ctrl && meta)) {
      return {
        key,
        mod: true,
        ctrl: false,
        meta: false,
        alt,
        shift,
      };
    }

    return {
      key,
      mod: false,
      ctrl,
      meta,
      alt,
      shift,
    };
  }

  function eventKeyId(e) {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    return key;
  }

  function bindingKeyId(b) {
    if (!b) return "";
    return b.key.length === 1 ? b.key.toLowerCase() : b.key;
  }

  /** @param {KeyboardEvent} e @param {ShortcutBinding|null|undefined} b */
  function matches(e, b) {
    if (!b || !b.key) return false;
    if (eventKeyId(e) !== bindingKeyId(b)) return false;

    if (b.mod) {
      if (!(e.ctrlKey || e.metaKey)) return false;
    } else {
      if (Boolean(b.ctrl) !== e.ctrlKey) return false;
      if (Boolean(b.meta) !== e.metaKey) return false;
    }

    if (Boolean(b.alt) !== e.altKey) return false;
    if (Boolean(b.shift) !== e.shiftKey) return false;
    return true;
  }

  /** @param {ShortcutBinding|null|undefined} b */
  function format(b) {
    if (!b || !b.key) return "未设置";
    const parts = [];
    const mac = isMac();
    if (b.mod) {
      parts.push(mac ? "⌘" : "Ctrl");
    } else {
      if (b.ctrl) parts.push("Ctrl");
      if (b.meta) parts.push(mac ? "⌘" : "Meta");
    }
    if (b.alt) parts.push(mac ? "⌥" : "Alt");
    if (b.shift) parts.push(mac ? "⇧" : "Shift");

    const keyLabels = {
      Enter: "Enter",
      ArrowUp: "↑",
      ArrowDown: "↓",
      ArrowLeft: "←",
      ArrowRight: "→",
      Escape: "Esc",
      " ": "Space",
      Backspace: "Backspace",
    };
    const k = b.key.length === 1 ? b.key.toUpperCase() : keyLabels[b.key] || b.key;
    parts.push(k);
    return parts.join(mac ? "" : "+");
  }

  function bindingEqual(a, b) {
    const na = normalizeBinding(a);
    const nb = normalizeBinding(b);
    if (!na || !nb) return false;
    return (
      bindingKeyId(na) === bindingKeyId(nb) &&
      Boolean(na.mod) === Boolean(nb.mod) &&
      Boolean(na.ctrl) === Boolean(nb.ctrl) &&
      Boolean(na.meta) === Boolean(nb.meta) &&
      Boolean(na.alt) === Boolean(nb.alt) &&
      Boolean(na.shift) === Boolean(nb.shift)
    );
  }

  /** Detect conflicts within a map; returns array of { a, b } action id pairs */
  function findConflicts(map) {
    const ids = Object.keys(ACTIONS);
    const pairs = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i];
        const b = ids[j];
        // Same scope only (draft vs global can share keys safely enough for our handlers)
        if (ACTIONS[a].scope !== ACTIONS[b].scope) continue;
        if (bindingEqual(map[a], map[b])) pairs.push({ a, b });
      }
    }
    return pairs;
  }

  window.BTC = window.BTC || {};
  window.BTC.editorShortcuts = {
    STORAGE_KEY,
    ACTIONS,
    defaultMap,
    load,
    save,
    reset,
    fromEvent,
    matches,
    format,
    findConflicts,
    isMac,
  };
})();
