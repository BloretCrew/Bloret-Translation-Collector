/**
 * Crowdin-style dual-pane language transfer picker.
 * Pair with views/partials/locale-target-picker.ejs + Blora modal.
 */
(function () {
  function labelOf(catalog, code) {
    const hit = catalog.find((o) => o.code === code);
    return hit ? hit.label : code;
  }

  function initTransfer(root) {
    const fieldName = root.dataset.fieldName || "targetLocales";
    const modalId = root.dataset.modalId || "locale-picker-modal";
    const jsonId = root.dataset.jsonId;
    const modal = document.getElementById(modalId);
    if (!modal) return;

    let catalog = [];
    let selected = [];
    const jsonEl = jsonId ? document.getElementById(jsonId) : null;
    if (jsonEl) {
      try {
        const data = JSON.parse(jsonEl.textContent || "{}");
        catalog = Array.isArray(data.catalog) ? data.catalog : [];
        selected = Array.isArray(data.selected) ? data.selected.slice() : [];
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
      const sel = new Set(draft);
      return catalog.map((o) => o.code).filter((c) => !sel.has(c));
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
          const tag = document.createElement("span");
          tag.className = "locale-tag";
          tag.dataset.code = code;
          const lab = document.createElement("span");
          lab.className = "locale-tag__label";
          lab.textContent = labelOf(catalog, code);
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
      const set = new Set(draft);
      codes.forEach((c) => {
        if (c) set.add(c);
      });
      draft = Array.from(set);
      hiAvail.clear();
      renderModal();
    }

    function moveToAvailable(codes) {
      const remove = new Set(codes);
      draft = draft.filter((c) => !remove.has(c));
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
      const label = (customLabel?.value || "").trim() || code;
      if (!code) {
        toast("error", "请填写语言代码");
        return;
      }
      if (!/^[a-zA-Z]{2,3}([_-][a-zA-Z0-9]+)*$/.test(code)) {
        toast("error", "语言代码格式无效（如 en、zh-CN、yue）");
        return;
      }
      if (!catalog.some((o) => o.code.toLowerCase() === code.toLowerCase())) {
        catalog.push({ code, label });
      }
      moveToSelected([code]);
      if (customCode) customCode.value = "";
      if (customLabel) customLabel.value = "";
      toast("success", `已添加 ${label}`);
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
