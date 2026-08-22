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
      setButtonBusy(btn, true, { busyLabel: BTC.t('创建中...') });
      try {
        const visibilityEl = document.getElementById("org-visibility");
        const body = {
          name: nameEl.value,
          slug: slugEl.value,
          description: document.getElementById("org-desc").value || null,
          visibility: visibilityEl?.value || "private",
        };
        const { res, data } = await json("/api/v1/orgs", {
          method: "POST",
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          showError(err, data.error || BTC.t('创建失败'));
          return;
        }
        location.href = `/app/o/${data.slug}`;
      } catch {
        showError(err, BTC.t('网络错误'));
      } finally {
        setButtonBusy(btn, false, { idleLabel: BTC.t('创建组织') });
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
      setButtonBusy(btn, true, { busyLabel: BTC.t('保存中...') });
      try {
        // If user picked a file but auto-upload didn't finish, upload before PATCH
        const iconRoot = orgSettings.querySelector("[data-entity-icon]");
        const pendingFile = iconRoot?.querySelector(".entity-icon-field__file")?.files?.[0];
        if (pendingFile && iconRoot) {
          try {
            const url = await uploadEntityIconFile(iconRoot, pendingFile);
            setEntityIconPreview(iconRoot, url);
          } catch (iconErr) {
            showError(err, iconErr instanceof Error ? iconErr.message : BTC.t('图标上传失败'));
            return;
          }
        }
        const fd = new FormData(orgSettings);
        const iconUrl =
          (iconRoot?.dataset.iconUrl || "").trim() ||
          null;
        const { res, data } = await json(`/api/v1/orgs/${orgSlug}`, {
          method: "PATCH",
          credentials: "same-origin",
          body: JSON.stringify({
            name: fd.get("name"),
            description: fd.get("description") || null,
            visibility: fd.get("visibility") || "private",
            // Persist currently displayed icon (or null if cleared)
            iconUrl: iconUrl || null,
          }),
        });
        if (!res.ok) {
          showError(err, data.error || BTC.t('保存失败'));
          return;
        }
        toast("success", BTC.t('组织已更新'));
        location.reload();
      } catch {
        showError(err, BTC.t('网络错误'));
      } finally {
        setButtonBusy(btn, false, { idleLabel: BTC.t('保存') });
      }
    });
  }

  // Org README
  const orgReadme = document.getElementById("org-readme-form");
  if (orgReadme) {
    orgReadme.addEventListener("submit", async (e) => {
      e.preventDefault();
      const orgSlug = orgReadme.dataset.orgSlug;
      const err = document.getElementById("readme-form-error");
      const btn = orgReadme.querySelector('button[type="submit"]');
      showError(err, "");
      setButtonBusy(btn, true, { busyLabel: BTC.t('保存中...') });
      try {
        const fd = new FormData(orgReadme);
        const { res, data } = await json(`/api/v1/orgs/${orgSlug}`, {
          method: "PATCH",
          body: JSON.stringify({
            readme: fd.get("readme") || null,
            readmeUrl: (fd.get("readmeUrl") || "").toString().trim() || null,
          }),
        });
        if (!res.ok) {
          showError(err, data.error || BTC.t('保存失败'));
          return;
        }
        toast("success", BTC.t('README 已更新'));
        location.reload();
      } catch {
        showError(err, BTC.t('网络错误'));
      } finally {
        setButtonBusy(btn, false, { idleLabel: BTC.t('保存 README') });
      }
    });
  }

  // Project README
  const projectReadme = document.getElementById("project-readme-form");
  if (projectReadme) {
    projectReadme.addEventListener("submit", async (e) => {
      e.preventDefault();
      const orgSlug = projectReadme.dataset.orgSlug;
      const projectSlug = projectReadme.dataset.projectSlug;
      const err = document.getElementById("readme-form-error");
      const btn = projectReadme.querySelector('button[type="submit"]');
      showError(err, "");
      setButtonBusy(btn, true, { busyLabel: BTC.t('保存中...') });
      try {
        const fd = new FormData(projectReadme);
        const { res, data } = await json(`/api/v1/orgs/${orgSlug}/projects/${projectSlug}`, {
          method: "PATCH",
          body: JSON.stringify({
            readme: fd.get("readme") || null,
            readmeUrl: (fd.get("readmeUrl") || "").toString().trim() || null,
          }),
        });
        if (!res.ok) {
          showError(err, data.error || BTC.t('保存失败'));
          return;
        }
        toast("success", BTC.t('README 已更新'));
        location.reload();
      } catch {
        showError(err, BTC.t('网络错误'));
      } finally {
        setButtonBusy(btn, false, { idleLabel: BTC.t('保存 README') });
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
        showError(err, BTC.t('请至少选择一种目标语言'));
        return;
      }
      const missingNames = languagesMissingDisplayName(projectLanguages);
      if (missingNames.length) {
        showError(
          err,
          BTC.t(
            '请为自定义语言填写显示名（不可与代码相同）：{list}。打开「选择语言…」→ 底部「添加自定义语言」重新填写后确定',
            { list: missingNames.map((l) => l.locale).join("、") },
          ),
        );
        return;
      }
      setButtonBusy(btn, true, { busyLabel: BTC.t('创建中...') });
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
          showError(err, data.error || BTC.t('创建失败'));
          return;
        }
        location.href = `/app/o/${orgSlug}/p/${data.slug}`;
      } catch {
        showError(err, BTC.t('网络错误'));
      } finally {
        setButtonBusy(btn, false, { idleLabel: BTC.t('创建项目') });
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
        showError(err, BTC.t('请至少选择一种目标语言'));
        return;
      }
      const missingNames = languagesMissingDisplayName(projectLanguages);
      if (missingNames.length) {
        showError(
          err,
          BTC.t(
            '请为自定义语言填写显示名（不可与代码相同）：{list}。打开「选择语言…」→ 底部填写代码与显示名后点「添加」，再确定并保存',
            { list: missingNames.map((l) => l.locale).join("、") },
          ),
        );
        return;
      }
      setButtonBusy(btn, true, { busyLabel: BTC.t('保存中...') });
      try {
        const iconRoot = projectSettings.querySelector("[data-entity-icon]");
        const pendingFile = iconRoot?.querySelector(".entity-icon-field__file")?.files?.[0];
        if (pendingFile && iconRoot) {
          try {
            const url = await uploadEntityIconFile(iconRoot, pendingFile);
            setEntityIconPreview(iconRoot, url);
          } catch (iconErr) {
            showError(err, iconErr instanceof Error ? iconErr.message : BTC.t('图标上传失败'));
            return;
          }
        }
        const iconUrl = (iconRoot?.dataset.iconUrl || "").trim() || null;
        const { res, data } = await json(`/api/v1/orgs/${orgSlug}/projects/${projectSlug}`, {
          method: "PATCH",
          credentials: "same-origin",
          body: JSON.stringify({
            name: fd.get("name"),
            description: fd.get("description") || null,
            sourceLocale: fd.get("sourceLocale"),
            visibility: fd.get("visibility"),
            iconUrl,
          }),
        });
        if (!res.ok) {
          showError(err, data.error || BTC.t('保存失败'));
          return;
        }
        const langRes = await json(`/api/v1/orgs/${orgSlug}/projects/${projectSlug}/languages`, {
          method: "PUT",
          credentials: "same-origin",
          body: JSON.stringify({ locales, languages: projectLanguages.languages }),
        });
        if (!langRes.res.ok) {
          showError(err, langRes.data.error || BTC.t('语言保存失败'));
          return;
        }
        toast("success", BTC.t('项目已更新'));
        // Brief delay so the success toast is visible before full reload.
        setTimeout(() => {
          location.reload();
        }, 450);
      } catch {
        showError(err, BTC.t('网络错误'));
      } finally {
        setButtonBusy(btn, false, { idleLabel: BTC.t('保存设置') });
      }
    });
  }

  const deleteProjectBtn = document.getElementById("delete-project-btn");
  if (deleteProjectBtn) {
    deleteProjectBtn.addEventListener("click", async () => {
      const name = deleteProjectBtn.dataset.name;
      if (!(await BTC.confirm(BTC.t('确定删除项目「{name}」？所有文件与译文将不可恢复。', { name })))) return;
      const orgSlug = deleteProjectBtn.dataset.orgSlug;
      const projectSlug = deleteProjectBtn.dataset.projectSlug;
      setButtonBusy(deleteProjectBtn, true, { busyLabel: BTC.t('删除中...') });
      try {
        const { res, data } = await json(`/api/v1/orgs/${orgSlug}/projects/${projectSlug}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          toast("error", data.error || BTC.t('删除失败'));
          return;
        }
        location.href = `/app/o/${orgSlug}`;
      } catch {
        toast("error", BTC.t('网络错误'));
      } finally {
        setButtonBusy(deleteProjectBtn, false, { idleLabel: BTC.t('删除项目') });
      }
    });
  }

  // Upload file(s) — single or multi via batch API
  const uploadForm = document.getElementById("upload-file-form");
  if (uploadForm) {
    const pick = document.getElementById("file-pick");
    const pathEl = document.getElementById("file-path");
    const contentEl = document.getElementById("file-content");
    const listEl = document.getElementById("upload-file-list");
    const singlePathField = document.getElementById("single-path-field");
    const resultEl = document.getElementById("upload-result");
    /** @type {{ path: string, content: string, name: string }[]} */
    let pendingFiles = [];

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/"/g, "&quot;");
    }

    function safePathFromName(name) {
      const base = name.replace(/\\/g, "/").split("/").pop() || name;
      const cleaned = base.replace(/[^a-zA-Z0-9_./-]/g, "_");
      if (/\.(json|properties)$/i.test(cleaned)) return cleaned;
      return `${cleaned}.json`;
    }

    function normalizePathClient(p) {
      return String(p || "")
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\/+/, "")
        .replace(/\/{2,}/g, "/");
    }

    /** True after user/query prefilled a project path — picking a file must not clobber it. */
    let pathLocked = false;

    function prefillPath(path) {
      const cleaned = normalizePathClient(path);
      if (!cleaned || !pathEl) return;
      pathEl.value = cleaned;
      pathLocked = true;
      pathEl.focus();
      pathEl.scrollIntoView({ behavior: "smooth", block: "center" });
      toast("info", BTC.t('已预填路径 {path}，请选择新源文件后上传', { path: cleaned }));
    }

    // ?path= from file detail / sources list
    try {
      const qPath = new URLSearchParams(location.search).get("path");
      if (qPath) prefillPath(qPath);
    } catch {
      /* ignore */
    }

    document.querySelectorAll("[data-prefill-path]").forEach((btn) => {
      btn.addEventListener("click", () => {
        prefillPath(btn.getAttribute("data-prefill-path") || "");
      });
    });

    function formatMergeStats(data) {
      const parts = [];
      const rev = data.revision != null ? data.revision : "?";
      if (data.unchanged) {
        return BTC.t('内容未变化，已跳过 (r{revision})', { revision: rev });
      }
      parts.push(BTC.t('已同步 {count} 条 (r{revision})', {
        count: data.stringCount ?? 0,
        revision: rev,
      }));
      if (data.addedCount > 0) {
        parts.push(BTC.t('新增 {n}', { n: data.addedCount }));
      }
      if ((data.updatedCount ?? data.sourceTextChangedCount) > 0) {
        parts.push(
          BTC.t('源文变更 {n}', {
            n: data.updatedCount ?? data.sourceTextChangedCount,
          }),
        );
      }
      if (data.reusedCount > 0) {
        parts.push(BTC.t('未变 {n}', { n: data.reusedCount }));
      }
      if (data.orphanedCount > 0) {
        parts.push(BTC.t('孤立 {n}', { n: data.orphanedCount }));
      }
      return parts.join(" · ");
    }

    function showUploadResult(html, kind) {
      if (!resultEl) return;
      resultEl.hidden = false;
      resultEl.className =
        "blora-alert blora-alert--" + (kind === "warning" ? "warning" : kind === "info" ? "info" : "success");
      resultEl.innerHTML = html;
      resultEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function clearUploadResult() {
      if (!resultEl) return;
      resultEl.hidden = true;
      resultEl.innerHTML = "";
    }

    function sourcesHref(orgSlug, projectSlug) {
      return `/app/o/${orgSlug}/p/${projectSlug}/sources`;
    }

    function renderFileList() {
      if (!listEl) return;
      if (pendingFiles.length <= 1) {
        listEl.hidden = true;
        listEl.innerHTML = "";
        if (singlePathField) singlePathField.hidden = false;
        return;
      }
      if (singlePathField) singlePathField.hidden = true;
      listEl.hidden = false;
      listEl.innerHTML =
        '<div class="upload-file-list__title">' +
        BTC.t("将上传 ") +
        pendingFiles.length +
        BTC.t(" 个文件：") +
        "</div>" +
        pendingFiles
          .map(
            (f, i) =>
              `<label class="upload-file-list__row">` +
              `<span class="blora-text-mono u-text-xs">${escapeHtml(f.name)}</span>` +
              `<input class="blora-input blora-input--sm" data-pending-path="${i}" value="${escapeHtml(f.path)}" />` +
              `</label>`,
          )
          .join("");
      listEl.querySelectorAll("[data-pending-path]").forEach((input) => {
        input.addEventListener("change", () => {
          const idx = Number(input.getAttribute("data-pending-path"));
          if (pendingFiles[idx]) pendingFiles[idx].path = input.value.trim();
        });
      });
    }

    pick?.addEventListener("change", async () => {
      const files = pick.files ? Array.from(pick.files) : [];
      pendingFiles = [];
      for (const file of files) {
        const content = await file.text();
        pendingFiles.push({
          name: file.name,
          path: safePathFromName(file.name),
          content,
        });
      }
      if (pendingFiles.length === 1) {
        const f = pendingFiles[0];
        if (contentEl) contentEl.value = f.content;
        if (pathEl && !pathLocked) {
          // Prefer picked filename when default / empty path
          if (!pathEl.value || pathEl.value === "locales/common.json") {
            pathEl.value = f.path.includes("/") ? f.path : `locales/${f.path}`;
          }
        }
      } else if (pendingFiles.length > 1) {
        if (contentEl) contentEl.value = "";
        // Multi-file: each row has its own path; keep locked single-path only for one-file flow
        pendingFiles = pendingFiles.map((f) => ({
          ...f,
          path: f.path.includes("/") ? f.path : f.path,
        }));
      }
      renderFileList();
    });

    pathEl?.addEventListener("input", () => {
      pathLocked = Boolean(pathEl.value && pathEl.value !== "locales/common.json");
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

      // Sync multi path inputs
      if (listEl && pendingFiles.length > 1) {
        listEl.querySelectorAll("[data-pending-path]").forEach((input) => {
          const idx = Number(input.getAttribute("data-pending-path"));
          if (pendingFiles[idx]) pendingFiles[idx].path = input.value.trim();
        });
      }

      /** @type {{ path: string, content: string }[]} */
      let payloadFiles = [];
      if (pendingFiles.length > 1) {
        payloadFiles = pendingFiles.map((f) => ({ path: f.path, content: f.content }));
      } else if (pendingFiles.length === 1) {
        payloadFiles = [
          {
            path: (pathEl?.value || pendingFiles[0].path).trim(),
            content: pendingFiles[0].content,
          },
        ];
      } else if (contentEl?.value?.trim()) {
        payloadFiles = [
          {
            path: (pathEl?.value || "").trim(),
            content: contentEl.value,
          },
        ];
      }

      if (!payloadFiles.length) {
        showError(err, BTC.t('请选择文件或粘贴内容'));
        return;
      }
      for (const f of payloadFiles) {
        if (!f.path) {
          showError(err, BTC.t('请填写项目内路径'));
          return;
        }
        if (!f.content.trim()) {
          showError(err, BTC.t('文件 {path} 内容为空', { path: f.path }));
          return;
        }
      }

      clearUploadResult();
      setButtonBusy(btn, true, { busyLabel: BTC.t('上传中...') });
      try {
        if (payloadFiles.length === 1) {
          const { res, data } = await json(
            `/api/v1/orgs/${orgSlug}/projects/${projectSlug}/files`,
            {
              method: "POST",
              body: JSON.stringify({
                ...payloadFiles[0],
                path: normalizePathClient(payloadFiles[0].path),
              }),
            },
          );
          if (!res.ok) {
            showError(err, data.error || BTC.t('上传失败'));
            return;
          }
          if (data.warnings?.length && warn) {
            warn.hidden = false;
            warn.innerHTML =
              `<strong>${BTC.t('警告：')}</strong><ul style="margin:8px 0 0;padding-left:18px">` +
              data.warnings.map((w) => `<li>${w}</li>`).join("") +
              "</ul>";
          }
          const statsLine = formatMergeStats(data);
          const orphanNote =
            data.orphanedCount > 0
              ? `<p class="u-mt-2 u-text-sm">${BTC.t('{n} 个键已标记为孤立（已隐藏，译文仍保留；键再次出现时可恢复）', { n: data.orphanedCount })}</p>`
              : "";
          const changedNote =
            !data.unchanged && (data.updatedCount ?? data.sourceTextChangedCount) > 0
              ? `<p class="u-mt-1 u-text-sm">${BTC.t('源文已变更的条目仍保留原译文，建议人工复核。')}</p>`
              : "";
          const link = `<p class="u-mt-2"><a class="blora-link" href="${sourcesHref(orgSlug, projectSlug)}">${BTC.t('查看源文件')}</a></p>`;
          showUploadResult(
            `<strong>${escapeHtml(data.path || payloadFiles[0].path)}</strong><br/>${escapeHtml(statsLine)}${orphanNote}${changedNote}${link}`,
            data.orphanedCount > 0 ? "warning" : data.unchanged ? "info" : "success",
          );
          if (data.unchanged) {
            toast("info", statsLine);
          } else {
            toast("success", statsLine);
          }
          return;
        }

        const { res, data } = await json(
          `/api/v1/orgs/${orgSlug}/projects/${projectSlug}/files/batch`,
          {
            method: "POST",
            body: JSON.stringify({
              files: payloadFiles.map((f) => ({
                path: normalizePathClient(f.path),
                content: f.content,
              })),
            }),
          },
        );
        if (!res.ok) {
          showError(err, data.error || BTC.t('批量上传失败'));
          return;
        }
        const summary = data.summary || {};
        const results = data.results || [];
        const failed = results.filter((r) => !r.ok);
        if (failed.length && warn) {
          warn.hidden = false;
          warn.innerHTML =
            `<strong>${BTC.t('部分失败：')}</strong><ul style="margin:8px 0 0;padding-left:18px">` +
            failed.map((r) => `<li>${escapeHtml(r.path)}: ${escapeHtml(r.error)}</li>`).join("") +
            "</ul>";
        }
        if (summary.ok > 0) {
          const okRows = results.filter((r) => r.ok);
          const listHtml = okRows
            .map(
              (r) =>
                `<li><span class="blora-text-mono">${escapeHtml(r.path)}</span> — ${escapeHtml(formatMergeStats(r))}</li>`,
            )
            .join("");
          const totalOrphan = okRows.reduce((n, r) => n + (r.orphanedCount || 0), 0);
          const orphanNote =
            totalOrphan > 0
              ? `<p class="u-mt-2 u-text-sm">${BTC.t('共 {n} 个键已标记为孤立（译文仍保留）', { n: totalOrphan })}</p>`
              : "";
          const link = `<p class="u-mt-2"><a class="blora-link" href="${sourcesHref(orgSlug, projectSlug)}">${BTC.t('查看源文件')}</a></p>`;
          showUploadResult(
            `<strong>${BTC.t('已处理 {ok}/{total} 个文件', {
              ok: summary.ok,
              total: summary.total,
            })}</strong><ul style="margin:8px 0 0;padding-left:18px">${listHtml}</ul>${orphanNote}${link}`,
            totalOrphan > 0 || failed.length ? "warning" : "success",
          );
          toast(
            "success",
            BTC.t('已处理 {ok}/{total} 个文件', {
              ok: summary.ok,
              total: summary.total,
            }) + (summary.failed ? BTC.t('，{failed} 个失败', { failed: summary.failed }) : ""),
          );
        } else {
          showError(err, BTC.t('全部文件上传失败'));
        }
      } catch {
        showError(err, BTC.t('网络错误'));
      } finally {
        setButtonBusy(btn, false, { idleLabel: BTC.t('上传 / 更新') });
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
      if (!(await BTC.confirm(BTC.t('确定删除源文件 {path}？相关字符串与译文将一并删除。', { path })))) return;
      const orgSlug = deleteFileBtn.dataset.orgSlug;
      const projectSlug = deleteFileBtn.dataset.projectSlug;
      const fileId = deleteFileBtn.dataset.fileId;
      setButtonBusy(deleteFileBtn, true, { busyLabel: BTC.t('删除中...') });
      try {
        const { res, data } = await json(
          `/api/v1/orgs/${orgSlug}/projects/${projectSlug}/files/${fileId}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          toast("error", data.error || BTC.t('删除失败'));
          return;
        }
        toast("success", BTC.t('文件已删除'));
        location.href = `/app/o/${orgSlug}/p/${projectSlug}`;
      } catch {
        toast("error", BTC.t('网络错误'));
      } finally {
        setButtonBusy(deleteFileBtn, false, { idleLabel: BTC.t('删除文件') });
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
            showError(err, data.error || BTC.t('修改失败'));
            return;
          }
          toast("success", BTC.t('角色已更新'));
          location.reload();
        } catch {
          showError(err, BTC.t('网络错误'));
        } finally {
          sel.disabled = false;
        }
      });
    });

    memberList.querySelectorAll(".member-remove").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!(await BTC.confirm(BTC.t('确定移除成员 {username}？', { username: btn.dataset.username })))) return;
        showError(err, "");
        setButtonBusy(btn, true, { busyLabel: BTC.t('移除中...') });
        try {
          const { res, data } = await json(
            `/api/v1/orgs/${orgSlug}/members/${btn.dataset.userId}`,
            { method: "DELETE" },
          );
          if (!res.ok) {
            showError(err, data.error || BTC.t('移除失败'));
            return;
          }
          toast("success", BTC.t('已移除 {username}', { username: btn.dataset.username }));
          location.reload();
        } catch {
          showError(err, BTC.t('网络错误'));
        } finally {
          setButtonBusy(btn, false, { idleLabel: BTC.t('移除') });
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
      setButtonBusy(btn, true, { busyLabel: BTC.t('添加中...') });
      try {
        const { res, data } = await json(`/api/v1/orgs/${orgSlug}/members`, {
          method: "POST",
          body: JSON.stringify({
            username: fd.get("username"),
            role: fd.get("role"),
          }),
        });
        if (!res.ok) {
          showError(err, data.error || BTC.t('添加失败'));
          return;
        }
        toast("success", BTC.t('已添加 {username}', { username: data.username }));
        location.reload();
      } catch {
        showError(err, BTC.t('网络错误'));
      } finally {
        setButtonBusy(btn, false, { idleLabel: BTC.t('添加成员') });
      }
    });
  }

  // —— Org / project icon (Bloret Image Host via API) ——
  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error(BTC.t('读取文件失败')));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Upload selected File to icon endpoint; returns absolute icon URL or throws.
   * @param {HTMLElement} root
   * @param {File} file
   */
  async function uploadEntityIconFile(root, file) {
    const form = root.closest("form");
    const orgSlug = form?.dataset.orgSlug || root.dataset.orgSlug;
    const projectSlug = form?.dataset.projectSlug || root.dataset.projectSlug;
    const kind = root.dataset.kind || (projectSlug ? "project" : "org");

    let endpoint = null;
    if (kind === "project" && orgSlug && projectSlug) {
      endpoint = `/api/v1/orgs/${orgSlug}/projects/${projectSlug}/icon`;
    } else if (orgSlug) {
      endpoint = `/api/v1/orgs/${orgSlug}/icon`;
    }
    if (!endpoint) throw new Error(BTC.t('缺少组织/项目上下文'));

    if (file.size > 2 * 1024 * 1024) throw new Error(BTC.t('图标不能超过 2MB'));
    if (file.type && !/^image\/(png|jpe?g|gif|webp)$/i.test(file.type)) {
      if (!/\.(png|jpe?g|gif|webp)$/i.test(file.name || "")) {
        throw new Error(BTC.t('请选择 PNG / JPG / WebP / GIF 图片'));
      }
    }

    const dataUrl = await fileToDataUrl(file);
    if (!dataUrl.startsWith("data:image/")) {
      throw new Error(BTC.t('无法读取图片，请换一张再试'));
    }

    const { res, data } = await json(endpoint, {
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify({ imageBase64: dataUrl }),
    });
    if (!res.ok) throw new Error(data.error || BTC.t('上传失败'));
    const url = (data.iconUrl || data.webpUrl || "").trim();
    if (!url) throw new Error(BTC.t('图床未返回地址'));
    return url;
  }

  function setEntityIconPreview(root, url) {
    const img = root.querySelector(".entity-icon-preview__img");
    const fallback = root.querySelector(".entity-icon-preview__fallback");
    const clearBtn = root.querySelector("[data-icon-clear]");
    const u = (url || "").trim();
    root.dataset.iconUrl = u;
    if (img) {
      if (u) {
        img.src = u;
        img.hidden = false;
      } else {
        img.removeAttribute("src");
        img.hidden = true;
      }
    }
    if (fallback) fallback.hidden = Boolean(u);
    if (clearBtn) clearBtn.hidden = !u;
  }

  function bindEntityIconField(root) {
    if (!root || root.dataset.bound === "1") return;
    root.dataset.bound = "1";

    const fileInput = root.querySelector(".entity-icon-field__file");
    const pickLabel = root.querySelector(".entity-icon-field__pick");
    const pickText = root.querySelector(".entity-icon-field__pick-text");
    const clearBtn = root.querySelector("[data-icon-clear]");
    const errEl = root.querySelector(".entity-icon-field__error");
    const form = root.closest("form");
    const orgSlug = form?.dataset.orgSlug || root.dataset.orgSlug;
    const projectSlug = form?.dataset.projectSlug || root.dataset.projectSlug;
    const kind = root.dataset.kind || (projectSlug ? "project" : "org");

    function showIconErr(msg) {
      if (!errEl) return;
      if (!msg) {
        errEl.hidden = true;
        errEl.textContent = "";
        return;
      }
      errEl.hidden = false;
      errEl.textContent = msg;
    }

    function setPickBusy(busy) {
      if (pickLabel) {
        pickLabel.classList.toggle("is-busy", busy);
        pickLabel.setAttribute("aria-busy", busy ? "true" : "false");
      }
      if (fileInput) fileInput.disabled = busy;
      if (pickText) pickText.textContent = busy ? BTC.t('上传中...') : BTC.t('选择图片');
    }

    fileInput?.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      showIconErr("");
      setPickBusy(true);
      try {
        const url = await uploadEntityIconFile(root, file);
        setEntityIconPreview(root, url);
        toast("success", BTC.t('图标已上传并保存'));
        // Refresh so headers/cards pick up the new icon
        setTimeout(() => location.reload(), 500);
      } catch (err) {
        console.error("[entity-icon] upload failed", err);
        const msg = err instanceof Error ? err.message : BTC.t('上传失败');
        showIconErr(msg);
        toast("error", msg);
      } finally {
        // Allow re-selecting the same file later
        try {
          fileInput.value = "";
        } catch {
          /* ignore */
        }
        setPickBusy(false);
      }
    });

    clearBtn?.addEventListener("click", async () => {
      showIconErr("");
      let endpoint = null;
      if (kind === "project" && orgSlug && projectSlug) {
        endpoint = `/api/v1/orgs/${orgSlug}/projects/${projectSlug}/icon`;
      } else if (orgSlug) {
        endpoint = `/api/v1/orgs/${orgSlug}/icon`;
      }
      if (!endpoint) return;
      if (!(await BTC.confirm(BTC.t('确定移除图标？')))) return;
      setButtonBusy(clearBtn, true, { busyLabel: BTC.t('移除中...') });
      try {
        const { res, data } = await json(endpoint, {
          method: "DELETE",
          credentials: "same-origin",
        });
        if (!res.ok) {
          showIconErr(data.error || BTC.t('移除失败'));
          toast("error", data.error || BTC.t('移除失败'));
          return;
        }
        setEntityIconPreview(root, "");
        toast("success", BTC.t('图标已移除'));
        setTimeout(() => location.reload(), 400);
      } catch {
        showIconErr(BTC.t('网络错误'));
        toast("error", BTC.t('网络错误'));
      } finally {
        setButtonBusy(clearBtn, false, { idleLabel: BTC.t('移除') });
      }
    });
  }

  function bindAllEntityIcons() {
    document.querySelectorAll("[data-entity-icon]").forEach(bindEntityIconField);
  }
  bindAllEntityIcons();
  document.addEventListener("settings:tab", () => bindAllEntityIcons());
})();
