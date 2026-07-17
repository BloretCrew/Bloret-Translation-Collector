(function () {
  const root = document.getElementById("translation-editor");
  if (!root) return;

  const { json } = window.BTC;
  const orgSlug = root.dataset.orgSlug;
  const projectSlug = root.dataset.projectSlug;
  let fileId = root.dataset.fileId;
  let locale = root.dataset.locale;
  const canEdit = root.dataset.canEdit === "1";

  const els = {
    file: document.getElementById("editor-file"),
    locale: document.getElementById("editor-locale"),
    filter: document.getElementById("editor-filter"),
    q: document.getElementById("editor-q"),
    refresh: document.getElementById("editor-refresh"),
    count: document.getElementById("editor-count"),
    error: document.getElementById("editor-error"),
    loading: document.getElementById("editor-loading"),
    empty: document.getElementById("editor-empty"),
    body: document.getElementById("editor-body"),
    list: document.getElementById("editor-list"),
    panelEmpty: document.getElementById("editor-panel-empty"),
    panelActive: document.getElementById("editor-panel-active"),
    key: document.getElementById("editor-key"),
    source: document.getElementById("editor-source"),
    draft: document.getElementById("editor-draft"),
    saveHint: document.getElementById("editor-save-hint"),
    localeLabel: document.getElementById("editor-locale-label"),
    prev: document.getElementById("editor-prev"),
    next: document.getElementById("editor-next"),
  };

  let strings = [];
  let total = 0;
  let activeId = null;
  let saveTimer = null;
  let lastSavedDraft = "";

  function setSaveState(state) {
    els.saveHint.classList.remove("is-saving", "is-saved", "is-error");
    if (state === "saving") {
      els.saveHint.classList.add("is-saving");
      els.saveHint.textContent = "保存中…";
    } else if (state === "saved") {
      els.saveHint.classList.add("is-saved");
      els.saveHint.textContent = "已保存";
    } else if (state === "error") {
      els.saveHint.classList.add("is-error");
      els.saveHint.textContent = "保存失败";
    } else {
      els.saveHint.textContent = canEdit ? "自动保存" : "只读";
    }
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

  function getActive() {
    return strings.find((s) => s.id === activeId) || null;
  }

  function selectString(row) {
    activeId = row.id;
    lastSavedDraft = row.translation || "";
    els.draft.value = lastSavedDraft;
    setSaveState("idle");
    renderList();
    els.panelEmpty.hidden = true;
    els.panelActive.hidden = false;
    els.key.textContent = row.keyPath;
    els.source.textContent = row.sourceText;
  }

  function renderList() {
    els.list.innerHTML = "";
    strings.forEach((s) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `editor-list__item${s.id === activeId ? " is-active" : ""}`;
      const done = s.status === "translated" && s.translation;
      btn.innerHTML = `
        <span class="status-dot ${done ? "status-dot--done" : "status-dot--empty"}"></span>
        <div class="editor-list__key"></div>
        <div class="editor-list__src"></div>
      `;
      btn.querySelector(".editor-list__key").textContent = s.keyPath;
      btn.querySelector(".editor-list__src").textContent = s.sourceText;
      btn.addEventListener("click", () => selectString(s));
      els.list.appendChild(btn);
    });
  }

  async function load() {
    els.loading.hidden = false;
    els.empty.hidden = true;
    els.body.hidden = true;
    showError("");
    const params = new URLSearchParams({
      locale,
      pageSize: "200",
    });
    const filter = els.filter.value;
    if (filter !== "all") params.set("status", filter);
    if (els.q.value.trim()) params.set("q", els.q.value.trim());

    try {
      const { res, data } = await json(
        `/api/v1/orgs/${orgSlug}/projects/${projectSlug}/files/${fileId}/strings?${params}`,
      );
      if (!res.ok) {
        showError(data.error || "加载失败");
        return;
      }
      strings = data.strings || [];
      total = data.total || 0;
      els.count.textContent = `${strings.length}/${total}`;
      els.loading.hidden = true;
      if (!strings.length) {
        els.empty.hidden = false;
        activeId = null;
        return;
      }
      els.body.hidden = false;
      if (!activeId || !strings.some((s) => s.id === activeId)) {
        selectString(strings[0]);
      } else {
        renderList();
        const active = getActive();
        if (active) selectString(active);
      }
    } catch {
      showError("网络错误");
      els.loading.hidden = true;
    }
  }

  function navigate(delta) {
    const active = getActive();
    if (!active) return;
    const idx = strings.findIndex((s) => s.id === active.id);
    const next = strings[idx + delta];
    if (next) selectString(next);
  }

  function scheduleSave() {
    if (!canEdit) return;
    const active = getActive();
    if (!active) return;
    const draft = els.draft.value;
    if (draft === lastSavedDraft) {
      setSaveState("idle");
      return;
    }
    setSaveState("saving");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        const { res, data } = await json(
          `/api/v1/orgs/${orgSlug}/projects/${projectSlug}/strings/${active.id}/translations/${locale}`,
          { method: "PUT", body: JSON.stringify({ text: draft }) },
        );
        if (!res.ok) {
          setSaveState("error");
          return;
        }
        lastSavedDraft = data.text;
        strings = strings.map((s) =>
          s.id === active.id ? { ...s, translation: data.text, status: data.status } : s,
        );
        setSaveState("saved");
        renderList();
      } catch {
        setSaveState("error");
      }
    }, 400);
  }

  els.file.addEventListener("change", () => {
    const url = new URL(location.href);
    url.searchParams.set("file", els.file.value);
    location.href = url.toString();
  });
  els.locale.addEventListener("change", () => {
    const url = new URL(location.href);
    url.searchParams.set("locale", els.locale.value);
    location.href = url.toString();
  });
  els.filter.addEventListener("change", () => {
    activeId = null;
    load();
  });
  els.q.addEventListener("keydown", (e) => {
    if (e.key === "Enter") load();
  });
  els.refresh.addEventListener("click", () => load());
  els.draft.addEventListener("input", scheduleSave);
  els.draft.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      navigate(1);
    }
  });
  els.prev.addEventListener("click", () => navigate(-1));
  els.next.addEventListener("click", () => navigate(1));

  els.localeLabel.textContent = locale;
  load();
})();
