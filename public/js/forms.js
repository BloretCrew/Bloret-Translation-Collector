(function () {
  const { json, toast, toSlug, showError, setButtonBusy } = window.BTC;

  function readProjectLanguages(form) {
    const picker = form?.querySelector("[data-locale-transfer]");
    const inputs = Array.from(
      form?.querySelectorAll('input[name="targetLocales"]') || [],
    ).filter((input) => input.value && input.value !== "[object Object]");
    const dataId = picker?.dataset.jsonId;
    const dataEl = dataId ? document.getElementById(dataId) : null;
    let catalog = [];
    try {
      catalog = dataEl ? JSON.parse(dataEl.textContent || "{}").catalog || [] : [];
    } catch {
      catalog = [];
    }
    const byCode = new Map(
      catalog.map((item) => [String(item.code).toLowerCase(), item]),
    );
    const locales = inputs.map((input) => input.value);
    return {
      locales,
      languages: inputs.map((input) => {
        const locale = input.value;
        const fromInput = (input.getAttribute("data-display-name") || "").trim();
        const fromCatalog = (byCode.get(locale.toLowerCase())?.label || "").trim();
        const displayName = fromInput || fromCatalog || null;
        return {
          locale,
          displayName: displayName || null,
        };
      }),
    };
  }

  /** Custom locales must have a human display name distinct from the code. */
  function languagesMissingDisplayName(projectLanguages) {
    return (projectLanguages.languages || []).filter((lang) => {
      const dn = (lang.displayName || "").trim();
      if (!dn) return true;
      return dn.toLowerCase() === String(lang.locale).toLowerCase();
    });
  }

  // Create org
  const createOrg = document.getElementById("create-org-form");
  if (createOrg) {
    const nameEl = document.getElementById("org-name");
    const slugEl = document.getElementById("org-slug");
    let slugTouched = false;
    nameEl?.addEventListener("input", () => {
      if (!slugTouched && slugEl) slugEl.value = toSlug(nameEl.value, "org");
    });
    slugEl?.addEventListener("input", () => {
      slugTouched = true;
    });
    createOrg.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = document.getElementById("form-error");
      const btn = createOrg.querySelector('button[type="submit"]');
      showError(err, "");
      // Ensure slug never empty (non-Latin names)
      if (slugEl && (!slugEl.value || slugEl.value.length < 2)) {
        slugEl.value = toSlug(nameEl.value || "org", "org");
        slugTouched = true;
      }
      setButtonBusy(btn, true, { busyLabel: "创建中..." });
      try {
        const body = {
          name: nameEl.value,
          slug: slugEl.value,
          description: document.getElementById("org-desc").value || null,
        };
        const { res, data } = await json("/api/v1/orgs", {
          method: "POST",
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          showError(err, data.error || "创建失败");
          return;
        }
        location.href = `/app/o/${data.slug}`;
      } catch {
        showError(err, "网络错误");
      } finally {
        setButtonBusy(btn, false, { idleLabel: "创建组织" });
      }
    });
  }

  // Org settings
  const orgSettings = document.getElementById("org-settings-form");
  if (orgSettings) {
    orgSettings.addEventListener("submit", async (e) => {
      e.preventDefault();
      const orgSlug = orgSettings.dataset.orgSlug;
      const err = document.getElementById("form-error");
      const btn = orgSettings.querySelector('button[type="submit"]');
      showError(err, "");
      setButtonBusy(btn, true, { busyLabel: "保存中..." });
      try {
        const fd = new FormData(orgSettings);
        const { res, data } = await json(`/api/v1/orgs/${orgSlug}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: fd.get("name"),
            description: fd.get("description") || null,
          }),
        });
        if (!res.ok) {
          showError(err, data.error || "保存失败");
          return;
        }
        toast("success", "组织已更新");
        location.reload();
      } catch {
        showError(err, "网络错误");
      } finally {
        setButtonBusy(btn, false, { idleLabel: "保存" });
      }
    });
  }

  // Create project
  const createProject = document.getElementById("create-project-form");
  if (createProject) {
    const nameEl = document.getElementById("project-name");
    const slugEl = document.getElementById("project-slug");
    let slugTouched = false;
    nameEl?.addEventListener("input", () => {
      if (!slugTouched && slugEl) slugEl.value = toSlug(nameEl.value, "project");
    });
    slugEl?.addEventListener("input", () => {
      slugTouched = true;
    });
    createProject.addEventListener("submit", async (e) => {
      e.preventDefault();
      const orgSlug = createProject.dataset.orgSlug;
      const err = document.getElementById("form-error");
      const btn = createProject.querySelector('button[type="submit"]');
      const fd = new FormData(createProject);
      showError(err, "");
      if (slugEl && (!slugEl.value || slugEl.value.length < 2)) {
        slugEl.value = toSlug(String(fd.get("name") || "project"), "project");
        slugTouched = true;
      }
      const projectLanguages = readProjectLanguages(createProject);
      const locales = projectLanguages.locales;
      if (!locales.length) {
        showError(err, "请至少选择一种目标语言");
        return;
      }
      const missingNames = languagesMissingDisplayName(projectLanguages);
      if (missingNames.length) {
        showError(
          err,
          `请为自定义语言填写显示名（不可与代码相同）：${missingNames.map((l) => l.locale).join("、")}。打开「选择语言…」→ 底部「添加自定义语言」重新填写后确定`,
        );
        return;
      }
      setButtonBusy(btn, true, { busyLabel: "创建中..." });
      try {
        const { res, data } = await json(`/api/v1/orgs/${orgSlug}/projects`, {
          method: "POST",
          body: JSON.stringify({
            name: fd.get("name"),
            slug: slugEl ? slugEl.value : fd.get("slug"),
            description: fd.get("description") || null,
            sourceLocale: fd.get("sourceLocale"),
            targetLocales: locales,
            languages: projectLanguages.languages,
            visibility: fd.get("visibility") || "org",
          }),
        });
        if (!res.ok) {
          showError(err, data.error || "创建失败");
          return;
        }
        location.href = `/app/o/${orgSlug}/p/${data.slug}`;
      } catch {
        showError(err, "网络错误");
      } finally {
        setButtonBusy(btn, false, { idleLabel: "创建项目" });
      }
    });
  }

  // Project settings
  const projectSettings = document.getElementById("project-settings-form");
  if (projectSettings) {
    projectSettings.addEventListener("submit", async (e) => {
      e.preventDefault();
      const orgSlug = projectSettings.dataset.orgSlug;
      const projectSlug = projectSettings.dataset.projectSlug;
      const err = document.getElementById("form-error");
      const btn = projectSettings.querySelector('button[type="submit"]');
      const fd = new FormData(projectSettings);
      const projectLanguages = readProjectLanguages(projectSettings);
      const locales = projectLanguages.locales;
      showError(err, "");
      if (!locales.length) {
        showError(err, "请至少选择一种目标语言");
        return;
      }
      const missingNames = languagesMissingDisplayName(projectLanguages);
      if (missingNames.length) {
        showError(
          err,
          `请为自定义语言填写显示名（不可与代码相同）：${missingNames.map((l) => l.locale).join("、")}。打开「选择语言…」→ 底部填写代码与显示名后点「添加」，再确定并保存`,
        );
        return;
      }
      setButtonBusy(btn, true, { busyLabel: "保存中..." });
      try {
        const { res, data } = await json(`/api/v1/orgs/${orgSlug}/projects/${projectSlug}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: fd.get("name"),
            description: fd.get("description") || null,
            sourceLocale: fd.get("sourceLocale"),
            visibility: fd.get("visibility"),
          }),
        });
        if (!res.ok) {
          showError(err, data.error || "保存失败");
          return;
        }
        const langRes = await json(`/api/v1/orgs/${orgSlug}/projects/${projectSlug}/languages`, {
          method: "PUT",
          body: JSON.stringify({ locales, languages: projectLanguages.languages }),
        });
        if (!langRes.res.ok) {
          showError(err, langRes.data.error || "语言保存失败");
          return;
        }
        toast("success", "项目已更新");
        // Brief delay so the success toast is visible before full reload.
        setTimeout(() => {
          location.reload();
        }, 450);
      } catch {
        showError(err, "网络错误");
      } finally {
        setButtonBusy(btn, false, { idleLabel: "保存设置" });
      }
    });
  }

  const deleteProjectBtn = document.getElementById("delete-project-btn");
  if (deleteProjectBtn) {
    deleteProjectBtn.addEventListener("click", async () => {
      const name = deleteProjectBtn.dataset.name;
      if (!confirm(`确定删除项目「${name}」？所有文件与译文将不可恢复。`)) return;
      const orgSlug = deleteProjectBtn.dataset.orgSlug;
      const projectSlug = deleteProjectBtn.dataset.projectSlug;
      setButtonBusy(deleteProjectBtn, true, { busyLabel: "删除中..." });
      try {
        const { res, data } = await json(`/api/v1/orgs/${orgSlug}/projects/${projectSlug}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          toast("error", data.error || "删除失败");
          return;
        }
        location.href = `/app/o/${orgSlug}`;
      } catch {
        toast("error", "网络错误");
      } finally {
        setButtonBusy(deleteProjectBtn, false, { idleLabel: "删除项目" });
      }
    });
  }

  // Upload file
  const uploadForm = document.getElementById("upload-file-form");
  if (uploadForm) {
    const pick = document.getElementById("file-pick");
    const pathEl = document.getElementById("file-path");
    const contentEl = document.getElementById("file-content");
    pick?.addEventListener("change", async () => {
      const file = pick.files?.[0];
      if (!file) return;
      contentEl.value = await file.text();
      if (!pathEl.value || pathEl.value === "locales/common.json") {
        pathEl.value = file.name.endsWith(".json") ? file.name : `${file.name}.json`;
      }
    });
    uploadForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const orgSlug = uploadForm.dataset.orgSlug;
      const projectSlug = uploadForm.dataset.projectSlug;
      const err = document.getElementById("form-error");
      const warn = document.getElementById("form-warnings");
      const btn = uploadForm.querySelector('button[type="submit"]');
      showError(err, "");
      if (warn) {
        warn.hidden = true;
        warn.innerHTML = "";
      }
      if (!contentEl.value.trim()) {
        showError(err, "请选择 JSON 文件或粘贴内容");
        return;
      }
      if (!pathEl.value.trim()) {
        showError(err, "请填写项目内路径");
        return;
      }
      setButtonBusy(btn, true, { busyLabel: "上传中..." });
      try {
        const { res, data } = await json(`/api/v1/orgs/${orgSlug}/projects/${projectSlug}/files`, {
          method: "POST",
          body: JSON.stringify({ path: pathEl.value, content: contentEl.value }),
        });
        if (!res.ok) {
          showError(err, data.error || "上传失败");
          return;
        }
        if (data.warnings?.length && warn) {
          warn.hidden = false;
          warn.innerHTML =
            "<strong>警告：</strong><ul style='margin:8px 0 0;padding-left:18px'>" +
            data.warnings.map((w) => `<li>${w}</li>`).join("") +
            "</ul>";
        }
        toast("success", `已同步 ${data.stringCount} 条字符串 (r${data.revision})`);
        location.reload();
      } catch {
        showError(err, "网络错误");
      } finally {
        setButtonBusy(btn, false, { idleLabel: "上传 / 更新" });
      }
    });
  }

  // Project page: show/hide upload panel
  const uploadPanel = document.getElementById("upload-panel");
  document.querySelectorAll("[data-show-upload]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!uploadPanel) return;
      uploadPanel.hidden = false;
      uploadPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });
  document.querySelectorAll("[data-hide-upload]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (uploadPanel) uploadPanel.hidden = true;
    });
  });

  // Delete file
  const deleteFileBtn = document.getElementById("delete-file-btn");
  if (deleteFileBtn) {
    deleteFileBtn.addEventListener("click", async () => {
      const path = deleteFileBtn.dataset.path;
      if (!confirm(`确定删除源文件 ${path}？相关字符串与译文将一并删除。`)) return;
      const orgSlug = deleteFileBtn.dataset.orgSlug;
      const projectSlug = deleteFileBtn.dataset.projectSlug;
      const fileId = deleteFileBtn.dataset.fileId;
      setButtonBusy(deleteFileBtn, true, { busyLabel: "删除中..." });
      try {
        const { res, data } = await json(
          `/api/v1/orgs/${orgSlug}/projects/${projectSlug}/files/${fileId}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          toast("error", data.error || "删除失败");
          return;
        }
        toast("success", "文件已删除");
        location.href = `/app/o/${orgSlug}/p/${projectSlug}`;
      } catch {
        toast("error", "网络错误");
      } finally {
        setButtonBusy(deleteFileBtn, false, { idleLabel: "删除文件" });
      }
    });
  }

  // Members
  const memberList = document.getElementById("member-list");
  if (memberList) {
    const orgSlug = memberList.dataset.orgSlug;
    const err = document.getElementById("member-error");

    memberList.querySelectorAll(".member-role").forEach((sel) => {
      sel.addEventListener("change", async () => {
        showError(err, "");
        sel.disabled = true;
        try {
          const { res, data } = await json(
            `/api/v1/orgs/${orgSlug}/members/${sel.dataset.userId}`,
            { method: "PATCH", body: JSON.stringify({ role: sel.value }) },
          );
          if (!res.ok) {
            showError(err, data.error || "修改失败");
            return;
          }
          toast("success", "角色已更新");
          location.reload();
        } catch {
          showError(err, "网络错误");
        } finally {
          sel.disabled = false;
        }
      });
    });

    memberList.querySelectorAll(".member-remove").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm(`确定移除成员 ${btn.dataset.username}？`)) return;
        showError(err, "");
        setButtonBusy(btn, true, { busyLabel: "移除中..." });
        try {
          const { res, data } = await json(
            `/api/v1/orgs/${orgSlug}/members/${btn.dataset.userId}`,
            { method: "DELETE" },
          );
          if (!res.ok) {
            showError(err, data.error || "移除失败");
            return;
          }
          toast("success", `已移除 ${btn.dataset.username}`);
          location.reload();
        } catch {
          showError(err, "网络错误");
        } finally {
          setButtonBusy(btn, false, { idleLabel: "移除" });
        }
      });
    });
  }

  const addMember = document.getElementById("add-member-form");
  if (addMember) {
    addMember.addEventListener("submit", async (e) => {
      e.preventDefault();
      const orgSlug = addMember.dataset.orgSlug;
      const err = document.getElementById("add-member-error");
      const btn = addMember.querySelector('button[type="submit"]');
      const fd = new FormData(addMember);
      showError(err, "");
      setButtonBusy(btn, true, { busyLabel: "添加中..." });
      try {
        const { res, data } = await json(`/api/v1/orgs/${orgSlug}/members`, {
          method: "POST",
          body: JSON.stringify({
            username: fd.get("username"),
            role: fd.get("role"),
          }),
        });
        if (!res.ok) {
          showError(err, data.error || "添加失败");
          return;
        }
        toast("success", `已添加 ${data.username}`);
        location.reload();
      } catch {
        showError(err, "网络错误");
      } finally {
        setButtonBusy(btn, false, { idleLabel: "添加成员" });
      }
    });
  }
})();
