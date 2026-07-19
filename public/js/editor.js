/**
 * Crowdin-style collaboration editor:
 * suggestions · vote · approve · comments · use-as-mine
 */
(function () {
  const root = document.getElementById("translation-editor");
  if (!root) return;

  const { json, toast } = window.BTC;
  const orgSlug = root.dataset.orgSlug;
  const projectSlug = root.dataset.projectSlug;
  let fileId = root.dataset.fileId;
  let locale = root.dataset.locale;
  const canEdit = root.dataset.canEdit === "1";
  const canApprove = root.dataset.canApprove === "1";

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
    saveBtn: document.getElementById("editor-save-suggestion"),
    deleteBtn: document.getElementById("editor-delete-suggestion"),
    prev: document.getElementById("editor-prev"),
    next: document.getElementById("editor-next"),
    suggestions: document.getElementById("editor-suggestions"),
    workflow: document.getElementById("editor-workflow"),
    comments: document.getElementById("editor-comments"),
    commentBody: document.getElementById("editor-comment-body"),
    commentSend: document.getElementById("editor-comment-send"),
  };

  let strings = [];
  let total = 0;
  let activeId = null;
  let detail = null;
  let saving = false;

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
      els.saveHint.textContent = "保存中…";
    } else if (state === "saved") {
      els.saveHint.classList.add("is-saved");
      els.saveHint.textContent = "建议已保存";
    } else if (state === "error") {
      els.saveHint.classList.add("is-error");
      els.saveHint.textContent = "保存失败";
    } else {
      els.saveHint.textContent = canEdit ? "保存为建议（不定稿）· Ctrl/⌘+S" : "只读";
    }
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

  async function loadList() {
    els.loading.hidden = false;
    els.empty.hidden = true;
    els.body.hidden = true;
    showError("");
    const params = new URLSearchParams({
      locale,
      pageSize: "200",
    });
    const filter = els.filter.value;
    if (filter && filter !== "all") params.set("status", filter);
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
        await selectString(strings[0].id);
      } else {
        renderList();
        await loadDetail(activeId);
      }
    } catch {
      showError("网络错误");
      els.loading.hidden = true;
    }
  }

  async function selectString(id) {
    activeId = id;
    renderList();
    els.panelEmpty.hidden = true;
    els.panelActive.hidden = false;
    const row = strings.find((s) => s.id === id);
    if (row) {
      els.key.textContent = row.keyPath;
      els.source.textContent = row.sourceText;
    }
    await loadDetail(id);
  }

  async function loadDetail(stringId) {
    detail = null;
    els.suggestions.innerHTML = `<div class="blora-text-faint">加载建议…</div>`;
    if (els.comments) els.comments.innerHTML = "";
    els.workflow.textContent = "";
    try {
      const { res, data } = await json(
        `/api/v1/orgs/${orgSlug}/projects/${projectSlug}/strings/${stringId}/translations/${encodeURIComponent(locale)}`,
      );
      if (!res.ok) {
        els.suggestions.innerHTML = `<div class="blora-alert blora-alert--danger">${data.error || "加载失败"}</div>`;
        return;
      }
      detail = data;
      const mine = (data.suggestions || []).find((s) => s.isMine);
      els.draft.value = mine ? mine.text : "";
      setSaveHint("idle");

      const wf = data.workflowStatus || "untranslated";
      const badge = workflowBadge(wf);
      els.workflow.innerHTML = `<span class="status-dot ${badge.cls}"></span> <strong>${badge.label}</strong>`;
      if (wf === "approved") {
        const approved = (data.suggestions || []).find((s) => s.isApproved);
        if (approved) {
          els.workflow.innerHTML +=
            ` · 定稿：` + escapeHtml(approved.text).slice(0, 80) + (approved.text.length > 80 ? "…" : "");
        }
      }

      renderSuggestions(data);
      renderComments(data.comments || [], data);
    } catch {
      els.suggestions.innerHTML = `<div class="blora-alert blora-alert--danger">网络错误</div>`;
    }
  }

  function renderSuggestions(data) {
    const list = data.suggestions || [];
    if (!list.length) {
      els.suggestions.innerHTML = `<div class="blora-text-faint">暂无建议，成为第一个译者吧</div>`;
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
      if (canEdit && !s.isMine && s.text.trim()) {
        const useBtn = document.createElement("button");
        useBtn.type = "button";
        useBtn.className = "blora-btn blora-btn--ghost blora-btn--xs";
        useBtn.textContent = "采用为我的建议";
        useBtn.addEventListener("click", () => {
          els.draft.value = s.text;
          els.draft.focus();
          toast?.("success", "已填入编辑框，请点「保存建议」确认");
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
      if (data.canApprove && !s.isApproved && s.text.trim()) {
        const appr = document.createElement("button");
        appr.type = "button";
        appr.className = "blora-btn blora-btn--secondary blora-btn--xs";
        appr.textContent = "批准";
        appr.addEventListener("click", () => approveSuggestion(s.id));
        actions.appendChild(appr);
      }
      if (data.canApprove && s.isApproved) {
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
      els.comments.innerHTML = `<div class="blora-text-faint">暂无讨论</div>`;
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
      // Delete: API enforces own-or-moderator
      const del = document.createElement("button");
      del.type = "button";
      del.className = "blora-btn blora-btn--ghost blora-btn--xs";
      del.textContent = "删除";
      del.addEventListener("click", () => deleteComment(c.id));
      item.querySelector(".collab-comment__actions").appendChild(del);
      els.comments.appendChild(item);
    });
  }

  async function saveSuggestion() {
    if (!canEdit || !activeId || saving) return;
    saving = true;
    setSaveHint("saving");
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
      toast?.("success", "建议已保存");
      await loadList();
      if (activeId) await loadDetail(activeId);
    } catch {
      setSaveHint("error");
    } finally {
      saving = false;
    }
  }

  async function deleteSuggestion() {
    if (!canEdit || !activeId) return;
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
      await loadList();
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
      toast?.("success", "已批准");
      await loadList();
      if (activeId) await loadDetail(activeId);
    } catch {
      toast?.("error", "网络错误");
    }
  }

  async function unapprove() {
    if (!activeId) return;
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
      await loadList();
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

  els.file?.addEventListener("change", () => {
    const url = new URL(location.href);
    url.searchParams.set("file", els.file.value);
    location.href = url.toString();
  });
  els.locale?.addEventListener("change", () => {
    const url = new URL(location.href);
    url.searchParams.set("locale", els.locale.value);
    location.href = url.toString();
  });
  els.filter?.addEventListener("change", () => {
    activeId = null;
    loadList();
  });
  els.q?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loadList();
  });
  els.refresh?.addEventListener("click", () => loadList());
  els.saveBtn?.addEventListener("click", () => saveSuggestion());
  els.deleteBtn?.addEventListener("click", () => deleteSuggestion());
  els.prev?.addEventListener("click", () => navigate(-1));
  els.next?.addEventListener("click", () => navigate(1));
  els.commentSend?.addEventListener("click", () => sendComment());
  els.commentBody?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendComment();
    }
  });
  els.draft?.addEventListener("keydown", (e) => {
    if ((e.key === "s" || e.key === "S") && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveSuggestion();
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveSuggestion().then(() => navigate(1));
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT")) return;
    if (e.key === "ArrowUp" && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      navigate(-1);
    }
    if (e.key === "ArrowDown" && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      navigate(1);
    }
  });

  loadList();
})();
