(function () {
  const { json, toast, showError, setButtonBusy } = window.BTC;

  const form = document.getElementById("mt-upload-form");
  if (!form) return;

  const orgSlug = form.dataset.orgSlug;
  const projectSlug = form.dataset.projectSlug;
  const err = document.getElementById("mt-form-error");
  const localeEl = document.getElementById("mt-locale");
  const filePick = document.getElementById("mt-file-pick");
  const contentEl = document.getElementById("mt-content");
  const clearBtn = document.getElementById("mt-clear");

  filePick?.addEventListener("change", async () => {
    const file = filePick.files && filePick.files[0];
    if (!file || !contentEl) return;
    try {
      contentEl.value = await file.text();
    } catch {
      toast?.("error", BTC.t('读取文件失败'));
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const locale = localeEl?.value;
    const content = (contentEl?.value || "").trim();
    showError(err, "");
    if (!locale) {
      showError(err, BTC.t('请选择目标语言'));
      return;
    }
    if (!content) {
      showError(err, BTC.t('请选择机器翻译文件或粘贴内容'));
      return;
    }
    const btn = form.querySelector('button[type="submit"]');
    setButtonBusy(btn, true, { busyLabel: BTC.t('上传中...') });
    try {
      const { res, data } = await json(
        `/api/v1/orgs/${orgSlug}/projects/${projectSlug}/mt-files`,
        {
          method: "POST",
          body: JSON.stringify({ locale, fileId: null, content }),
        },
      );
      if (!res.ok) {
        showError(err, data.error || BTC.t('上传失败'));
        return;
      }
      toast?.("success", BTC.t('已上传 {count} 条机器翻译', { count: data.upserted }));
      location.reload();
    } catch {
      showError(err, BTC.t('网络错误'));
    } finally {
      setButtonBusy(btn, false, { idleLabel: BTC.t('上传机器翻译') });
    }
  });

  clearBtn?.addEventListener("click", async () => {
    const locale = localeEl?.value;
    if (!locale) return;
    if (!(await BTC.confirm(BTC.t('确定清空该语言的机器翻译？')))) return;
    setButtonBusy(clearBtn, true, { busyLabel: BTC.t('删除中...') });
    try {
      const { res, data } = await json(
        `/api/v1/orgs/${orgSlug}/projects/${projectSlug}/mt-files?locale=${encodeURIComponent(locale)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        toast?.("error", data.error || BTC.t('删除失败'));
        return;
      }
      toast?.("success", BTC.t('已清空机器翻译'));
      location.reload();
    } catch {
      toast?.("error", BTC.t('网络错误'));
    } finally {
      setButtonBusy(clearBtn, false, { idleLabel: BTC.t('清空该语言机器翻译') });
    }
  });
})();
