// GROUP format-mismatch-empty-state — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP format-mismatch-empty-state — a file none of whose lines match its
   log format shows an empty-state panel (file name, format name, line count)
   with "Set up log format…" / "Open as plain text" instead of a blank table;
   both re-parse the file in place and pin the format.
   Origin: 2026-10-05 (usability round C; fixture: the simulator's tour
   welcome.log, which has its own format and so matches nothing under the
   default one).
   ============================================================ */
group("format-mismatch-empty-state");
if (groupSelected()) {
  const TOUR = require(path.join(__dirname, "..", "tools", "log-sim", "tour.js"));
  const tourFiles = Object.fromEntries(TOUR.generateTour().map(f => [f.path, f.text]));
  const tourText = tourFiles["welcome.log"];
  const tourLines = tourText.replace(/\r?\n$/, "").split(/\r\n|\n/).length;
  const panelOf = (d, body) => d.querySelector(body + " .fmt-mismatch-panel");
  const shown = (w, p) => !!p && p.classList.contains("show") && w.getComputedStyle(p).display !== "none";

  await withApp(async (w, d, T) => {
    section("format-mismatch-empty-state a. Panel names the file, the format and the line count; a normal file never shows it");
    await waitForFormatConfig(T);
    const f = await w.addFile("welcome.log", tourText, () => {});
    T.state.activeId = f.id; w.render();
    assert(f.entries.length === 0, "sanity: the tour log matches no line of the default format");
    const fp = panelOf(d, "#tableBody"), cp = panelOf(d, "#highlightBody");
    assert(shown(w, fp) && shown(w, cp), "the panel is shown in the Filtered and the Context view");
    assert(fp.querySelector("h2").textContent === "No line of welcome.log matches the log format “Default (log4net-style)”", "title, got " + fp.querySelector("h2").textContent);
    assert(fp.querySelector("p").textContent === tourLines.toLocaleString("de-DE") + " lines were read. Pick the format that fits, or open the file as plain text.", "sub-line, got " + fp.querySelector("p").textContent);
    assert(fp.querySelector(".fmt-mismatch-setup").textContent === "Set up log format…" && fp.querySelector(".fmt-mismatch-plain").textContent === "Open as plain text", "the two buttons");

    const ok = await w.addFile("ok.log", makeLog(0, 5), () => {});
    T.state.activeId = ok.id; w.render();
    assert(!shown(w, panelOf(d, "#tableBody")) && !shown(w, panelOf(d, "#highlightBody")), "a normal file never shows the panel");
    T.state.activeId = f.id; w.render();
    assert(shown(w, panelOf(d, "#tableBody")), "back on the mismatch file the panel is there again");
  });

  await withApp(async (w, d, T) => {
    section("format-mismatch-empty-state b. Open as plain text: entries = lines, panel gone, same node, format pinned, filter children stay");
    await waitForFormatConfig(T);
    const f = await w.addFile("welcome.log", tourText, () => {});
    T.state.activeId = f.id; w.render();
    const child = w.createFilterNode(f.id, "text", "Welcome");
    const idBefore = f.id;
    T.state.activeId = child.id; w.render();
    assert(shown(w, panelOf(d, "#tableBody")), "a filter child of the file shows the panel too");
    fireClick(panelOf(d, "#tableBody").querySelector(".fmt-mismatch-plain"), w);
    await waitFor(() => T.state.nodes[idBefore].entries.length === tourLines);
    const n = T.state.nodes[idBefore];
    assert(n === f && n.formatId === "fmt-plaintext", "same node, formatId pinned to plain text, got " + n.formatId);
    assert(n.entries.length === tourLines, "one entry per line, got " + n.entries.length);
    assert(!shown(w, panelOf(d, "#tableBody")) && !shown(w, panelOf(d, "#highlightBody")), "the panel is gone once the file has entries");
    assert(!n.noFormatMatch, "the kept text is released");
    assert(T.state.nodes[child.id] && T.state.nodes[child.id].parentId === f.id && w.getEntries(child.id).length > 0, "the filter child stays and now has matches");
  });

  await withApp(async (w, d, T) => {
    section("format-mismatch-empty-state c. Set up log format…: editor opens with the file's lines, saving re-parses and pins the new format");
    await waitForFormatConfig(T);
    const f = await w.addFile("welcome.log", tourText, () => {});
    T.state.activeId = f.id; w.render();
    fireClick(panelOf(d, "#tableBody").querySelector(".fmt-mismatch-setup"), w);
    assert(isVisible(d.querySelector("#formatDialog"), w), "the format editor opens");
    assert(T.fwz.lines.length > 5 && T.fwz.lines[0].startsWith("00:00:00.000 WHAT"), "prefilled with the file's first lines, got " + T.fwz.lines.length);
    assert(T.fwz.lines.length <= w.eval("FWZ_MAX_LINES"), "capped at FWZ_MAX_LINES");
    const exp = w.parseLogFormatExport(tourFiles["welcome.logformat.json"]);
    const rx = d.querySelector("#formatEditRegex");
    rx.dispatchEvent(new w.Event("focus"));
    rx.value = exp.logFormat.regex;
    fireInput(rx, w);
    d.querySelector("#formatEditTsFormat").value = exp.logFormat.tsFormat;
    fireInput(d.querySelector("#formatEditTsFormat"), w);
    d.querySelector("#formatEditName").value = "Tour fmt";
    fireClick(d.querySelector("#formatEditSave"), w);
    await waitFor(() => f.entries.length > 0);
    const saved = T.state.logFormats.find(x => x.name === "Tour fmt");
    assert(saved && f.formatId === saved.id, "the file is pinned to the new format");
    assert(f.entries.length > 10 && f.entries.every(e => e.formatId === saved.id), "re-parsed with it: " + f.entries.length + " entries");
    assert(T.state.nodes[f.id] === f, "same node");
    assert(!shown(w, panelOf(d, "#tableBody")), "the panel is gone");
  });

  await withApp(async (w, d, T) => {
    section("format-mismatch-empty-state d. Cancelling the editor changes nothing; phone hides Set up, keeps plain text");
    await waitForFormatConfig(T);
    const f = await w.addFile("welcome.log", tourText, () => {});
    T.state.activeId = f.id; w.render();
    fireClick(panelOf(d, "#tableBody").querySelector(".fmt-mismatch-setup"), w);
    fireClick(d.querySelector("#formatEditCancel"), w);
    assert(f.entries.length === 0 && shown(w, panelOf(d, "#tableBody")) && f.formatId !== "fmt-plaintext", "cancel leaves the file and the panel as they were");
    d.body.classList.add("layout-phone");
    assert(w.getComputedStyle(panelOf(d, "#tableBody").querySelector(".fmt-mismatch-setup")).display === "none", "phone: Set up log format is hidden");
    assert(w.getComputedStyle(panelOf(d, "#tableBody").querySelector(".fmt-mismatch-plain")).display !== "none", "...Open as plain text stays");
    d.body.classList.remove("layout-phone");
  });
}
