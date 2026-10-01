// GROUP 338 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 338 — Export / Share dialog rework (step 2): Lines segmented
   control (Marked rows / All / First N / Bookmarked), Format incl. Rich
   text, gaps + header toggles, textarea <-> rich div preview, Save file
   menu, Copy. Defaults on open, remembered prefs.
   ============================================================ */
group(338);
await withApp(async (w, d, T) => {
  const dlg = d.querySelector("#exportDialog");
  const f = await w.addFile("app.log", makeLog(0, 40, { levels: ["ERROR", "INFO", "WARN", "INFO", "INFO"] }), () => {});
  const E = f.entries;
  T.state.activeId = f.id;
  const btn = k => d.querySelector('[data-export-lines="' + k + '"]');
  const active = () => [...d.querySelectorAll("[data-export-lines].active")].map(b => b.dataset.exportLines).join(",");
  const prev = () => d.querySelector("#exportPreview");
  const rich = () => d.querySelector("#exportPreviewRich");
  const open = () => { w.closeExportDialog(); w.openExportDialog(); };

  section("338a. old controls gone, new controls present");
  open();
  assert(!d.querySelector("#exportExcerptInput") && !d.querySelector(".export-file-row") && !/Save as attachment/.test(dlg.textContent), "the Excerpt-lines row and the attachment section are gone");
  assert(d.querySelector("#exportSaveBtn") && d.querySelector("#exportCopy").textContent === "Copy" && d.querySelectorAll("#exportDialog .btn-mini").length === 1, "Save file button + one primary Copy");
  assert(["markdown", "jira", "plain", "rich"].every(k => d.querySelector('[data-export-format="' + k + '"]')), "four format buttons");

  section("338b. defaults on open: no selection -> remembered (First), Marked rows disabled");
  assert(active() === "first" && btn("marked").disabled, "no marked rows: First is active, Marked rows disabled, got " + active());
  assert(d.querySelector("#exportNAll").textContent === "(40)" && d.querySelector("#exportNBookmarked").textContent === "(0)" && d.querySelector("#exportNMarked").textContent === "(0)", "counts on the segments");
  assert(d.querySelector("#exportFirstN").value === "20", "First N shows the remembered number");
  T.state.logMultiSelect.add(E[3].id);
  open();
  assert(btn("marked").disabled && active() === "first", "a single marked row does not enable Marked rows");
  T.state.logMultiSelect.add(E[9].id);
  open();
  assert(!btn("marked").disabled && active() === "marked" && d.querySelector("#exportNMarked").textContent === "(2)", "two marked rows: Marked rows enabled and the default");
  assert(prev().value === w.buildTicketSnippet(w.collectExportContext(), "markdown", { mode: "marked" }) && prev().value.includes(E[9].raw), "preview quotes the marked rows");
  assert(prev().value.includes("··· 5 lines"), "gap line between the two marked rows");
  T.state.logMultiSelect.clear();
  open();

  section("338c. Lines choices: remembered except Marked rows; N input");
  fireClick(btn("all"), w);
  assert(active() === "all" && w.localStorage.getItem("philogg-export-lines") === "all" && prev().value.includes(E[39].raw), "All quotes everything and is remembered");
  open();
  assert(active() === "all", "reopened with the remembered All");
  w.toggleBookmark(E[7].id);
  open();
  fireClick(btn("bookmarked"), w);
  assert(active() === "bookmarked" && prev().value.includes(E[7].raw) && !prev().value.includes(E[8].raw) && w.localStorage.getItem("philogg-export-lines") === "bookmarked", "Bookmarked quotes the bookmark and is remembered");
  const n = d.querySelector("#exportFirstN");
  n.value = "3";
  n.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(active() === "first" && prev().value.split("\n").filter(l => l.includes("\t")).length === 3 && w.localStorage.getItem("philogg-export-excerpt-lines") === "3", "typing N selects First and applies it");
  fireClick(btn("all"), w);
  n.dispatchEvent(new w.Event("focus"));
  assert(active() === "first", "focusing the N input selects First");
  T.state.logMultiSelect.add(E[3].id); T.state.logMultiSelect.add(E[4].id);
  open();
  fireClick(btn("first"), w);
  assert(w.localStorage.getItem("philogg-export-lines") === "first", "picking First stores first");
  fireClick(btn("marked"), w);
  assert(active() === "marked" && w.localStorage.getItem("philogg-export-lines") === "first", "Marked rows is never stored");
  T.state.logMultiSelect.clear();
  open();
  assert(active() === "first", "after clearing the selection the stored First is back");

  section("338d. selection filter opens on All");
  const sel = w.createSelectionFilterNode(f.id, [E[2].id, E[10].id, E[11].id]);
  sel.name = "Pool exhaustion";
  T.state.activeId = sel.id;
  w.localStorage.setItem("philogg-export-lines", "bookmarked"); w.loadExportPrefs();
  T.state.logMultiSelect.add(E[3].id); T.state.logMultiSelect.add(E[4].id);
  open();
  assert(active() === "all" && prev().value.startsWith("### Pool exhaustion"), "story view: All wins over marked rows and the remembered choice");
  T.state.logMultiSelect.clear();
  T.state.activeId = f.id;
  w.localStorage.setItem("philogg-export-lines", "first"); w.loadExportPrefs();

  section("338e. toggles + format: remembered, preview switches textarea <-> rich div");
  open();
  const gaps = d.querySelector("#exportGapsToggle"), head = d.querySelector("#exportHeaderToggle");
  assert(gaps.getAttribute("aria-checked") === "true" && head.getAttribute("aria-checked") === "true", "both toggles start on");
  fireClick(gaps, w);
  assert(w.localStorage.getItem("philogg-export-gaps") === "0" && !prev().value.includes("···") && gaps.getAttribute("aria-checked") === "false", "gaps toggle: off, remembered, preview updated");
  fireClick(head, w);
  assert(w.localStorage.getItem("philogg-export-header") === "0" && prev().value.startsWith("```"), "header toggle: off, remembered, preview updated");
  open();
  assert(d.querySelector("#exportGapsToggle").getAttribute("aria-checked") === "false" && d.querySelector("#exportHeaderToggle").getAttribute("aria-checked") === "false", "reopening shows the remembered toggles");
  fireClick(gaps, w); fireClick(head, w);
  assert(isVisible(prev(), w) && !isVisible(rich(), w), "text flavor: textarea visible, rich div hidden");
  fireClick(d.querySelector('[data-export-format="rich"]'), w);
  assert(!isVisible(prev(), w) && isVisible(rich(), w) && w.localStorage.getItem("philogg-export-format") === "rich", "Rich text: the rich div replaces the textarea, format remembered");
  assert(rich().innerHTML === w.buildTicketSnippetHtml(w.collectExportContext(), { mode: "first", n: 3, gaps: true, header: true }) || rich().querySelector("div"), "the rich div renders the snippet HTML");
  fireClick(d.querySelector('[data-export-format="plain"]'), w);
  assert(isVisible(prev(), w) && !isVisible(rich(), w), "back to a text flavor");

  section("338f. Copy: html only for rich; toast");
  let written = null, plain = null;
  w.ClipboardItem = function (items) { this.items = items; };
  w.navigator.clipboard.write = items => { written = items[0].items; return Promise.resolve(); };
  w.navigator.clipboard.writeText = t => { plain = t; return Promise.resolve(); };
  fireClick(d.querySelector('[data-export-format="markdown"]'), w);
  fireClick(d.querySelector("#exportCopy"), w);
  assert(written === null && plain === prev().value, "Markdown: text only, exactly the preview");
  assert(d.querySelector("#copyToast").textContent === "Copied for ticket (3 entries)", "toast with the entry count, got " + d.querySelector("#copyToast").textContent);
  fireClick(d.querySelector('[data-export-format="rich"]'), w);
  fireClick(d.querySelector("#exportCopy"), w);
  assert(written && (await written["text/html"].text()) === w.buildTicketSnippetHtml(w.collectExportContext(), { mode: "first", n: 3, gaps: true, header: true }) && !(await written["text/plain"].text()).includes("<div"), "Rich: text/html = the builder's HTML, text/plain is plain text");
  fireClick(btn("all"), w);
  fireClick(d.querySelector("#exportCopy"), w);
  assert(d.querySelector("#copyToast").textContent === "Copied for ticket (40 entries)", "Copy uses the dialog's current Lines choice");
  fireClick(d.querySelector('[data-export-format="markdown"]'), w);

  section("338g. Save file menu");
  const menu = d.querySelector("#exportSaveMenu");
  assert(!isVisible(menu, w), "menu starts closed");
  fireClick(d.querySelector("#exportSaveBtn"), w);
  assert(isVisible(menu, w), "opener opens the menu");
  fireClick(d.querySelector("#exportSaveBtn"), w);
  assert(!isVisible(menu, w), "opener toggles it closed");
  fireClick(d.querySelector("#exportSaveBtn"), w);
  fireClick(d.querySelector("#exportDialog .link-dialog-title"), w);
  assert(!isVisible(menu, w) && isVisible(dlg, w), "a click elsewhere in the dialog closes the menu, the dialog stays");
  fireClick(d.querySelector("#exportSaveBtn"), w);
  fireKeydown(d, w, "Escape");
  assert(!isVisible(dlg, w) && !isVisible(menu, w), "Escape closes the dialog and the menu");
  open();
  assert(!isVisible(menu, w), "a reopened dialog has the menu closed");
  const saved = [];
  w.downloadBlobFallback = (blob, name) => saved.push(name);
  for (const kind of ["log", "csv", "tsv", "html"]) {
    fireClick(d.querySelector("#exportSaveBtn"), w);
    fireClick(d.querySelector('#exportSaveMenu [data-export-file="' + kind + '"]'), w);
    assert(!isVisible(menu, w), "choosing " + kind + " closes the menu");
    await waitFor(() => saved.length && saved[saved.length - 1].endsWith("." + kind));
  }
  assert(JSON.stringify(saved) === JSON.stringify(["app.log", "app.csv", "app.tsv", "app.html"]), "each menu item saves its kind, got " + JSON.stringify(saved));
});
