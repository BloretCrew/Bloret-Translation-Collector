/**
 * Crowdin-style dual-pane language transfer picker.
 * Pair with views/partials/locale-target-picker.ejs + Blora modal.
 */
(function () {
  function labelOf(catalog, code) {
    if (!code) return "";
    const needle = String(code).toLowerCase();
    const hit = catalog.find((o) => String(o.code).toLowerCase() === needle);
    return hit && hit.label ? hit.label : code;
  }

  function upsertCatalog(catalog, code, label) {
    const needle = code.toLowerCase();
    const hit = catalog.find((o) => String(o.code).toLowerCase() === needle);
    if (hit) {
      // Always refresh display name when caller provides one (allows fixing earlier saves).
      if (label) hit.label = label;
      // Keep the canonical code as first seen; do not force-rename case.
      return hit.code;
    }
    catalog.push({ code, label: label || code });
    return code;
  }

  function initTransfer(root) {
    const fieldName = root.dataset.fieldName || "targetLocales";
    const modalId = root.dataset.modalId || "locale-picker-modal";
    const jsonId = root.dataset.jsonId;
    const modal = document.getElementById(modalId);
    if (!modal) return;

    // Modal markup is included next to the field (often inside a <form>). Detach it so
    // empty inputs never trigger native form validation on the host Save button.
    if (modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }

    let catalog = [];
    let selected = [];
    const jsonEl = jsonId ? document.getElementById(jsonId) : null;
    if (jsonEl) {
      try {
        const data = JSON.parse(jsonEl.textContent || "{}");
        catalog = Array.isArray(data.catalog) ? data.catalog : [];
        selected = Array.isArray(data.selected)
          ? data.selected
              .map((item) => (typeof item === "string" ? item : item && (item.code || item.locale)))
              .filter(Boolean)
          : [];
      } catch {
        /* keep empty */
      }
    }

    let draft = selected.slice();
    let hiAvail = new Set();
    let hiSel = new Set();

    const tagsEl = root.querySelector("[data-locale-tags]");
    const inputsEl = root.querySelector("[data-locale-inputs]");
    const availList = modal.querySelector("[data-locale-available]");
    const selList = modal.querySelector("[data-locale-selected]");
    const searchEl = modal.querySelector("[data-locale-search]");
    const availCount = modal.querySelector("[data-avail-count]");
    const selCount = modal.querySelector("[data-sel-count]");
    const customCode = modal.querySelector("[data-custom-code]");
    const customLabel = modal.querySelector("[data-custom-label]");

    function toast(type, message) {
      if (window.BTC?.toast) window.BTC.toast(type, message);
      else if (window.Blora?.toast) window.Blora.toast({ type, message });
      else console.log(`[${type}] ${message}`);
    }

    function availableCodes() {
      const sel = new Set(draft.map((c) => String(c).toLowerCase()));
      return catalog.map((o) => o.code).filter((c) => !sel.has(String(c).toLowerCase()));
    }

    function persistJson() {
      if (jsonEl) {
        jsonEl.textContent = JSON.stringify({ catalog, selected });
      }
    }

    function renderSummary() {
      if (!tagsEl || !inputsEl) return;
      tagsEl.innerHTML = "";
      inputsEl.innerHTML = "";
      if (!selected.length) {
        const empty = document.createElement("span");
        empty.className = "blora-text-faint";
        empty.textContent = "尚未选择语言";
        tagsEl.appendChild(empty);
      } else {
        selected.forEach((code) => {
          const label = labelOf(catalog, code);
          const tag = document.createElement("span");
          tag.className = "locale-tag";
          tag.dataset.code = code;
          const lab = document.createElement("span");
          lab.className = "locale-tag__label";
          lab.textContent = label;
          const cod = document.createElement("span");
          cod.className = "locale-tag__code";
          cod.textContent = code;
          tag.appendChild(lab);
          tag.appendChild(cod);
          tagsEl.appendChild(tag);

          const input = document.createElement("input");
          input.type = "hidden";
          input.name = fieldName;
          input.value = code;
          // Persist human label for forms.js → API displayName.
          if (label) input.setAttribute("data-display-name", label);
          inputsEl.appendChild(input);
        });
      }
      persistJson();
    }

    function renderList(ul, codes, highlightSet, emptyText) {
      if (!ul) return;
      ul.innerHTML = "";
      if (!codes.length) {
        const li = document.createElement("li");
        li.className = "locale-picker-list__empty";
        li.textContent = emptyText;
        ul.appendChild(li);
        return;
      }
      codes.forEach((code) => {
        const li = document.createElement("li");
        li.className =
          "locale-picker-list__item" + (highlightSet.has(code) ? " is-active" : "");
        li.dataset.code = code;
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", highlightSet.has(code) ? "true" : "false");
        const lab = document.createElement("span");
        lab.className = "locale-picker-list__label";
        lab.textContent = labelOf(catalog, code);
        const cod = document.createElement("span");
        cod.className = "locale-picker-list__code";
        cod.textContent = code;
        li.appendChild(lab);
        li.appendChild(cod);
        ul.appendChild(li);
      });
    }

    function filteredAvailable() {
      const q = (searchEl?.value || "").trim().toLowerCase();
      let codes = availableCodes();
      if (q) {
        codes = codes.filter((code) => {
          const lab = labelOf(catalog, code).toLowerCase();
          return lab.includes(q) || code.toLowerCase().includes(q);
        });
      }
      return codes;
    }

    function renderModal() {
      const avail = filteredAvailable();
      renderList(availList, avail, hiAvail, "没有可添加的语言");
      renderList(selList, draft, hiSel, "尚未选择，请从左侧添加");
      if (availCount) availCount.textContent = String(avail.length);
      if (selCount) selCount.textContent = String(draft.length);
    }

    function openSync() {
      draft = selected.slice();
      hiAvail = new Set();
      hiSel = new Set();
      if (searchEl) searchEl.value = "";
      renderModal();
    }

    root.querySelector(`[data-blora-modal-open="${modalId}"]`)?.addEventListener("click", () => {
      setTimeout(openSync, 0);
    });

    function toggleHi(set, code, multi) {
      if (!multi) {
        set.clear();
        set.add(code);
      } else if (set.has(code)) {
        set.delete(code);
      } else {
        set.add(code);
      }
    }

    availList?.addEventListener("click", (e) => {
      const li = e.target.closest("[data-code]");
      if (!li) return;
      toggleHi(hiAvail, li.dataset.code, e.ctrlKey || e.metaKey);
      renderModal();
    });
    selList?.addEventListener("click", (e) => {
      const li = e.target.closest("[data-code]");
      if (!li) return;
      toggleHi(hiSel, li.dataset.code, e.ctrlKey || e.metaKey);
      renderModal();
    });

    availList?.addEventListener("dblclick", (e) => {
      const li = e.target.closest("[data-code]");
      if (!li) return;
      moveToSelected([li.dataset.code]);
    });
    selList?.addEventListener("dblclick", (e) => {
      const li = e.target.closest("[data-code]");
      if (!li) return;
      moveToAvailable([li.dataset.code]);
    });

    function moveToSelected(codes) {
      const set = new Set(draft.map((c) => String(c).toLowerCase()));
      const next = draft.slice();
      codes.forEach((c) => {
        if (!c) return;
        if (set.has(String(c).toLowerCase())) return;
        set.add(String(c).toLowerCase());
        next.push(c);
      });
      draft = next;
      hiAvail.clear();
      renderModal();
    }

    function moveToAvailable(codes) {
      const remove = new Set(codes.map((c) => String(c).toLowerCase()));
      draft = draft.filter((c) => !remove.has(String(c).toLowerCase()));
      hiSel.clear();
      renderModal();
    }

    modal.querySelector("[data-move-right]")?.addEventListener("click", () => {
      if (!hiAvail.size) return;
      moveToSelected(Array.from(hiAvail));
    });
    modal.querySelector("[data-move-left]")?.addEventListener("click", () => {
      if (!hiSel.size) return;
      moveToAvailable(Array.from(hiSel));
    });

    searchEl?.addEventListener("input", () => {
      hiAvail.clear();
      renderModal();
    });

    modal.querySelector("[data-custom-add]")?.addEventListener("click", () => {
      const code = (customCode?.value || "").trim();
      const rawLabel = (customLabel?.value || "").trim();
      if (!code) {
        toast("error", "请填写语言代码");
        return;
      }
      if (!rawLabel) {
        toast("error", "请填写语言显示名（项目页会显示此名称）");
        customLabel?.focus();
        return;
      }
      if (rawLabel.toLowerCase() === code.toLowerCase()) {
        toast("error", "显示名不能与代码相同，请填写人类可读名称");
        customLabel?.focus();
        return;
      }
      if (!/^[a-zA-Z]{2,3}([_-][a-zA-Z0-9]+)*$/.test(code)) {
        toast("error", "语言代码格式无效（如 en、zh-CN、yue）");
        return;
      }
      const label = rawLabel;
      const canonical = upsertCatalog(catalog, code, label);
      // If user re-adds an existing custom locale with a new name, draft may already include it.
      moveToSelected([canonical]);
      persistJson();
      if (customCode) customCode.value = "";
      if (customLabel) customLabel.value = "";
      toast("success", `已添加 ${label}（${canonical}）`);
    });

    modal.querySelector("[data-locale-confirm]")?.addEventListener("click", () => {
      if (!draft.length) {
        toast("error", "请至少选择一种目标语言");
        return;
      }
      selected = draft.slice();
      renderSummary();
      if (window.Blora?.closeModal) window.Blora.closeModal(modalId);
      else {
        modal.classList.remove("is-open");
      }
    });

    renderSummary();
  }

  function boot() {
    document.querySelectorAll("[data-locale-transfer]").forEach(initTransfer);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
