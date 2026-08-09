(() => {
  const form = document.getElementById("export-form");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const base = form.dataset.base;
    if (!base) return;

    const locale = form.querySelector("#export-locale")?.value;
    const mode = form.querySelector("#export-mode")?.value || "approved";
    const pack = form.querySelector("#export-pack")?.value || "zip";
    const filename = form.querySelector("#export-filename")?.value || "locale_suffix";
    const fileId = form.querySelector("#export-file")?.value || "";
    const fallbackMt = form.querySelector("#export-fallback-mt")?.checked;

    if (!locale) return;

    const params = new URLSearchParams({ locale, mode, pack, filename });
    if (fileId) params.set("fileId", fileId);
    if (fallbackMt) params.set("fallbackMt", "1");

    // Navigate so browser downloads via Content-Disposition
    window.location.href = `${base}?${params.toString()}`;
  });
})();
