// GROUP 337 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 337 — Export / Share: ticket snippet logic (step 1 of the
   line-picks / gaps / inline-notes / rich-text rework, FEATURE_BACKLOG
   #91 + #92). pickTicketEntries (all / first / bookmarked / marked),
   the compact header (two lines; a selection filter becomes a "story"
   heading), ONE block with gap lines and notes inline, the budget cut
   line, buildTicketSnippetHtml (inline-style rich text) and the new
   remembered prefs (lines / gaps / header, format "rich").
   ============================================================ */
group(337);
await withApp(async (w, d, T) => {
  const levels = ["ERROR", "INFO", "WARN", "INFO", "INFO"];
  const f = await w.addFile("app.log", makeLog(0, 50, { levels }), () => {});
  const other = await w.addFile("other.log", makeLog(200, 5), () => {});
  T.state.activeId = f.id;
  const E = f.entries;
  const ctxOf = () => w.collectExportContext();
  const snip = (flavor, opts) => w.buildTicketSnippet(ctxOf(), flavor, opts);
  const timeOnly = ts => w.formatTime(ts).slice(11);

  section("337a. header: no-filter view, single entry, filter line, level step, header off");
  let md = snip("markdown", { entries: [E[1], E[3]] });
  let lines = md.split("\n");
  assert(lines[0] === "**app.log** (50 entries) · " + w.formatTime(E[1].ts) + " → " + timeOnly(E[3].ts), "no-filter view: one header line, span of the quoted entries, got " + lines[0]);
  assert(lines[1] === "" && lines[2] === "```", "no Filter line when the active node is the file itself, got " + JSON.stringify(lines.slice(1, 3)));
  md = snip("markdown", { entries: [E[4]] });
  assert(md.split("\n")[0] === "**app.log** (50 entries) · " + w.formatTime(E[4].ts), "a single quoted entry shows just one time");
  const txt = w.createFilterNode(f.id, "text", "message 1", false);
  T.state.activeId = txt.id;
  md = snip("markdown", { mode: "first", n: 1 });
  assert(md.split("\n")[1] === "**Filter:** Text contains: “message 1” → 11 of 50", "filter line lists the steps after the file + view count, got " + md.split("\n")[1]);
  T.state.levelFilter.add("ERROR");
  md = snip("markdown", { mode: "all" });
  assert(md.split("\n")[1] === "**Filter:** Text contains: “message 1” → Level quick filter: ERROR → 2 of 50", "the level quick filter is a step, got " + md.split("\n")[1]);
  T.state.levelFilter.clear();
  T.state.activeId = f.id;
  T.state.levelFilter.add("ERROR");
  md = snip("markdown", { mode: "first", n: 1 });
  assert(md.split("\n")[1] === "**Filter:** Level quick filter: ERROR → 10 of 50", "root file + level filter -> a Filter line with just the level step, got " + md.split("\n")[1]);
  T.state.levelFilter.clear();
  md = snip("markdown", { mode: "first", n: 2, header: false });
  assert(md.startsWith("```\n" + E[0].raw), "header off: the block only");
  assert(snip("plain", { mode: "first", n: 1, header: false }) === "    " + E[0].raw, "header off, plain: just the indented line");

  section("337b. gap lines");
  const gapIn = (entries, flavor) => snip(flavor || "markdown", { entries });
  md = gapIn([E[3], E[4], E[10]]);
  assert(!/···[^\n]*\n[^\n]*\n[^\n]*···/.test(md) && md.includes(E[3].raw + "\n" + E[4].raw + "\n··· 5 lines · +6s ···\n" + E[10].raw),
    "adjacent entries: no gap; 4 -> 10 skips 5 lines, +6s");
  assert(gapIn([E[3], E[5]]).includes("··· 1 line · +2s ···"), "a single skipped line reads '1 line'");
  md = gapIn([E[3], E[10], E[20]]);
  assert(md.split("\n").filter(l => l.startsWith("···")).length === 2 && !md.includes("```\n···") && !md.includes("···\n```"), "gaps only between entries, never before the first / after the last");
  assert(!snip("markdown", { entries: [E[3], E[10]], gaps: false }).includes("···"), "gaps off: no gap line");
  assert(snip("plain", { entries: [E[3], E[10]] }).includes("\n    ··· 6 lines · +7s ···\n"), "plain: the gap line is indented like the entries");
  md = gapIn([E[3], other.entries[1], E[10]]);
  assert(!md.includes("···"), "an entry outside the root file has no order index -> no gap line around it");
  const nan = { id: E[10].id, ts: NaN, raw: "x" };
  assert(gapIn([E[3], Object.assign({}, E[10], { ts: NaN })]).includes("··· 6 lines ···"), "a non-finite timestamp drops the +Δ part");

  section("337c. notes inline in all flavors; no bookmark marks in text; only quoted entries");
  w.setNoteAndRepaint(E[10].id, "first\nsecond");
  w.setNoteAndRepaint(E[30].id, "not quoted");
  w.toggleBookmark(E[10].id);
  for (const [flavor, open] of [["markdown", "```\n"], ["jira", "{noformat}\n"], ["plain", "    "]]) {
    const t = snip(flavor, { entries: [E[3], E[10], E[11]] });
    const ind = flavor === "plain" ? "    " : "";
    assert(t.includes(ind + E[10].raw + "\n" + ind + "  ↳ Note: first / second\n" + ind + E[11].raw), flavor + ": the note sits directly under its entry, multi-line note on one line");
    assert(!t.includes("not quoted") && !t.includes("★") && !t.includes("Bookmarks & notes"), flavor + ": unquoted entries' notes, ★ and the findings list are absent");
  }

  section("337d. pickTicketEntries: all / first / bookmarked / marked");
  T.state.activeId = txt.id;
  const c = ctxOf();
  const expected = f.entries.filter(e => e.message.includes("message 1"));
  assert(w.pickTicketEntries(c, "all") === c.entries, "all = the view's own array (no copy)");
  assert(w.pickTicketEntries(c, "first", 3).length === 3 && w.pickTicketEntries(c, "first", 3)[2] === expected[2], "first N = the first N of the view");
  assert(w.pickTicketEntries(c, "first", 0).length === 0 && w.pickTicketEntries(c, "first", 99999).length === 11, "first: 0 -> none, clamped at the view size");
  const bm = w.pickTicketEntries(c, "bookmarked");
  assert(bm.length === 2 && bm[0] === E[10] && bm[1] === E[30], "bookmarked = the root file's bookmarked/annotated entries in log order, regardless of the filter");
  T.state.logMultiSelect.add(E[20].id);
  T.state.logMultiSelect.add(E[5].id);
  T.state.logMultiSelect.add(other.entries[2].id);
  const mk = w.pickTicketEntries(c, "marked");
  assert(mk.length === 2 && mk[0] === E[5] && mk[1] === E[20], "marked = the multi-selection in log order, other files' rows dropped, got " + mk.length);
  T.state.logMultiSelect.clear();
  assert(w.pickTicketEntries(c, "marked").length === 0, "no marked rows -> empty");
  md = snip("markdown", { mode: "bookmarked" });
  assert(md.includes(E[10].raw + "\n  ↳ Note: first / second\n··· 19 lines · +20s ···\n" + E[30].raw + "\n  ↳ Note: not quoted"), "a bookmarked pick quotes both entries with gap and notes");

  section("337e. selection filter = story view");
  const sel = w.createSelectionFilterNode(f.id, [E[3].id, E[10].id, E[11].id, E[30].id]);
  sel.name = "Pool exhaustion";
  T.state.activeId = sel.id;
  T.state.levelFilter.add("ERROR");
  const sc = ctxOf();
  assert(sc.selection === true && sc.entries.length === 4 && !sc.steps.some(s => s.text.startsWith("Level quick")), "the level quick filter is ignored for a selection view");
  md = w.buildTicketSnippet(sc, "markdown", { mode: "all" });
  lines = md.split("\n");
  assert(lines[0] === "### Pool exhaustion" && lines[1] === "" && lines[2] === "**app.log** (50 entries) · 4 hand-picked entries · " + w.formatTime(E[3].ts) + " → " + timeOnly(E[30].ts),
    "story header: heading, blank, file + hand-picked count + span, got " + JSON.stringify(lines.slice(0, 3)));
  assert(!md.includes("Filter:") && lines[3] === "" && lines[4] === "```", "story header has no Filter line");
  assert(w.buildTicketSnippet(sc, "plain", { mode: "all" }).startsWith("Pool exhaustion\n===============\n\napp.log"), "plain: underlined heading");
  T.state.levelFilter.clear();
  T.state.activeId = f.id;

  section("337f. budget: cut line, All on a big view stops early");
  const huge = "x".repeat(5000);
  const h = await w.addFile("huge.log", makeLog(0, 200, { suffix: () => huge }), () => {});
  T.state.activeId = h.id;
  const hc = ctxOf();
  const hmd = w.buildTicketSnippet(hc, "markdown", { mode: "all" });
  const hm = hmd.match(/^_… (\d+) more entries not quoted — see the attached export\._$/m);
  assert(hm && hmd.length <= w.eval("TICKET_SNIPPET_MAX_CHARS") && hmd.trimEnd().endsWith("attached export._"), "italic cut line after the block, cap respected");
  const hh = w.buildTicketSnippetHtml(hc, { mode: "all" });
  assert(hh.includes("more entries not quoted — see the attached export.") && hh.length < 2 * w.eval("TICKET_SNIPPET_MAX_CHARS"), "rich: same cut line, bounded");

  section("337g. rich text HTML: escaping, ★ + background, note, colors, gap; text/plain = plain flavor");
  T.state.activeId = f.id;
  const x = await w.addFile("xss.log", makeLog(0, 6, { levels, msgPrefix: "<script>alert(1)</script> & \"q\"" }), () => {});
  T.state.activeId = x.id;
  w.toggleBookmark(x.entries[2].id);
  w.setNoteAndRepaint(x.entries[2].id, "see <b>this</b>");
  const xc = ctxOf();
  const picks = [x.entries[0], x.entries[2], x.entries[4]];
  const html = w.buildTicketSnippetHtml(xc, { entries: picks });
  const box = d.createElement("div");
  box.innerHTML = html;
  assert(!box.querySelector("script") && !box.querySelector("b > b") && !html.includes("<script") && html.includes("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;q&quot;"),
    "log text and notes are escaped, no <script> in the markup");
  assert(!html.includes("<style") && !html.includes("<a ") && !html.includes("<img"), "inline styles only, no links/images");
  assert(html.includes("★ ") && html.includes("background:#fff7d6"), "bookmarked entry: ★ prefix and light-yellow background");
  assert(html.includes("border-left:3px solid #1f8f8b") && html.includes("Note: see &lt;b&gt;this&lt;/b&gt;"), "note div with teal left border, escaped");
  assert(html.includes("color:#ae2e24") && html.includes("color:#9a6700"), "ERROR entry red, WARN entry amber");
  assert(!w.buildTicketSnippetHtml(xc, { entries: [x.entries[1]] }).includes("color:#"), "an INFO entry keeps the default color");
  assert(html.includes("font-style:italic;padding:1px 8px\">··· 1 line") , "grey italic centered gap div");
  assert(box.firstElementChild.textContent.startsWith("xss.log (50 entries)") === false && box.firstElementChild.textContent.startsWith("xss.log (6 entries)"), "header div comes first");
  assert(!w.buildTicketSnippetHtml(xc, { entries: picks, gaps: false }).includes("···") && !w.buildTicketSnippetHtml(xc, { entries: picks, header: false }).includes("(6 entries)"), "gaps/header options apply to the HTML too");
  assert(w.buildTicketSnippet(xc, "rich", { entries: picks }) === w.buildTicketSnippet(xc, "plain", { entries: picks }), "the text/plain half (flavor 'rich') is the Plain-text flavor");
  assert(w.buildTicketSnippetHtml(xc, { entries: [] }).includes("(no lines selected)"), "empty pick");

  section("337h. copy path writes text/html only for rich; prefs");
  let written = null, plainCopied = null;
  w.ClipboardItem = function (items) { this.items = items; };
  w.navigator.clipboard.write = items => { written = items[0].items; return Promise.resolve(); };
  w.navigator.clipboard.writeText = t => { plainCopied = t; return Promise.resolve(); };
  w.eval('exportFormat = "rich"');
  w.copyTicketSnippet();
  assert(written && (await written["text/html"].text()).includes("border:1px solid #dcdfe4") && (await written["text/plain"].text()).length > 0, "rich: text/html + text/plain via ClipboardItem");
  written = null;
  w.eval('exportFormat = "markdown"');
  w.copyTicketSnippet();
  assert(written === null && plainCopied && plainCopied.startsWith("**"), "other flavors: text only");
  w.localStorage.clear();
  w.loadExportPrefs();
  assert(w.eval("exportLinesMode") === "first" && w.eval("exportGaps") === true && w.eval("exportHeader") === true, "defaults: First, gaps on, header on");
  w.localStorage.setItem("philogg-export-lines", "bookmarked");
  w.localStorage.setItem("philogg-export-gaps", "0");
  w.localStorage.setItem("philogg-export-header", "0");
  w.localStorage.setItem("philogg-export-format", "rich");
  w.loadExportPrefs();
  assert(w.eval("exportLinesMode") === "bookmarked" && w.eval("exportGaps") === false && w.eval("exportHeader") === false && w.eval("exportFormat") === "rich", "stored values are picked up, 'rich' is a valid format");
  w.localStorage.setItem("philogg-export-lines", "marked");
  w.loadExportPrefs();
  assert(w.eval("exportLinesMode") === "first", "'marked' is transient and never restored");
  w.eval('exportLinesMode = "all"; exportGaps = true; exportHeader = true'); w.saveExportPrefs();
  assert(w.localStorage.getItem("philogg-export-lines") === "all" && w.localStorage.getItem("philogg-export-gaps") === "1" && w.localStorage.getItem("philogg-export-header") === "1", "saveExportPrefs writes the three new keys");
});
