/**
 * Glossary + locale assignees management on project settings page.
 */
(function () {
  const { json, toast, showError } = window.BTC || {};
  if (!json) return;

  const glossaryPanel = document.getElementById("glossary-panel");
  const assigneesPanel = document.getElementById("assignees-panel");

  function base(panel) {
    return {
      org: panel.dataset.orgSlug,
      project: panel.dataset.projectSlug,
      locales: (panel.dataset.locales || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }

  // —— Glossary ——
  if (glossaryPanel) {
    const { org, project, locales } = base(glossaryPanel);
    const listEl = document.getElementById("glossary-list");
    const form = document.getElementById("glossary-add-form");
    const trFields = document.getElementById("glossary-tr-fields");

    if (trFields) {
      locales.forEach((loc) => {
        const label = document.createElement("label");
        label.className = "blora-field";
        label.style.minWidth = "8rem";
        label.innerHTML = `<span class="blora-field__label">${loc}</span>
          <input class="blora-input" name="tr_${loc}" placeholder="${loc} 译法" />`;
        trFields.appendChild(label);
      });
    }

    async function loadGlossary() {
      if (!listEl) return;
      listEl.innerHTML =
        window.BTC?.loadingHtml?.({ size: "md", label: BTC.t('加载中...'), layout: "inline" }) ||
        `<div class="inline-loading" role="status"><div class="loading-spinner md" aria-hidden="true"></div><div>加载中...</div></div>`;
      const { res, data } = await json(
        `/api/v1/orgs/${org}/projects/${project}/glossary`,
      );
      if (!res.ok) {
        listEl.innerHTML = `<div class="blora-alert blora-alert--danger">${data.error || BTC.t('加载失败')}</div>`;
        return;
      }
      const terms = data.terms || [];
      if (!terms.length) {
        listEl.innerHTML = `<div class="blora-text-faint">暂无术语</div>`;
        return;
      }
      listEl.innerHTML = "";
      terms.forEach((t) => {
        const card = document.createElement("div");
        card.className = "glossary-item";
        const trs = (t.translations || [])
          .map((tr) => `<span class="blora-badge">${tr.locale}: ${tr.translation}</span>`)
          .join(" ");
        card.innerHTML = `
          <div class="glossary-item__head">
            <strong class="glossary-item__term"></strong>
            <button type="button" class="blora-btn blora-btn--danger blora-btn--xs" data-del>删除</button>
          </div>
          <div class="glossary-item__desc blora-text-faint"></div>
          <div class="glossary-item__trs blora-row u-gap-1" style="flex-wrap:wrap"></div>
          <div class="glossary-item__edit blora-row u-mt-2" style="flex-wrap:wrap;gap:6px;align-items:flex-end"></div>
        `;
        card.querySelector(".glossary-item__term").textContent = t.sourceTerm;
        card.querySelector(".glossary-item__desc").textContent = t.description || "";
        card.querySelector(".glossary-item__trs").innerHTML = trs || "<span class='blora-text-faint'>尚未填写目标语言译法</span>";

        const edit = card.querySelector(".glossary-item__edit");
        locales.forEach((loc) => {
          const existing = (t.translations || []).find((x) => x.locale === loc);
          const wrap = document.createElement("label");
          wrap.className = "blora-field";
          wrap.style.margin = "0";
          wrap.style.minWidth = "7rem";
          wrap.innerHTML = `<span class="blora-field__label">${loc}</span>
            <input class="blora-input" data-loc="${loc}" value="${existing ? existing.translation.replace(/"/g, "&quot;") : ""}" />`;
          edit.appendChild(wrap);
        });
        const save = document.createElement("button");
        save.type = "button";
        save.className = "blora-btn blora-btn--ghost blora-btn--sm";
        save.textContent = BTC.t('保存译法');
        save.addEventListener("click", async () => {
          window.BTC?.setButtonBusy?.(save, true, { busyLabel: BTC.t('保存中...') });
          try {
            for (const loc of locales) {
              const input = edit.querySelector(`input[data-loc="${loc}"]`);
              const val = input?.value?.trim();
              if (!val) continue;
              const r = await json(
                `/api/v1/orgs/${org}/projects/${project}/glossary/${t.id}/translations/${encodeURIComponent(loc)}`,
                { method: "PUT", body: JSON.stringify({ translation: val }) },
              );
              if (!r.res.ok) {
                toast?.("error", r.data.error || BTC.t('保存失败'));
                return;
              }
            }
            toast?.("success", BTC.t('术语译法已保存'));
            loadGlossary();
          } finally {
            window.BTC?.setButtonBusy?.(save, false, { idleLabel: BTC.t('保存译法') });
          }
        });
        edit.appendChild(save);

        card.querySelector("[data-del]").addEventListener("click", async () => {
          if (!confirm(`删除术语「${t.sourceTerm}」？`)) return;
          const delBtn = card.querySelector("[data-del]");
          window.BTC?.setButtonBusy?.(delBtn, true, { busyLabel: BTC.t('删除中...') });
          try {
            const r = await json(
              `/api/v1/orgs/${org}/projects/${project}/glossary/${t.id}`,
              { method: "DELETE" },
            );
            if (!r.res.ok) {
              toast?.("error", r.data.error || BTC.t('删除失败'));
              return;
            }
            loadGlossary();
          } finally {
            window.BTC?.setButtonBusy?.(delBtn, false, { idleLabel: BTC.t('删除') });
          }
        });
        listEl.appendChild(card);
      });
    }

    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const fd = new FormData(form);
      const translations = locales
        .map((loc) => ({
          locale: loc,
          translation: String(fd.get(`tr_${loc}`) || "").trim(),
        }))
        .filter((t) => t.translation);
      window.BTC?.setButtonBusy?.(btn, true, { busyLabel: BTC.t('添加中...') });
      try {
        const { res, data } = await json(
          `/api/v1/orgs/${org}/projects/${project}/glossary`,
          {
            method: "POST",
            body: JSON.stringify({
              sourceTerm: fd.get("sourceTerm"),
              description: fd.get("description") || null,
              translations,
            }),
          },
        );
        if (!res.ok) {
          toast?.("error", data.error || BTC.t('添加失败'));
          return;
        }
        toast?.("success", BTC.t('术语已添加'));
        form.reset();
        loadGlossary();
      } finally {
        window.BTC?.setButtonBusy?.(btn, false);
      }
    });

    loadGlossary();
  }

  // —— Assignees ——
  if (assigneesPanel) {
    const { org, project, locales } = base(assigneesPanel);
    const listEl = document.getElementById("assignees-list");
    const form = document.getElementById("assignee-add-form");
    const localeSel = document.getElementById("assignee-locale");

    if (localeSel) {
      locales.forEach((loc) => {
        const opt = document.createElement("option");
        opt.value = loc;
        opt.textContent = loc;
        localeSel.appendChild(opt);
      });
    }

    async function loadAssignees() {
      if (!listEl) return;
      listEl.innerHTML =
        window.BTC?.loadingHtml?.({ size: "md", label: BTC.t('加载中...'), layout: "inline" }) ||
        `<div class="inline-loading" role="status"><div class="loading-spinner md" aria-hidden="true"></div><div>加载中...</div></div>`;
      const { res, data } = await json(
        `/api/v1/orgs/${org}/projects/${project}/assignees`,
      );
      if (!res.ok) {
        listEl.innerHTML = `<div class="blora-alert blora-alert--danger">${data.error || BTC.t('加载失败')}</div>`;
        return;
      }
      const rows = data.assignees || [];
      if (!rows.length) {
        listEl.innerHTML = `<div class="blora-text-faint">尚未指派语言负责人</div>`;
        return;
      }
      listEl.innerHTML = "";
      const table = document.createElement("table");
      table.className = "blora-table";
      table.innerHTML = `<thead><tr><th>语言</th><th>用户</th><th>职责</th><th></th></tr></thead><tbody></tbody>`;
      const tbody = table.querySelector("tbody");
      rows.forEach((a) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td></td><td></td><td></td><td></td>`;
        tr.cells[0].textContent = a.locale;
        tr.cells[1].textContent = a.username;
        tr.cells[2].textContent = a.kind === "proofreader" ? BTC.t('审核员') : BTC.t('译者');
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "blora-btn blora-btn--danger blora-btn--xs";
        btn.textContent = BTC.t('移除');
        btn.addEventListener("click", async () => {
          if (!confirm(`移除 ${a.username} 的 ${a.locale} 指派？`)) return;
          window.BTC?.setButtonBusy?.(btn, true, { busyLabel: BTC.t('移除中...') });
          try {
            const r = await json(
              `/api/v1/orgs/${org}/projects/${project}/assignees/${a.id}`,
              { method: "DELETE" },
            );
            if (!r.res.ok) {
              toast?.("error", r.data.error || BTC.t('移除失败'));
              return;
            }
            loadAssignees();
          } finally {
            window.BTC?.setButtonBusy?.(btn, false, { idleLabel: BTC.t('移除') });
          }
        });
        tr.cells[3].appendChild(btn);
        tbody.appendChild(tr);
      });
      listEl.appendChild(table);
    }

    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      const fd = new FormData(form);
      window.BTC?.setButtonBusy?.(submitBtn, true, { busyLabel: BTC.t('添加中...') });
      try {
        const { res, data } = await json(
          `/api/v1/orgs/${org}/projects/${project}/assignees`,
          {
            method: "POST",
            body: JSON.stringify({
              locale: fd.get("locale"),
              username: fd.get("username"),
              kind: fd.get("kind"),
            }),
          },
        );
        if (!res.ok) {
          toast?.("error", data.error || BTC.t('添加失败'));
          return;
        }
        toast?.("success", BTC.t('已添加指派'));
        form.reset();
        loadAssignees();
      } finally {
        window.BTC?.setButtonBusy?.(submitBtn, false);
      }
    });

    loadAssignees();
  }

  // —— Translation rules ——
  const rulesForm = document.getElementById("project-rules-form");
  if (rulesForm) {
    const org = rulesForm.dataset.orgSlug;
    const project = rulesForm.dataset.projectSlug;
    const errEl = document.getElementById("rules-form-error");
    const okEl = document.getElementById("rules-form-ok");

    rulesForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = rulesForm.querySelector('button[type="submit"]');
      if (errEl) {
        errEl.hidden = true;
        errEl.textContent = "";
      }
      if (okEl) {
        okEl.hidden = true;
        okEl.textContent = "";
      }
      const translationRules = {
        spaceCjkLatin: Boolean(
          rulesForm.querySelector('input[name="spaceCjkLatin"]')?.checked,
        ),
        spaceCjkDigit: Boolean(
          rulesForm.querySelector('input[name="spaceCjkDigit"]')?.checked,
        ),
        spaceLatinDigit: Boolean(
          rulesForm.querySelector('input[name="spaceLatinDigit"]')?.checked,
        ),
      };

      window.BTC?.setButtonBusy?.(btn, true, { busyLabel: BTC.t('保存中...') });
      try {
        const { res, data } = await json(
          `/api/v1/orgs/${org}/projects/${project}`,
          {
            method: "PATCH",
            body: JSON.stringify({ translationRules }),
          },
        );
        if (!res.ok) {
          if (errEl) {
            errEl.hidden = false;
            errEl.textContent = data.error || BTC.t('保存失败');
          }
          toast?.("error", data.error || BTC.t('保存失败'));
          return;
        }
        if (okEl) {
          okEl.hidden = false;
          okEl.textContent = BTC.t('翻译规则已保存。');
        }
        toast?.("success", BTC.t('翻译规则已保存'));
      } catch {
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = BTC.t('网络错误');
        }
      } finally {
        window.BTC?.setButtonBusy?.(btn, false, { idleLabel: BTC.t('保存规则') });
      }
    });
  }
})();
