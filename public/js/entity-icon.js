/**
 * Org/project icon picker — standalone so settings pages work even if forms.js is cached.
 * Markup: [data-entity-icon] with .entity-icon-field__file and form[data-org-slug]
 */
(function () {
  if (window.__BTC_ENTITY_ICON_BOUND__) return;
  window.__BTC_ENTITY_ICON_BOUND__ = true;

  function btc() {
    return window.BTC || {};
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error(BTC.t('读取文件失败')));
      reader.readAsDataURL(file);
    });
  }

  async function apiJson(url, options) {
    if (btc().json) return btc().json(url, options);
    const res = await fetch(url, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(options && options.headers) },
      ...options,
    });
    let data = {};
    try {
      data = await res.json();
    } catch {
      /* ignore */
    }
    return { res, data };
  }

  function toast(type, message) {
    if (btc().toast) btc().toast(type, message);
    else console.log("[entity-icon]", type, message);
  }

  function setPreview(root, url) {
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

  function endpointFor(root) {
    const form = root.closest("form");
    const orgSlug = (form && form.dataset.orgSlug) || root.dataset.orgSlug;
    const projectSlug = (form && form.dataset.projectSlug) || root.dataset.projectSlug;
    const kind = root.dataset.kind || (projectSlug ? "project" : "org");
    if (kind === "project" && orgSlug && projectSlug) {
      return "/api/v1/orgs/" + encodeURIComponent(orgSlug) + "/projects/" + encodeURIComponent(projectSlug) + "/icon";
    }
    if (orgSlug) return "/api/v1/orgs/" + encodeURIComponent(orgSlug) + "/icon";
    return null;
  }

  async function uploadFile(root, file) {
    const endpoint = endpointFor(root);
    if (!endpoint) throw new Error(BTC.t('缺少组织/项目上下文'));
    if (file.size > 2 * 1024 * 1024) throw new Error(BTC.t('图标不能超过 2MB'));
    const dataUrl = await fileToDataUrl(file);
    if (!String(dataUrl).startsWith("data:image/")) throw new Error(BTC.t('无法读取图片'));
    const { res, data } = await apiJson(endpoint, {
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify({ imageBase64: dataUrl }),
    });
    if (!res.ok) throw new Error((data && data.error) || BTC.t('上传失败'));
    const url = ((data && (data.iconUrl || data.webpUrl)) || "").trim();
    if (!url) throw new Error(BTC.t('图床未返回地址'));
    return url;
  }

  function bind(root) {
    if (!root || root.dataset.entityIconJs === "1") return;
    root.dataset.entityIconJs = "1";

    const fileInput = root.querySelector(".entity-icon-field__file");
    const pickLabel = root.querySelector(".entity-icon-field__pick");
    const pickText = root.querySelector(".entity-icon-field__pick-text");
    const clearBtn = root.querySelector("[data-icon-clear]");
    const errEl = root.querySelector(".entity-icon-field__error");

    function showErr(msg) {
      if (!errEl) return;
      if (!msg) {
        errEl.hidden = true;
        errEl.textContent = "";
        return;
      }
      errEl.hidden = false;
      errEl.textContent = msg;
    }

    function busy(on) {
      if (pickLabel) {
        pickLabel.classList.toggle("is-busy", on);
        pickLabel.setAttribute("aria-busy", on ? "true" : "false");
      }
      if (fileInput) fileInput.disabled = !!on;
      if (pickText) pickText.textContent = on ? BTC.t('上传中...') : BTC.t('选择图片');
    }

    if (fileInput) {
      fileInput.addEventListener("change", async function () {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        showErr("");
        busy(true);
        try {
          const url = await uploadFile(root, file);
          setPreview(root, url);
          toast("success", BTC.t('图标已上传并保存'));
          setTimeout(function () {
            location.reload();
          }, 450);
        } catch (e) {
          console.error("[entity-icon]", e);
          const msg = e && e.message ? e.message : BTC.t('上传失败');
          showErr(msg);
          toast("error", msg);
        } finally {
          try {
            fileInput.value = "";
          } catch (_) {}
          busy(false);
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", async function () {
        const endpoint = endpointFor(root);
        if (!endpoint) return;
        if (!(await BTC.confirm(BTC.t('确定移除图标？')))) return;
        showErr("");
        clearBtn.disabled = true;
        try {
          const { res, data } = await apiJson(endpoint, {
            method: "DELETE",
            credentials: "same-origin",
          });
          if (!res.ok) {
            const msg = (data && data.error) || BTC.t('移除失败');
            showErr(msg);
            toast("error", msg);
            return;
          }
          setPreview(root, "");
          toast("success", BTC.t('图标已移除'));
          setTimeout(function () {
            location.reload();
          }, 400);
        } catch (e) {
          showErr(BTC.t('网络错误'));
          toast("error", BTC.t('网络错误'));
        } finally {
          clearBtn.disabled = false;
        }
      });
    }
  }

  function bindAll() {
    document.querySelectorAll("[data-entity-icon]").forEach(bind);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindAll);
  } else {
    bindAll();
  }
  document.addEventListener("settings:tab", bindAll);
})();
