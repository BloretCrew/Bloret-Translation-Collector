/**
 * User settings page — editor shortcut + translation rule preferences.
 */
(function () {
  // —— Translation rules prefs ——
  const skipRulesEl = document.getElementById("settings-skip-project-rules");
  const rulesSaveBtn = document.getElementById("settings-rules-save");
  const rulesAlertEl = document.getElementById("settings-rules-alert");
  const rulesOkEl = document.getElementById("settings-rules-ok");
  const prefsApi = window.BTC?.translationPrefs;

  if (skipRulesEl && prefsApi) {
    const prefs = prefsApi.load();
    skipRulesEl.checked = prefs.skipProjectRules === true;

    function showRulesAlert(msg) {
      if (!rulesAlertEl) return;
      if (!msg) {
        rulesAlertEl.hidden = true;
        rulesAlertEl.textContent = "";
        return;
      }
      rulesAlertEl.hidden = false;
      rulesAlertEl.textContent = msg;
      if (rulesOkEl) rulesOkEl.hidden = true;
    }

    function showRulesOk(msg) {
      if (!rulesOkEl) return;
      if (!msg) {
        rulesOkEl.hidden = true;
        rulesOkEl.textContent = "";
        return;
      }
      rulesOkEl.hidden = false;
      rulesOkEl.textContent = msg;
      if (rulesAlertEl) rulesAlertEl.hidden = true;
    }

    rulesSaveBtn?.addEventListener("click", () => {
      prefsApi.save({ skipProjectRules: skipRulesEl.checked === true });
      showRulesOk(
        skipRulesEl.checked
          ? BTC.t('已保存：保存译文时将跳过项目翻译规则。')
          : BTC.t('已保存：保存译文时将应用项目翻译规则。'),
      );
      window.BTC?.toast?.("success", BTC.t('翻译规则偏好已保存'));
    });
  }

  // —— Shortcuts ——
  const body = document.getElementById("settings-shortcuts-body");
  if (!body || !window.BTC?.editorShortcuts) return;

  const api = window.BTC.editorShortcuts;
  const { toast } = window.BTC;
  const alertEl = document.getElementById("settings-shortcuts-alert");
  const okEl = document.getElementById("settings-shortcuts-ok");
  const saveBtn = document.getElementById("settings-shortcuts-save");
  const resetBtn = document.getElementById("settings-shortcuts-reset");

  let draft = api.load();
  let capturingId = null;

  function showAlert(msg) {
    if (!alertEl) return;
    if (!msg) {
      alertEl.hidden = true;
      alertEl.textContent = "";
      return;
    }
    alertEl.hidden = false;
    alertEl.textContent = msg;
    if (okEl) okEl.hidden = true;
  }

  function showOk(msg) {
    if (!okEl) return;
    if (!msg) {
      okEl.hidden = true;
      okEl.textContent = "";
      return;
    }
    okEl.hidden = false;
    okEl.textContent = msg;
    if (alertEl) alertEl.hidden = true;
  }

  function stopCapture() {
    capturingId = null;
    document.removeEventListener("keydown", onCaptureKey, true);
    render();
  }

  function onCaptureKey(e) {
    if (!capturingId) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Escape") {
      stopCapture();
      return;
    }

    const binding = api.fromEvent(e);
    if (!binding) return;

    draft[capturingId] = binding;
    capturingId = null;
    document.removeEventListener("keydown", onCaptureKey, true);
    showAlert("");
    render();
  }

  function startCapture(id) {
    if (capturingId) stopCapture();
    capturingId = id;
    render();
    document.addEventListener("keydown", onCaptureKey, true);
  }

  function render() {
    body.innerHTML = "";
    for (const [id, meta] of Object.entries(api.ACTIONS)) {
      const tr = document.createElement("tr");
      if (capturingId === id) tr.classList.add("is-capturing");

      const tdLabel = document.createElement("td");
      tdLabel.innerHTML = `<div class="settings-shortcut__label"></div><div class="settings-shortcut__hint blora-text-faint u-text-xs"></div>`;
      tdLabel.querySelector(".settings-shortcut__label").textContent = meta.label;
      tdLabel.querySelector(".settings-shortcut__hint").textContent = meta.hint;

      const tdKey = document.createElement("td");
      const kbd = document.createElement("kbd");
      kbd.className = "settings-shortcut__kbd blora-text-mono";
      if (capturingId === id) {
        kbd.textContent = BTC.t('按下组合键…');
        kbd.classList.add("is-listening");
      } else {
        kbd.textContent = api.format(draft[id]);
      }
      tdKey.appendChild(kbd);

      const tdAct = document.createElement("td");
      tdAct.className = "settings-shortcut__actions";
      const rec = document.createElement("button");
      rec.type = "button";
      rec.className = "blora-btn blora-btn--secondary blora-btn--sm";
      rec.textContent = capturingId === id ? BTC.t('录制中') : BTC.t('录制');
      rec.disabled = capturingId != null && capturingId !== id;
      rec.addEventListener("click", () => {
        if (capturingId === id) stopCapture();
        else startCapture(id);
      });

      const def = document.createElement("button");
      def.type = "button";
      def.className = "blora-btn blora-btn--ghost blora-btn--sm";
      def.textContent = BTC.t('默认');
      def.disabled = capturingId != null;
      def.addEventListener("click", () => {
        draft[id] = { ...meta.default };
        showAlert("");
        render();
      });

      tdAct.append(rec, def);
      tr.append(tdLabel, tdKey, tdAct);
      body.appendChild(tr);
    }
  }

  saveBtn?.addEventListener("click", () => {
    if (capturingId) stopCapture();
    const conflicts = api.findConflicts(draft);
    if (conflicts.length) {
      const msg = conflicts
        .map(({ a, b }) =>
          BTC.t('「{a}」与「{b}」冲突', {
            a: api.ACTIONS[a].label,
            b: api.ACTIONS[b].label,
          }),
        )
        .join("；");
      showAlert(BTC.t('快捷键冲突：{msg}', { msg }));
      return;
    }
    api.save(draft);
    draft = api.load();
    showOk(BTC.t('快捷键已保存，刷新翻译工作台后生效（若已打开则立即对后续按键生效）。'));
    toast?.("success", BTC.t('快捷键已保存'));
    render();
  });

  resetBtn?.addEventListener("click", async () => {
    if (capturingId) stopCapture();
    if (!(await BTC.confirm(BTC.t('恢复全部快捷键为默认？')))) return;
    draft = api.reset();
    showOk(BTC.t('已恢复默认快捷键。'));
    toast?.("success", BTC.t('已恢复默认'));
    render();
  });

  render();
})();
