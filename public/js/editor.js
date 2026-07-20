/**
 * Translation workbench:
 * immersive shell · list | compose | tabbed side · save & next
 */
(function () {
  const root = document.getElementById("translation-editor");
  if (!root) return;

  document.documentElement.classList.add("is-translation-editor");
  document.body.classList.add("is-translation-editor");

  const { json, toast } = window.BTC;
  const shortcutsApi = window.BTC.editorShortcuts;
  let shortcuts = shortcutsApi ? shortcutsApi.load() : null;
  const orgSlug = root.dataset.orgSlug;
  const projectSlug = root.dataset.projectSlug;
  let fileId = root.dataset.fileId;
  let locale = root.dataset.locale;
  const canEdit = root.dataset.canEdit === "1";
  /** Org role or locale assignee (SSR for initial locale); may update after detail load */
  let canApprove = root.dataset.canApprove === "1";
  let canModeTranslate =
    root.dataset.canModeTranslate === "1" || canEdit;
  let canModeProofread =
    root.dataset.canModeProofread === "1" || canApprove;
  const MODE_STORAGE_KEY = `btc-editor-mode:${orgSlug}/${projectSlug}`;
  const urlFocus =
    root.dataset.focusString ||
    new URLSearchParams(location.search).get("string") ||
    "";
  let pendingFocus = urlFocus || null;

  /**
   * Crowdin-style workbench identity: restricts UI focus within real permissions.
   * @type {'translate'|'proofread'|'readonly'}
   */
  let workMode = "readonly";

  function readStoredMode() {
    try {
      return localStorage.getItem(MODE_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  }

  function writeStoredMode(mode) {
    try {
      if (mode === "translate" || mode === "proofread") {
        localStorage.setItem(MODE_STORAGE_KEY, mode);
      }
    } catch {
      /* ignore */
    }
  }

  function resolveWorkMode() {
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get("mode");
    const fromStore = readStoredMode();
    const fromSsr = root.dataset.mode || "";
    const candidates = [fromUrl, fromStore, fromSsr];
    for (const c of candidates) {
      if (c === "translate" && canModeTranslate) return "translate";
      if (c === "proofread" && canModeProofread) return "proofread";
    }
    if (canModeTranslate) return "translate";
    if (canModeProofread) return "proofread";
    return "readonly";
  }

  function defaultFilterForMode(mode) {
    if (mode === "translate") return "todo";
    if (mode === "proofread") return "pending";
    return "all";
  }

  function effectiveCanSuggest() {
    return canEdit && workMode === "translate";
  }

  function effectiveCanApprove() {
    return canApprove && workMode === "proofread";
  }

  function syncModeUrl(mode) {
    const url = new URL(location.href);
    if (mode === "translate" || mode === "proofread") {
      url.searchParams.set("mode", mode);
    } else {
      url.searchParams.delete("mode");
    }
    history.replaceState(null, "", url.toString());
  }

  function updateModeSegmentUi() {
    const seg = document.getElementById("editor-mode");
    if (!seg) return;
    seg.querySelectorAll("[data-mode]").forEach((btn) => {
      const m = btn.getAttribute("data-mode");
      const active = m === workMode;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function applyModeUi() {
    root.dataset.mode = workMode;
    root.classList.toggle("is-mode-translate", workMode === "translate");
    root.classList.toggle("is-mode-proofread", workMode === "proofread");
    root.classList.toggle("is-mode-readonly", workMode === "readonly");

    const suggest = effectiveCanSuggest();
    const compose = document.getElementById("editor-compose");
    const modeHint = document.getElementById("editor-mode-hint");
    if (compose) {
      compose.classList.toggle("is-compose-hidden", workMode === "proofread");
      compose.classList.toggle("is-compose-readonly", !suggest);
    }
    if (modeHint) {
      modeHint.hidden = workMode !== "proofread";
    }
    if (els.draft) {
      els.draft.readOnly = !suggest;
      els.draft.placeholder = suggest
        ? "输入译文…"
        : workMode === "proofread"
          ? "审核模式：在右侧建议中批准"
          : "只读";
    }
    if (els.saveBtn) els.saveBtn.hidden = !suggest;
    if (els.saveOnlyBtn) els.saveOnlyBtn.hidden = !suggest;
    if (els.insertSourceBtn) els.insertSourceBtn.hidden = !suggest;
    const more = document.querySelector(".editor-compose__more");
    if (more) more.hidden = !suggest;

    setSaveHint("idle");
    updateModeSegmentUi();
    updateEmptyListCopy();
  }

  function updateEmptyListCopy() {
    const msg = document.getElementById("editor-list-empty-msg");
    if (!msg) return;
    if (workMode === "translate" && els.filter?.value === "todo") {
      msg.textContent = "没有待翻译词条";
    } else if (workMode === "proofread" && els.filter?.value === "pending") {
      msg.textContent = "没有待批准词条";
    } else {
      msg.textContent = "没有匹配的字符串";
    }
  }

  function setWorkMode(mode, opts = {}) {
    const next =
      mode === "translate" && canModeTranslate
        ? "translate"
        : mode === "proofread" && canModeProofread
          ? "proofread"
          : resolveWorkMode();
    const changed = next !== workMode;
    workMode = next;
    writeStoredMode(workMode);
    syncModeUrl(workMode);
    if (opts.resetFilter !== false && els.filter) {
      els.filter.value = defaultFilterForMode(workMode);
    }
    applyModeUi();
    if (opts.reload !== false && (changed || opts.forceReload)) {
      activeId = null;
      loadList();
    } else if (detail && activeId) {
      renderSuggestions(detail);
      updateExtrasUi(detail);
    }
  }

  function reloadShortcuts() {
    if (!shortcutsApi) return;
    shortcuts = shortcutsApi.load();
    applyShortcutHints();
  }

  function matchAction(e, actionId) {
    if (shortcutsApi && shortcuts) {
      return shortcutsApi.matches(e, shortcuts[actionId]);
    }
    // Fallback if shortcuts module failed to load
    const fallback = {
      saveAndNext: () => e.key === "Enter" && (e.ctrlKey || e.metaKey),
      saveOnly: () =>
        (e.key === "s" || e.key === "S") && (e.ctrlKey || e.metaKey),
      insertSource: () =>
        (e.key === "i" || e.key === "I") &&
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey,
      prevString: () => e.key === "ArrowUp" && !e.metaKey && !e.ctrlKey,
      nextString: () => e.key === "ArrowDown" && !e.metaKey && !e.ctrlKey,
      sendComment: () => e.key === "Enter" && (e.ctrlKey || e.metaKey),
    };
    return Boolean(fallback[actionId]?.());
  }

  function applyShortcutHints() {
    if (!shortcutsApi || !shortcuts) return;
    const f = (id) => shortcutsApi.format(shortcuts[id]);
    if (els.saveBtn) els.saveBtn.title = f("saveAndNext");
    if (els.saveOnlyBtn) els.saveOnlyBtn.title = f("saveOnly");
    if (els.insertSourceBtn) {
      els.insertSourceBtn.title = `${f("insertSource")} 在光标处插入源文`;
    }
    if (els.prev) els.prev.title = `上一条 (${f("prevString")})`;
    if (els.next) els.next.title = `下一条 (${f("nextString")})`;
    if (els.saveHint && effectiveCanSuggest()) {
      els.saveHint.title = `${f("saveAndNext")} 保存并下一条 · ${f("saveOnly")} 仅保存 · ${f("insertSource")} 插入原文`;
    }
    if (els.commentBody) {
      els.commentBody.placeholder = `讨论语境、术语… (${f("sendComment")} 发送)`;
    }
  }

  const els = {
    file: document.getElementById("editor-file"),
    locale: document.getElementById("editor-locale"),
    filter: document.getElementById("editor-filter"),
    q: document.getElementById("editor-q"),
    refresh: document.getElementById("editor-refresh"),
    count: document.getElementById("editor-count"),
    progress: document.getElementById("editor-progress"),
    progressEmpty: document.getElementById("editor-progress-empty"),
    progressApproved: document.getElementById("editor-progress-approved"),
    progressSuggested: document.getElementById("editor-progress-suggested"),
    progressText: document.getElementById("editor-progress-text"),
    error: document.getElementById("editor-error"),
    loading: document.getElementById("editor-loading"),
    body: document.getElementById("editor-body"),
    list: document.getElementById("editor-list"),
    listEmpty: document.getElementById("editor-list-empty"),
    listCol: document.getElementById("editor-list-col"),
    sideCol: document.getElementById("editor-side-col"),
    toggleList: document.getElementById("editor-toggle-list"),
    toggleSide: document.getElementById("editor-toggle-side"),
    drawerBackdrop: document.getElementById("editor-drawer-backdrop"),
    panelEmpty: document.getElementById("editor-panel-empty"),
    panelActive: document.getElementById("editor-panel-active"),
    key: document.getElementById("editor-key"),
    source: document.getElementById("editor-source"),
    draft: document.getElementById("editor-draft"),
    saveHint: document.getElementById("editor-save-hint"),
    saveBtn: document.getElementById("editor-save-suggestion"),
    saveOnlyBtn: document.getElementById("editor-save-only"),
    insertSourceBtn: document.getElementById("editor-insert-source"),
    deleteBtn: document.getElementById("editor-delete-suggestion"),
    mtBtn: document.getElementById("editor-mt"),
    assignBtn: document.getElementById("editor-assign-task"),
    prev: document.getElementById("editor-prev"),
    next: document.getElementById("editor-next"),
    suggestions: document.getElementById("editor-suggestions"),
    workflow: document.getElementById("editor-workflow"),
    comments: document.getElementById("editor-comments"),
    commentBody: document.getElementById("editor-comment-body"),
    commentSend: document.getElementById("editor-comment-send"),
    glossary: document.getElementById("editor-glossary"),
    glossaryList: document.getElementById("editor-glossary-list"),
    tm: document.getElementById("editor-tm"),
    tmList: document.getElementById("editor-tm-list"),
    contexts: document.getElementById("editor-contexts"),
    contextsList: document.getElementById("editor-contexts-list"),
    contextFile: document.getElementById("editor-context-file"),
    contextCaption: document.getElementById("editor-context-caption"),
    contextUpload: document.getElementById("editor-context-upload"),
  };

  let strings = [];
  let total = 0;
  let activeId = null;
  let detail = null;
  let saving = false;
  let mtBusy = false;
  /** Monotonic id so out-of-order list responses (fast typing) are ignored */
  let listRequestId = 0;
  /** Matches CSS drawer breakpoint for list/side overlays */
  const mqDrawer = window.matchMedia("(max-width: 900px)");

  /** @param {'loading'|'workspace'} state */
  function setShellState(state) {
    if (els.loading) els.loading.hidden = state !== "loading";
    if (els.body) els.body.hidden = state !== "workspace";
  }

  function isSearchFocused() {
    return Boolean(els.q && document.activeElement === els.q);
  }

  function restoreSearchFocus() {
    if (!els.q) return;
    requestAnimationFrame(() => {
      try {
        els.q.focus({ preventScroll: true });
      } catch {
        els.q.focus();
      }
    });
  }

  function showError(msg) {
    if (!msg) {
      els.error.hidden = true;
      els.error.textContent = "";
      return;
    }
    els.error.hidden = false;
    els.error.textContent = msg;
  }

  function setSaveHint(state) {
    if (!els.saveHint) return;
    els.saveHint.classList.remove("is-saving", "is-saved", "is-error");
    if (state === "saving") {
      els.saveHint.classList.add("is-saving");
      els.saveHint.innerHTML =
        `<span class="loading-spinner sm save-hint__spinner" aria-hidden="true"></span>保存中...`;
    } else if (state === "saved") {
      els.saveHint.classList.add("is-saved");
      els.saveHint.textContent = "已保存";
    } else if (state === "error") {
      els.saveHint.classList.add("is-error");
      els.saveHint.textContent = "保存失败";
    } else {
      els.saveHint.textContent = effectiveCanSuggest()
        ? "就绪"
        : workMode === "proofread"
          ? "审核中"
          : "只读";
    }
  }

  /**
   * Three-segment bar for current file × locale (L→R):
   * green approved · yellow has suggestion · gray empty
   */
  function renderProgress(stats) {
    const total = Math.max(0, Number(stats?.total) || 0);
    const approved = Math.max(0, Math.min(total, Number(stats?.approved) || 0));
    const suggestedRaw = Math.max(0, Number(stats?.suggested) || 0);
    // suggested API count includes approved strings → yellow = suggested − approved
    const suggestedOnly = Math.max(0, Math.min(total - approved, suggestedRaw - approved));
    const empty = Math.max(0, total - approved - suggestedOnly);

    const setFlex = (el, n) => {
      if (!el) return;
      el.style.flex = total === 0 ? (el === els.progressEmpty ? "1" : "0") : String(n);
    };
    setFlex(els.progressApproved, approved);
    setFlex(els.progressSuggested, suggestedOnly);
    setFlex(els.progressEmpty, empty);

    const pct = (n) => (total === 0 ? 0 : Math.round((n / total) * 100));
    const title = total
      ? `已批准 ${approved}（${pct(approved)}%）· 有译文 ${suggestedOnly}（${pct(suggestedOnly)}%）· 未翻译 ${empty}（${pct(empty)}%）· 共 ${total}`
      : "暂无字符串";
    if (els.progress) {
      els.progress.title = title;
      els.progress.setAttribute("aria-label", title);
    }
    if (els.progressText) {
      els.progressText.textContent = total
        ? `${approved + suggestedOnly}/${total} · ${pct(approved)}% 批准`
        : "0/0";
    }
  }

  async function loadProgress() {
    try {
      const { res, data } = await json(
        `/api/v1/orgs/${orgSlug}/projects/${projectSlug}/files/${fileId}`,
      );
      if (!res.ok) {
        renderProgress({ total: 0, approved: 0, suggested: 0 });
        return;
      }
      const byLocale = data.progress?.byLocale || [];
      const row = byLocale.find((p) => p.locale === locale);
      const total = data.progress?.totalStrings ?? row?.total ?? 0;
      renderProgress({
        total,
        approved: row?.translated ?? 0,
        suggested: row?.suggested ?? 0,
      });
    } catch {
      /* keep last bar */
    }
  }

  function focusDraft() {
    if (!effectiveCanSuggest() || !els.draft || els.panelActive?.hidden) return;
    requestAnimationFrame(() => {
      els.draft.focus({ preventScroll: true });
    });
  }

  function scrollActiveIntoView() {
    const activeBtn = els.list?.querySelector(".editor-list__item.is-active");
    activeBtn?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function syncDrawerUi() {
    const listOpen = !!els.body?.classList.contains("is-list-open");
    const sideOpen = !!els.body?.classList.contains("is-side-open");
    const anyOpen = listOpen || sideOpen;
    els.toggleList?.setAttribute("aria-expanded", listOpen ? "true" : "false");
    els.toggleSide?.setAttribute("aria-expanded", sideOpen ? "true" : "false");
    els.toggleList?.classList.toggle("is-active", listOpen);
    els.toggleSide?.classList.toggle("is-active", sideOpen);
    if (els.drawerBackdrop) {
      els.drawerBackdrop.hidden = !anyOpen;
    }
    document.documentElement.classList.toggle("is-editor-drawer-open", anyOpen);
  }

  function closeMobileDrawers() {
    els.body?.classList.remove("is-list-open", "is-side-open");
    syncDrawerUi();
  }

  function toggleListDrawer() {
    els.body?.classList.toggle("is-list-open");
    els.body?.classList.remove("is-side-open");
    syncDrawerUi();
  }

  function toggleSideDrawer() {
    els.body?.classList.toggle("is-side-open");
    els.body?.classList.remove("is-list-open");
    syncDrawerUi();
  }

  function showMainEmpty() {
    if (els.panelEmpty) els.panelEmpty.hidden = false;
    if (els.panelActive) els.panelActive.hidden = true;
  }

  function showMainActive() {
    if (els.panelEmpty) els.panelEmpty.hidden = true;
    if (els.panelActive) els.panelActive.hidden = false;
  }

  function workflowBadge(status) {
    if (status === "approved") return { cls: "status-dot--done", label: "已批准" };
    if (status === "suggested") return { cls: "status-dot--suggested", label: "有建议" };
    return { cls: "status-dot--empty", label: "未翻译" };
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return "";
    }
  }

  function renderList() {
    els.list.innerHTML = "";
    updateEmptyListCopy();
    if (els.listEmpty) els.listEmpty.hidden = strings.length > 0;

    strings.forEach((s) => {
      const wf = s.workflowStatus || "untranslated";
      const badge = workflowBadge(wf);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `editor-list__item${s.id === activeId ? " is-active" : ""}`;
      btn.innerHTML = `
        <span class="status-dot ${badge.cls}" title="${badge.label}"></span>
        <div class="editor-list__key"></div>
        <div class="editor-list__src"></div>
        <div class="editor-list__meta blora-text-faint u-text-xs"></div>
      `;
      btn.querySelector(".editor-list__key").textContent = s.keyPath;
      btn.querySelector(".editor-list__src").textContent = s.sourceText;
      const meta = [];
      if (s.suggestionCount) meta.push(`${s.suggestionCount} 条建议`);
      if (wf === "approved") meta.push("已批准");
      btn.querySelector(".editor-list__meta").textContent = meta.join(" · ");
      btn.addEventListener("click", () => selectString(s.id));
      els.list.appendChild(btn);
    });
  }

  /**
   * @param {{ preferId?: string|null, quiet?: boolean, keepSearchFocus?: boolean }} [opts]
   */
  async function loadList(opts = {}) {
    const preferId = opts.preferId || null;
    const quiet = Boolean(opts.quiet);
    const keepSearchFocus = Boolean(opts.keepSearchFocus) || isSearchFocused();
    const reqId = ++listRequestId;

    if (!quiet) {
      setShellState("loading");
      showError("");
    } else if (els.list) {
      // In-place refresh: dim list without tearing down the search field.
      els.list.setAttribute("aria-busy", "true");
      els.list.classList.add("is-loading");
    }

    const params = new URLSearchParams({
      locale,
      pageSize: "200",
    });
    const filter = els.filter?.value;
    if (filter && filter !== "all") params.set("status", filter);
    if (els.q?.value.trim()) params.set("q", els.q.value.trim());

    try {
      const { res, data } = await json(
        `/api/v1/orgs/${orgSlug}/projects/${projectSlug}/files/${fileId}/strings?${params}`,
      );
      if (reqId !== listRequestId) return;

      if (!res.ok) {
        showError(data.error || "加载失败");
        setShellState("workspace");
        strings = [];
        total = 0;
        if (els.count) els.count.textContent = "0/0";
        renderList();
        showMainEmpty();
        clearSidePanels();
        if (!quiet) loadProgress();
        return;
      }
      strings = data.strings || [];
      total = data.total || 0;
      if (els.count) els.count.textContent = `${strings.length}/${total}`;
      setShellState("workspace");
      if (!quiet) loadProgress();

      if (!strings.length) {
        activeId = null;
        renderList();
        showMainEmpty();
        clearSidePanels();
        // On phone, surface the list so filters/search are discoverable
        if (!quiet && mqDrawer.matches) {
          els.body?.classList.add("is-list-open");
          els.body?.classList.remove("is-side-open");
          syncDrawerUi();
        }
        if (keepSearchFocus) restoreSearchFocus();
        return;
      }

      let pick = null;
      if (preferId && strings.some((s) => s.id === preferId)) {
        pick = preferId;
        pendingFocus = null;
      } else if (pendingFocus && strings.some((s) => s.id === pendingFocus)) {
        pick = pendingFocus;
        pendingFocus = null;
      } else if (activeId && strings.some((s) => s.id === activeId)) {
        pick = activeId;
      } else {
        pick = strings[0].id;
      }

      if (pick === activeId) {
        renderList();
        scrollActiveIntoView();
        await loadDetail(activeId);
        if (reqId !== listRequestId) return;
        if (keepSearchFocus) restoreSearchFocus();
        else focusDraft();
      } else {
        await selectString(pick, { focusDraft: !keepSearchFocus });
        if (reqId !== listRequestId) return;
        if (keepSearchFocus) restoreSearchFocus();
      }
    } catch {
      if (reqId !== listRequestId) return;
      showError("网络错误");
      setShellState("workspace");
      strings = [];
      renderList();
      showMainEmpty();
      if (keepSearchFocus) restoreSearchFocus();
    } finally {
      if (reqId === listRequestId && els.list) {
        els.list.removeAttribute("aria-busy");
        els.list.classList.remove("is-loading");
      }
    }
  }

  function clearSidePanels() {
    if (els.suggestions) {
      els.suggestions.innerHTML = `<div class="blora-text-faint u-text-sm">选择字符串查看建议</div>`;
    }
    if (els.tmList) {
      els.tmList.innerHTML = `<div class="blora-text-faint u-text-sm">暂无</div>`;
    }
    if (els.contextsList) {
      els.contextsList.innerHTML = `<div class="blora-text-faint u-text-sm">暂无截图语境</div>`;
    }
    if (els.comments) {
      els.comments.innerHTML = `<div class="blora-text-faint u-text-sm">暂无讨论</div>`;
    }
  }

  /**
   * @param {string} id
   * @param {{ focusDraft?: boolean }} [opts]
   */
  async function selectString(id, opts = {}) {
    activeId = id;
    renderList();
    scrollActiveIntoView();
    closeMobileDrawers();
    showMainActive();
    const row = strings.find((s) => s.id === id);
    if (row) {
      if (els.key) els.key.textContent = row.keyPath;
      if (els.source) els.source.textContent = row.sourceText;
    }
    await loadDetail(id);
    if (opts.focusDraft !== false) focusDraft();
  }

  async function loadDetail(stringId) {
    detail = null;
    if (els.suggestions) {
      els.suggestions.innerHTML =
        (window.BTC && window.BTC.loadingHtml
          ? window.BTC.loadingHtml({ size: "md", label: "加载中...", layout: "inline" })
          : `<div class="inline-loading" role="status"><div class="loading-spinner md" aria-hidden="true"></div><div>加载中...</div></div>`);
    }
    if (els.comments) els.comments.innerHTML = "";
    if (els.workflow) els.workflow.textContent = "";
    try {
      const { res, data } = await json(
        `/api/v1/orgs/${orgSlug}/projects/${projectSlug}/strings/${stringId}/translations/${encodeURIComponent(locale)}`,
      );
      if (!res.ok) {
        if (els.suggestions) {
          els.suggestions.innerHTML = `<div class="blora-alert blora-alert--danger">${data.error || "加载失败"}</div>`;
        }
        return;
      }
      detail = data;
      // Locale assignee may differ from SSR; keep mode switcher in sync
      if (typeof data.canApprove === "boolean") {
        canApprove = data.canApprove;
        canModeProofread = data.canApprove;
        const proofBtn = document.querySelector(
          '#editor-mode [data-mode="proofread"]',
        );
        if (proofBtn) {
          proofBtn.hidden = !canModeProofread;
        }
        if (workMode === "proofread" && !canModeProofread) {
          setWorkMode(canModeTranslate ? "translate" : "readonly", {
            reload: false,
            resetFilter: false,
          });
        }
      }
      if (typeof data.canSuggest === "boolean") {
        canModeTranslate = data.canSuggest || canEdit;
      }
      const mine = (data.suggestions || []).find((s) => s.isMine);
      if (els.draft) {
        if (workMode === "proofread") {
          const approved = (data.suggestions || []).find((s) => s.isApproved);
          els.draft.value = approved
            ? approved.text
            : mine
              ? mine.text
              : "";
        } else {
          els.draft.value = mine ? mine.text : "";
        }
      }
      setSaveHint("idle");

      const wf = data.workflowStatus || "untranslated";
      const badge = workflowBadge(wf);
      if (els.workflow) {
        els.workflow.innerHTML = `<span class="status-dot ${badge.cls}"></span> <strong>${badge.label}</strong>`;
        if (wf === "approved") {
          const approved = (data.suggestions || []).find((s) => s.isApproved);
          if (approved) {
            els.workflow.innerHTML +=
              ` · 定稿：` +
              escapeHtml(approved.text).slice(0, 80) +
              (approved.text.length > 80 ? "…" : "");
          }
        }
      }

      applyModeUi();
      renderSuggestions(data);
      renderComments(data.comments || [], data);
      renderGlossary(data.glossaryHits || []);
      renderTm(data.tmHits || []);
      renderContexts(data.contexts || [], data);
      updateExtrasUi(data);
    } catch {
      if (els.suggestions) {
        els.suggestions.innerHTML = `<div class="blora-alert blora-alert--danger">网络错误</div>`;
      }
    }
  }

  function updateExtrasUi(data) {
    if (els.mtBtn) {
      els.mtBtn.hidden = !(effectiveCanSuggest() && data.mtEnabled);
    }
    if (els.assignBtn) {
      els.assignBtn.hidden = !data.canManage || workMode === "proofread";
    }
  }

  function renderContexts(contexts, data) {
    if (!els.contextsList) return;
    const canUpload = effectiveCanSuggest() || data.canManage;
    if (els.contextFile) els.contextFile.hidden = !canUpload;
    if (els.contextCaption) els.contextCaption.hidden = !canUpload;
    if (els.contextUpload) els.contextUpload.hidden = !canUpload;

    els.contextsList.innerHTML = "";
    if (!contexts.length) {
      els.contextsList.innerHTML = `<div class="blora-text-faint u-text-sm">暂无截图语境</div>`;
      return;
    }
    contexts.forEach((c) => {
      const card = document.createElement("div");
      card.className = "context-shot";
      card.innerHTML = `
        <a class="context-shot__link" target="_blank" rel="noopener">
          <img class="context-shot__img" alt="" loading="lazy" />
        </a>
        <div class="context-shot__meta">
          <div class="context-shot__caption"></div>
          <div class="context-shot__by blora-text-faint u-text-xs"></div>
        </div>
        <div class="context-shot__actions"></div>
      `;
      const img = card.querySelector(".context-shot__img");
      const link = card.querySelector(".context-shot__link");
      // Prefer WebP preview from img.bloret.net for list display; open original on click.
      const original = c.imageUrl || "";
      const preview =
        c.webpUrl ||
        (original.includes("img.bloret.net") && !/\.webp($|\?)/i.test(original)
          ? original.replace(/(\/img\/\d+\/[a-f0-9]+)(\?.*)?$/i, "$1.webp$2")
          : original);
      img.src = preview;
      img.alt = c.caption || "截图语境";
      link.href = original;
      card.querySelector(".context-shot__caption").textContent = c.caption || "";
      card.querySelector(".context-shot__by").textContent = c.username
        ? `by ${c.username}`
        : "";
      if (data.canManage) {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "blora-btn blora-btn--ghost blora-btn--xs";
        del.textContent = "删除";
        del.addEventListener("click", () => deleteContext(c.id));
        card.querySelector(".context-shot__actions").appendChild(del);
      }
      els.contextsList.appendChild(card);
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("读取文件失败"));
      reader.readAsDataURL(file);
    });
  }

  async function uploadContext() {
    if (!activeId || !els.contextFile?.files?.length) {
      toast?.("error", "请选择图片");
      return;
    }
    const file = els.contextFile.files[0];
    if (!file.type.startsWith("image/")) {
      toast?.("error", "仅支持图片");
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const caption = els.contextCaption?.value?.trim() || null;
      const { res, data } = await json(
        `/api/v1/orgs/${orgSlug}/projects/${projectSlug}/strings/${activeId}/contexts`,
        {
          method: "POST",
          body: JSON.stringify({ imageBase64: dataUrl, caption }),
        },
      );
      if (!res.ok) {
        toast?.("error", data.error || "上传失败");
        return;
      }
      if (els.contextFile) els.contextFile.value = "";
      if (els.contextCaption) els.contextCaption.value = "";
      toast?.("success", "截图已上传");
      await loadDetail(activeId);
    } catch {
      toast?.("error", "上传失败");
    }
  }

  async function deleteContext(id) {
    if (!confirm("删除这张截图？")) return;
    try {
      const { res, data } = await json(
        `/api/v1/orgs/${orgSlug}/projects/${projectSlug}/contexts/${id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        toast?.("error", data.error || "删除失败");
        return;
      }
      if (activeId) await loadDetail(activeId);
    } catch {
      toast?.("error", "网络错误");
    }
  }

  async function runMachineTranslate() {
    if (!effectiveCanSuggest() || !activeId || mtBusy) return;
    const text = (els.source?.textContent || "").trim();
    if (!text) {
      toast?.("error", "源文为空");
      return;
    }
    mtBusy = true;
    if (els.mtBtn) {
      window.BTC?.setButtonBusy?.(els.mtBtn, true, { busyLabel: "翻译中..." });
    }
    try {
      const { res, data } = await json(
        `/api/v1/orgs/${orgSlug}/projects/${projectSlug}/mt`,
        {
          method: "POST",
          body: JSON.stringify({
            text,
            targetLocale: locale,
            sourceLocale: detail?.sourceLocale,
            stringId: activeId,
            asSuggestion: false,
          }),
        },
      );
      if (!res.ok) {
        toast?.("error", data.error || "机器翻译失败");
        return;
      }
      els.draft.value = data.text || "";
      els.draft.focus();
      toast?.("success", "已填入机器译文，请检查后保存建议");
    } catch {
      toast?.("error", "网络错误");
    } finally {
      mtBusy = false;
      if (els.mtBtn) {
        window.BTC?.setButtonBusy?.(els.mtBtn, false, { idleLabel: "机器翻译" });
      }
    }
  }

  /** Current string source text (from detail payload or list row). */
  function currentSourceText() {
    if (detail?.string?.sourceText != null) return String(detail.string.sourceText);
    if (detail?.sourceText != null) return String(detail.sourceText);
    const row = strings.find((s) => s.id === activeId);
    if (row?.sourceText != null) return String(row.sourceText);
    if (els.source?.textContent != null) return els.source.textContent;
    return "";
  }

  /**
   * Insert source into the draft at the caret (replaces selection if any).
   * @param {{ silent?: boolean }} [opts]
   */
  function insertSource(opts = {}) {
    if (!effectiveCanSuggest() || !els.draft || els.draft.readOnly) return false;
    const src = currentSourceText();
    if (!src) {
      if (!opts.silent) toast?.("error", "当前没有可插入的原文");
      return false;
    }
    const ta = els.draft;
    const start = typeof ta.selectionStart === "number" ? ta.selectionStart : ta.value.length;
    const end = typeof ta.selectionEnd === "number" ? ta.selectionEnd : start;
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);
    ta.value = before + src + after;
    const caret = start + src.length;
    try {
      ta.setSelectionRange(caret, caret);
    } catch {
      /* ignore */
    }
    ta.focus({ preventScroll: true });
    // Notify any listeners that rely on input events
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    if (!opts.silent) toast?.("success", "已插入原文");
    return true;
  }

  async function assignTask() {
    if (!activeId || !detail?.canManage) return;
    const username = window.prompt("指派给（用户名）：");
    if (!username || !username.trim()) return;
    const note = window.prompt("备注（可选）：") || "";
    try {
      const { res, data } = await json(
        `/api/v1/orgs/${orgSlug}/projects/${projectSlug}/tasks`,
        {
          method: "POST",
          body: JSON.stringify({
            locale,
            username: username.trim(),
            stringId: activeId,
            fileId,
            note: note.trim() || null,
          }),
        },
      );
      if (!res.ok) {
        toast?.("error", data.error || "指派失败");
        return;
      }
      toast?.("success", `已指派给 ${username.trim()}`);
    } catch {
      toast?.("error", "网络错误");
    }
  }

  function renderTm(hits) {
    if (!els.tmList) return;
    if (!hits.length) {
      els.tmList.innerHTML = `<div class="blora-text-faint u-text-sm">暂无翻译记忆匹配</div>`;
      return;
    }
    els.tmList.innerHTML = "";
    hits.forEach((h) => {
      const row = document.createElement("div");
      row.className = "tm-hit";
      const matchLabel =
        h.match === "exact" ? "完全匹配" : h.match === "contains" ? "包含" : "被包含";
      row.innerHTML = `
        <div class="tm-hit__score">${h.score}%</div>
        <div class="tm-hit__body">
          <div class="tm-hit__src"></div>
          <div class="tm-hit__dst"></div>
          <div class="tm-hit__meta blora-text-faint u-text-xs"></div>
        </div>
        <button type="button" class="blora-btn blora-btn--ghost blora-btn--xs" data-use>采用</button>
      `;
      row.querySelector(".tm-hit__src").textContent = h.sourceText;
      row.querySelector(".tm-hit__dst").textContent = h.translation;
      row.querySelector(".tm-hit__meta").textContent =
        `${matchLabel} · ${h.filePath} · ${h.keyPath}`;
      const use = row.querySelector("[data-use]");
      if (!effectiveCanSuggest()) {
        use.hidden = true;
      } else {
        use.addEventListener("click", () => {
          els.draft.value = h.translation;
          els.draft.focus();
          toast?.("success", "已采用 TM 译文，请保存建议");
        });
      }
      els.tmList.appendChild(row);
    });
  }

  function renderGlossary(hits) {
    if (!els.glossary || !els.glossaryList) return;
    if (!hits.length) {
      els.glossary.hidden = true;
      els.glossaryList.innerHTML = "";
      return;
    }
    els.glossary.hidden = false;
    els.glossaryList.innerHTML = "";
    hits.forEach((h) => {
      const row = document.createElement("div");
      row.className = "glossary-hit";
      row.innerHTML = `
        <span class="glossary-hit__src"></span>
        <span class="glossary-hit__arrow">→</span>
        <span class="glossary-hit__dst"></span>
        <button type="button" class="blora-btn blora-btn--ghost blora-btn--xs" data-use>填入</button>
      `;
      row.querySelector(".glossary-hit__src").textContent = h.sourceTerm;
      row.querySelector(".glossary-hit__dst").textContent =
        h.translation || "（未定义此语言译法）";
      const use = row.querySelector("[data-use]");
      if (!h.translation || !effectiveCanSuggest()) {
        use.hidden = true;
      } else {
        use.addEventListener("click", () => {
          const cur = els.draft.value;
          els.draft.value = cur ? cur + h.translation : h.translation;
          els.draft.focus();
          toast?.("success", `已填入术语「${h.sourceTerm}」`);
        });
      }
      if (h.description) {
        row.title = h.description;
      }
      els.glossaryList.appendChild(row);
    });
  }

  function renderSuggestions(data) {
    const list = data.suggestions || [];
    if (!list.length) {
      els.suggestions.innerHTML = `<div class="blora-text-faint u-text-sm">暂无建议，成为第一个译者吧</div>`;
      return;
    }
    els.suggestions.innerHTML = "";
    list.forEach((s) => {
      const card = document.createElement("div");
      card.className =
        "collab-card" +
        (s.isApproved ? " is-approved" : "") +
        (s.isMine ? " is-mine" : "");
      card.innerHTML = `
        <div class="collab-card__text"></div>
        <div class="collab-card__meta">
          <span class="collab-card__author"></span>
          <span class="collab-card__votes"></span>
          <span class="collab-card__time"></span>
          <span class="collab-card__badges"></span>
        </div>
        <div class="collab-card__actions blora-row u-gap-1"></div>
      `;
      card.querySelector(".collab-card__text").textContent = s.text;
      card.querySelector(".collab-card__author").textContent = s.authorUsername;
      card.querySelector(".collab-card__votes").textContent = `★ ${s.voteCount}`;
      card.querySelector(".collab-card__time").textContent = formatTime(s.updatedAt);
      const badges = card.querySelector(".collab-card__badges");
      if (s.isApproved) {
        const b = document.createElement("span");
        b.className = "blora-badge";
        b.textContent = "已批准";
        badges.appendChild(b);
      }
      if (s.isMine) {
        const b = document.createElement("span");
        b.className = "blora-badge blora-badge--pill";
        b.textContent = "我的";
        badges.appendChild(b);
      }

      const actions = card.querySelector(".collab-card__actions");
      if (effectiveCanSuggest() && !s.isMine && s.text.trim()) {
        const useBtn = document.createElement("button");
        useBtn.type = "button";
        useBtn.className = "blora-btn blora-btn--ghost blora-btn--xs";
        useBtn.textContent = "采用";
        useBtn.addEventListener("click", () => {
          els.draft.value = s.text;
          els.draft.focus();
          toast?.("success", "已填入编辑框，请点「保存」确认");
        });
        actions.appendChild(useBtn);
      }
      if (data.canVote && !s.isMine) {
        const voteBtn = document.createElement("button");
        voteBtn.type = "button";
        voteBtn.className =
          "blora-btn blora-btn--xs " +
          (s.votedByMe ? "blora-btn--primary" : "blora-btn--outline");
        voteBtn.textContent = s.votedByMe ? "取消投票" : "投票";
        voteBtn.addEventListener("click", () => voteSuggestion(s.id));
        actions.appendChild(voteBtn);
      }
      if (effectiveCanApprove() && data.canApprove && !s.isApproved && s.text.trim()) {
        const appr = document.createElement("button");
        appr.type = "button";
        appr.className = "blora-btn blora-btn--secondary blora-btn--xs";
        appr.textContent = "批准";
        appr.addEventListener("click", () => approveSuggestion(s.id));
        actions.appendChild(appr);
      }
      if (effectiveCanApprove() && data.canApprove && s.isApproved) {
        const un = document.createElement("button");
        un.type = "button";
        un.className = "blora-btn blora-btn--ghost blora-btn--xs";
        un.textContent = "取消批准";
        un.addEventListener("click", () => unapprove());
        actions.appendChild(un);
      }

      els.suggestions.appendChild(card);
    });
  }

  function renderComments(comments, data) {
    if (!els.comments) return;
    els.comments.innerHTML = "";
    if (!comments.length) {
      els.comments.innerHTML = `<div class="blora-text-faint u-text-sm">暂无讨论</div>`;
      return;
    }
    comments.forEach((c) => {
      const item = document.createElement("div");
      item.className = "collab-comment";
      item.innerHTML = `
        <div class="collab-comment__meta">
          <strong class="collab-comment__author"></strong>
          <span class="collab-comment__time"></span>
        </div>
        <div class="collab-comment__body"></div>
        <div class="collab-comment__actions"></div>
      `;
      item.querySelector(".collab-comment__author").textContent = c.authorUsername;
      item.querySelector(".collab-comment__time").textContent = formatTime(c.createdAt);
      item.querySelector(".collab-comment__body").textContent = c.body;
      const del = document.createElement("button");
      del.type = "button";
      del.className = "blora-btn blora-btn--ghost blora-btn--xs";
      del.textContent = "删除";
      del.addEventListener("click", () => deleteComment(c.id));
      item.querySelector(".collab-comment__actions").appendChild(del);
      els.comments.appendChild(item);
    });
  }

  /**
   * @param {{ advance?: boolean }} [opts]
   */
  async function saveSuggestion(opts = {}) {
    const advance = Boolean(opts.advance);
    if (!effectiveCanSuggest() || !activeId || saving) return;
    saving = true;
    setSaveHint("saving");

    const text = (els.draft?.value || "").trim();
    const idx = strings.findIndex((s) => s.id === activeId);
    const nextId =
      advance && text && idx >= 0 && idx < strings.length - 1
        ? strings[idx + 1].id
        : null;
    const atEnd = advance && text && idx >= 0 && idx === strings.length - 1;

    try {
      const { res, data } = await json(
        `/api/v1/orgs/${orgSlug}/projects/${projectSlug}/strings/${activeId}/suggestions/${encodeURIComponent(locale)}`,
        { method: "PUT", body: JSON.stringify({ text: els.draft.value }) },
      );
      if (!res.ok) {
        setSaveHint("error");
        toast?.("error", data.error || "保存失败");
        return;
      }
      setSaveHint("saved");
      if (advance && text) {
        toast?.("success", atEnd ? "已保存 · 本批已到最后一条" : "已保存，下一条");
      } else {
        toast?.("success", "建议已保存");
      }

      const preferId = nextId || activeId;
      await loadList({ preferId, quiet: true });
      focusDraft();
    } catch {
      setSaveHint("error");
    } finally {
      saving = false;
    }
  }

  async function deleteSuggestion() {
    if (!effectiveCanSuggest() || !activeId) return;
    if (!confirm("删除我的建议？")) return;
    try {
      const { res, data } = await json(
        `/api/v1/orgs/${orgSlug}/projects/${projectSlug}/strings/${activeId}/suggestions/${encodeURIComponent(locale)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        toast?.("error", data.error || "删除失败");
        return;
      }
      els.draft.value = "";
      toast?.("success", "已删除我的建议");
      await loadList({ quiet: true });
      if (activeId) await loadDetail(activeId);
    } catch {
      toast?.("error", "网络错误");
    }
  }

  async function voteSuggestion(id) {
    try {
      const { res, data } = await json(
        `/api/v1/orgs/${orgSlug}/projects/${projectSlug}/suggestions/${id}/votes`,
        { method: "POST", body: "{}" },
      );
      if (!res.ok) {
        toast?.("error", data.error || "投票失败");
        return;
      }
      if (activeId) await loadDetail(activeId);
    } catch {
      toast?.("error", "网络错误");
    }
  }

  async function approveSuggestion(id) {
    if (!effectiveCanApprove()) return;
    if (!confirm("批准该建议作为定稿译文？导出将使用此文本。")) return;
    try {
      const { res, data } = await json(
        `/api/v1/orgs/${orgSlug}/projects/${projectSlug}/suggestions/${id}/approve`,
        { method: "POST", body: "{}" },
      );
      if (!res.ok) {
        toast?.("error", data.error || "批准失败");
        return;
      }

      await loadList({ quiet: true });
      if (activeId) await loadDetail(activeId);
    } catch {
      toast?.("error", "网络错误");
    }
  }

  async function unapprove() {
    if (!effectiveCanApprove() || !activeId) return;
    if (!confirm("取消批准？定稿将清空（建议仍保留）。")) return;
    try {
      const { res, data } = await json(
        `/api/v1/orgs/${orgSlug}/projects/${projectSlug}/strings/${activeId}/translations/${encodeURIComponent(locale)}/unapprove`,
        { method: "POST", body: "{}" },
      );
      if (!res.ok) {
        toast?.("error", data.error || "操作失败");
        return;
      }
      toast?.("success", "已取消批准");
      await loadList({ quiet: true });
      if (activeId) await loadDetail(activeId);
    } catch {
      toast?.("error", "网络错误");
    }
  }

  async function sendComment() {
    if (!activeId || !els.commentBody) return;
    const body = els.commentBody.value.trim();
    if (!body) {
      toast?.("error", "请输入评论内容");
      return;
    }
    try {
      const { res, data } = await json(
        `/api/v1/orgs/${orgSlug}/projects/${projectSlug}/strings/${activeId}/comments`,
        {
          method: "POST",
          body: JSON.stringify({ body, locale }),
        },
      );
      if (!res.ok) {
        toast?.("error", data.error || "发送失败");
        return;
      }
      els.commentBody.value = "";
      toast?.("success", "评论已发送");
      await loadDetail(activeId);
    } catch {
      toast?.("error", "网络错误");
    }
  }

  async function deleteComment(id) {
    if (!confirm("删除这条评论？")) return;
    try {
      const { res, data } = await json(
        `/api/v1/orgs/${orgSlug}/projects/${projectSlug}/comments/${id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        toast?.("error", data.error || "删除失败");
        return;
      }
      if (activeId) await loadDetail(activeId);
    } catch {
      toast?.("error", "网络错误");
    }
  }

  function navigate(delta) {
    if (!activeId) return;
    const idx = strings.findIndex((s) => s.id === activeId);
    const next = strings[idx + delta];
    if (next) selectString(next.id);
  }

  function debounce(fn, ms) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  const debouncedSearch = debounce(() => {
    // Quiet in-place list refresh — never hide the workspace (would unmount the search field).
    loadList({ preferId: activeId, quiet: true, keepSearchFocus: true });
  }, 280);

  els.file?.addEventListener("change", () => {
    const url = new URL(location.href);
    url.searchParams.set("file", els.file.value);
    if (workMode === "translate" || workMode === "proofread") {
      url.searchParams.set("mode", workMode);
    }
    location.href = url.toString();
  });
  els.locale?.addEventListener("change", () => {
    const url = new URL(location.href);
    url.searchParams.set("locale", els.locale.value);
    if (workMode === "translate" || workMode === "proofread") {
      url.searchParams.set("mode", workMode);
    }
    location.href = url.toString();
  });
  els.filter?.addEventListener("change", () => {
    activeId = null;
    updateEmptyListCopy();
    loadList({ quiet: true });
  });
  els.q?.addEventListener("input", debouncedSearch);
  els.q?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      loadList({ preferId: activeId, quiet: true, keepSearchFocus: true });
    }
  });
  els.refresh?.addEventListener("click", () => loadList({ quiet: true, preferId: activeId }));
  els.saveBtn?.addEventListener("click", () => saveSuggestion({ advance: true }));
  els.saveOnlyBtn?.addEventListener("click", () => saveSuggestion({ advance: false }));
  els.insertSourceBtn?.addEventListener("click", () => insertSource());
  els.deleteBtn?.addEventListener("click", () => deleteSuggestion());
  els.mtBtn?.addEventListener("click", () => runMachineTranslate());
  els.assignBtn?.addEventListener("click", () => assignTask());
  els.contextUpload?.addEventListener("click", () => uploadContext());
  els.prev?.addEventListener("click", () => navigate(-1));
  els.next?.addEventListener("click", () => navigate(1));
  els.commentSend?.addEventListener("click", () => sendComment());
  els.toggleList?.addEventListener("click", () => toggleListDrawer());
  els.toggleSide?.addEventListener("click", () => toggleSideDrawer());
  els.drawerBackdrop?.addEventListener("click", () => closeMobileDrawers());
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && els.body && !els.body.hidden) {
      if (els.body.classList.contains("is-list-open") || els.body.classList.contains("is-side-open")) {
        e.preventDefault();
        closeMobileDrawers();
      }
    }
  });
  // Close drawers when crossing back to desktop layout
  const onDrawerMq = () => {
    if (!mqDrawer.matches) closeMobileDrawers();
  };
  if (typeof mqDrawer.addEventListener === "function") {
    mqDrawer.addEventListener("change", onDrawerMq);
  } else if (typeof mqDrawer.addListener === "function") {
    mqDrawer.addListener(onDrawerMq);
  }
  document.getElementById("editor-mode")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mode]");
    if (!btn || btn.hidden) return;
    const mode = btn.getAttribute("data-mode");
    if (mode === "translate" || mode === "proofread") {
      setWorkMode(mode, { forceReload: true });
    }
  });
  els.commentBody?.addEventListener("keydown", (e) => {
    if (matchAction(e, "sendComment")) {
      e.preventDefault();
      sendComment();
    }
  });
  els.draft?.addEventListener("keydown", (e) => {
    if (!effectiveCanSuggest()) return;
    if (matchAction(e, "insertSource")) {
      e.preventDefault();
      insertSource({ silent: true });
      return;
    }
    if (matchAction(e, "saveOnly")) {
      e.preventDefault();
      saveSuggestion({ advance: false });
      return;
    }
    if (matchAction(e, "saveAndNext")) {
      e.preventDefault();
      saveSuggestion({ advance: true });
    }
  });
  document.addEventListener("keydown", (e) => {
    if (
      e.target &&
      (e.target.tagName === "TEXTAREA" ||
        e.target.tagName === "INPUT" ||
        e.target.tagName === "SELECT")
    ) {
      return;
    }
    if (matchAction(e, "prevString")) {
      e.preventDefault();
      navigate(-1);
      return;
    }
    if (matchAction(e, "nextString")) {
      e.preventDefault();
      navigate(1);
    }
  });

  // Pick up shortcut changes from settings page in another tab
  window.addEventListener("storage", (e) => {
    if (e.key === shortcutsApi?.STORAGE_KEY) reloadShortcuts();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") reloadShortcuts();
  });

  // Init workbench mode (filter defaults + action focus) before first list load
  workMode = resolveWorkMode();
  writeStoredMode(workMode);
  syncModeUrl(workMode);
  if (els.filter) {
    els.filter.value = defaultFilterForMode(workMode);
  }
  applyModeUi();
  applyShortcutHints();
  loadList();
})();
