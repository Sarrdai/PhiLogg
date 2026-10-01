// GROUP 283 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 283 — Export / Share: dialog, remembered format, shortcut
   Origin: 2026-09-25 session (see GROUP 281). One entry point: #btnExport
   in the top toolbar + rebindable Ctrl+Shift+E (exportView) opening
   #exportDialog — flavor switch (remembered in philogg-export-format),
   the First-N input (philogg-export-excerpt-lines), live preview, Copy
   (primary), Save file menu with the four attachment kinds. Esc closes it.
   (Layout reworked 2026-09-30 — see GROUP 338.)
   ============================================================ */
group(283);
await withApp(async (w, d, T) => {
  section("283a. Entry points and the empty case");
  const dlg = d.querySelector("#exportDialog");
  assert(!isVisible(dlg, w), "the dialog starts hidden");
  fireClick(d.querySelector("#btnExport"), w);
  assert(!isVisible(dlg, w) && d.querySelector("#copyToast").textContent === "Nothing to export", "nothing loaded -> toast, no dialog");

  const f = await w.addFile("app.log", makeLog(0, 30), () => {});
  const txt = w.createFilterNode(f.id, "text", "message 2");
  T.state.activeId = txt.id;
  w.render();
  fireClick(d.querySelector("#btnExport"), w);
  assert(isVisible(dlg, w), "#btnExport opens the dialog");
  assert(d.querySelector("#exportViewLabel").textContent === "“message 2”", "title names the view");
  assert(d.querySelector("#exportSummary").textContent === "11 of 30 entries · 2 steps · 0 bookmarks/notes",
    "summary line, got " + d.querySelector("#exportSummary").textContent);
  const ctx = w.collectExportContext();
  assert(d.querySelector("#exportPreview").value === w.buildTicketSnippet(ctx, "markdown", { mode: "first", n: 20 }), "preview = the Markdown snippet with the default 20 excerpt lines");
  assert(d.querySelector('[data-export-format="markdown"]').classList.contains("active"), "Markdown is the default flavor");
  fireKeydown(d, w, "Escape");
  assert(!isVisible(dlg, w), "Esc closes the dialog");
  fireKeydown(d, w, "E", { ctrlKey: true, shiftKey: true });
  assert(isVisible(dlg, w), "Ctrl+Shift+E opens it");
  assert(w.eval('SHORTCUT_ACTIONS.some(a => a.id === "exportView")'), "the shortcut is a rebindable Shortcut Manager action");

  section("283b. Flavor + excerpt lines: live preview, remembered");
  fireClick(d.querySelector('[data-export-format="jira"]'), w);
  assert(d.querySelector("#exportPreview").value.startsWith("*app.log* (30 entries)") && d.querySelector('[data-export-format="jira"]').classList.contains("active"),
    "switching flavor re-renders the preview");
  assert(w.localStorage.getItem("philogg-export-format") === "jira", "the flavor is remembered in localStorage");
  const inp = d.querySelector("#exportFirstN");
  inp.value = "2";
  inp.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(d.querySelector("#exportPreview").value.split("\n").filter(l => l.includes("\t")).length === 2, "excerpt lines apply to the preview");
  assert(w.localStorage.getItem("philogg-export-excerpt-lines") === "2", "excerpt lines are remembered");
  inp.value = "99999";
  inp.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(inp.value === "500", "excerpt lines are clamped to 500");
  inp.value = "2";
  inp.dispatchEvent(new w.Event("change", { bubbles: true }));
  w.localStorage.setItem("philogg-export-format", "bogus");
  w.loadExportPrefs();
  assert(w.eval("exportFormat") === "markdown" && w.eval("exportExcerptLines") === 2, "an unknown stored flavor falls back to Markdown on load");
  w.localStorage.setItem("philogg-export-format", "plain");
  w.loadExportPrefs();
  assert(w.eval("exportFormat") === "plain", "a stored flavor is picked up on load");
  w.closeExportDialog();
  w.openExportDialog();
  assert(d.querySelector('[data-export-format="plain"]').classList.contains("active") && d.querySelector("#exportFirstN").value === "2",
    "reopening shows the remembered flavor and excerpt lines");

  section("283c. Copy for ticket + attachment buttons");
  let copied = null;
  w.navigator.clipboard.writeText = t => { copied = t; return Promise.resolve(); };
  fireClick(d.querySelector("#exportCopy"), w);
  assert(copied === w.buildTicketSnippet(w.collectExportContext(), "plain", { mode: "first", n: 2 }), "Copy for ticket writes the snippet (current flavor + excerpt) to the clipboard");
  assert(d.querySelector("#copyToast").textContent === "Copied for ticket (2 entries)", "a toast confirms the copy with the entry count, got " + d.querySelector("#copyToast").textContent);
  assert(isVisible(dlg, w), "the dialog stays open after copying (attachments can follow)");
  const downloads = [];
  w.downloadBlobFallback = (blob, name) => downloads.push(name);
  for (const kind of ["log", "csv", "tsv", "html"]) {
    fireClick(d.querySelector('[data-export-file="' + kind + '"]'), w);
    await waitFor(() => downloads.length && downloads[downloads.length - 1].endsWith("." + kind));
  }
  assert(JSON.stringify(downloads) === JSON.stringify(["app-message_2.log", "app-message_2.csv", "app-message_2.tsv", "app-message_2.html"]),
    "each attachment button saves its file kind, got " + JSON.stringify(downloads));
  fireClick(d.querySelector("#exportClose"), w);
  assert(!isVisible(dlg, w), "Close closes the dialog");
});
