/**
 * Settings section tabs: ?tab=… + optional hash, show one panel at a time.
 * Markup:
 *   <div class="settings-layout" data-settings-tabs data-default-tab="general">
 *     <nav class="settings-nav">
 *       <a class="settings-nav__link" href="?tab=general" data-tab="general">…</a>
 *     </nav>
 *     <div class="settings-main">
 *       <section class="settings-panel" data-tab-panel="general">…</section>
 *     </div>
 *   </div>
 */
(function () {
  const roots = document.querySelectorAll("[data-settings-tabs]");
  if (!roots.length) return;

  function tabFromUrl(defaultTab) {
    const q = new URLSearchParams(location.search).get("tab");
    if (q) return q;
    if (location.hash && location.hash.length > 1) {
      return location.hash.slice(1);
    }
    return defaultTab || "general";
  }

  function activate(root, tabId, { push } = { push: false }) {
    const links = root.querySelectorAll("[data-tab]");
    const panels = root.querySelectorAll("[data-tab-panel]");
    const ids = [...panels].map((p) => p.getAttribute("data-tab-panel"));
    const next = ids.includes(tabId) ? tabId : root.dataset.defaultTab || ids[0];

    links.forEach((link) => {
      const on = link.getAttribute("data-tab") === next;
      link.classList.toggle("is-active", on);
      link.setAttribute("aria-current", on ? "page" : "false");
    });
    panels.forEach((panel) => {
      const on = panel.getAttribute("data-tab-panel") === next;
      panel.hidden = !on;
      panel.classList.toggle("is-active", on);
    });

    const url = new URL(location.href);
    url.searchParams.set("tab", next);
    url.hash = "";
    if (push) {
      history.pushState({ settingsTab: next }, "", url.pathname + url.search);
    } else {
      history.replaceState({ settingsTab: next }, "", url.pathname + url.search);
    }

    root.dispatchEvent(
      new CustomEvent("settings:tab", { detail: { tab: next }, bubbles: true }),
    );
  }

  roots.forEach((root) => {
    const defaultTab = root.dataset.defaultTab || "general";
    activate(root, tabFromUrl(defaultTab), { push: false });

    root.querySelectorAll("[data-tab]").forEach((link) => {
      link.addEventListener("click", (e) => {
        // Allow modified clicks to open in new tab with ?tab=
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        const tab = link.getAttribute("data-tab");
        if (tab) activate(root, tab, { push: true });
      });
    });
  });

  window.addEventListener("popstate", () => {
    roots.forEach((root) => {
      activate(root, tabFromUrl(root.dataset.defaultTab || "general"), { push: false });
    });
  });
})();
