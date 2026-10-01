// GROUP 281 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 281 — Export / Share: context + "Copy for ticket" snippet
   Origin: 2026-09-25 session (FEATURE_BACKLOG.md #31 + #32, ticket-
   oriented export — see docs/export.md). collectExportContext gathers the
   active view (active node's result + level quick-filter), the filter
   chain as human-readable steps with per-step counts, sources, time span
   and the root file's bookmarks/notes; buildTicketSnippet renders it in
   three flavors (Markdown / Jira wiki / plain), bounded by excerpt-line
   count, per-entry and total character caps, each cut announced.
   ============================================================ */
group(281);
await withApp(async (w, d, T) => {
  section("281a. collectExportContext: view entries, chain steps with counts, sources, time span, findings");
  assert(w.collectExportContext() === null, "no active node -> nothing to export (null)");
  const f = await w.addFile("app.log", makeLog(0, 50), () => {});
  const other = await w.addFile("other.log", makeLog(200, 5), () => {});
  const txt = w.createFilterNode(f.id, "text", "message 1", false, null, true, ["message"], false, false);
  T.state.activeId = txt.id;
  let ctx = w.collectExportContext();
  const expected = f.entries.filter(e => e.message.includes("message 1"));
  assert(ctx.entries.length === expected.length && expected.length === 11, "the view is the active filter's result (11 of 50), got " + ctx.entries.length);
  assert(ctx.total === 50 && ctx.root === f && ctx.active === txt, "total = the root file's entry count, root/active resolved");
  assert(ctx.steps.length === 2 && ctx.steps[0].text === "File: app.log" && ctx.steps[0].count === 50,
    "step 1 is the file with its full count, got " + JSON.stringify(ctx.steps[0]));
  assert(ctx.steps[1].text === "Text contains: “message 1” [case-sensitive, in Message]" && ctx.steps[1].count === 11,
    "step 2 describes the text filter incl. case/column flags and its count, got " + JSON.stringify(ctx.steps[1]));
  assert(JSON.stringify(ctx.sources) === JSON.stringify(["app.log"]), "sources = the root file's name");
  assert(ctx.from === expected[0].ts && ctx.to === expected[expected.length - 1].ts, "time span = first/last matching entry");

  // Level quick filter narrows the view and becomes its own last step.
  T.state.levelFilter.add("ERROR");
  ctx = w.collectExportContext();
  const errs = expected.filter(e => e.level === "ERROR");
  assert(ctx.entries.length === errs.length && ctx.steps.length === 3 && ctx.steps[2].text === "Level quick filter: ERROR" && ctx.steps[2].count === errs.length,
    "the level quick filter applies to the view and shows as a final chain step, got " + JSON.stringify(ctx.steps[2]));
  T.state.levelFilter.clear();

  // NOT + label: the label leads, the actual condition stays visible.
  const inv = w.createFilterNode(txt.id, "text", "message 10", true);
  inv.label = "Not the tenth";
  assert(w.describeExportStep(inv) === "NOT Not the tenth (Text contains: “message 10”)", "NOT prefix + label keep the condition, got " + w.describeExportStep(inv));
  const lvl = w.createFilterNode(f.id, "level", ["ERROR", "WARN"]);
  assert(w.describeExportStep(lvl) === "Level: ERROR, WARN", "a level node reads 'Level: ERROR, WARN', got " + w.describeExportStep(lvl));
  const rx = w.createFilterNode(f.id, "text", "mess.ge 4\\d", false, null, false, null, true);
  assert(w.describeExportStep(rx) === "Regex: /mess.ge 4\\d/", "a regex node reads 'Regex: /…/', got " + w.describeExportStep(rx));

  // Findings: the ROOT file's bookmarked/annotated entries, in log order —
  // not another file's, and regardless of the active filter.
  w.toggleBookmark(f.entries[30].id);
  w.setNoteAndRepaint(f.entries[12].id, "first failure\nsee ticket");
  w.toggleBookmark(other.entries[1].id);
  T.state.activeId = txt.id;
  ctx = w.collectExportContext();
  assert(ctx.findings.length === 2 && ctx.findings[0].entry === f.entries[12] && ctx.findings[1].entry === f.entries[30],
    "findings = this root's bookmarks + notes in log order, other file's bookmark excluded");
  assert(ctx.findings[0].note === "first failure\nsee ticket" && !ctx.findings[0].bookmarked && ctx.findings[1].bookmarked,
    "a finding carries its note and bookmark flag");

  section("281b. buildTicketSnippet: Markdown / Jira wiki / plain flavors (compact header, one block, gap line)");
  const first3 = { mode: "first", n: 3 };
  const q3 = expected.slice(0, 3); // message 1, message 10, message 11
  const span3 = w.formatTime(q3[0].ts) + " → " + w.formatTime(q3[2].ts).slice(11);
  const md = w.buildTicketSnippet(ctx, "markdown", first3);
  const mdLines = md.split("\n");
  assert(mdLines[0] === "**app.log** (50 entries) · " + span3, "Markdown: line 1 = bold file, entry count, span of the QUOTED entries, got " + mdLines[0]);
  assert(mdLines[1] === "**Filter:** Text contains: “message 1” \\[case-sensitive, in Message\\] → 11 of 50",
    "Markdown: line 2 = chain steps after the file step + view count, brackets escaped, got " + mdLines[1]);
  assert(mdLines[2] === "" && mdLines[3] === "```", "Markdown: blank line, then ONE fenced block");
  assert(md.includes("```\n" + q3[0].raw + "\n··· 8 lines · +9s ···\n" + q3[1].raw + "\n" + q3[2].raw + "\n```"),
    "Markdown: the quoted raw lines in one block with a gap line where the file jumps (message 1 -> message 10)");
  assert(md.endsWith("\n```") && !md.includes("not quoted"), "Markdown: a First-N pick is what was asked for, nothing to announce (only budget cuts are)");
  assert(!md.includes("Log findings") && !md.includes("Bookmarks & notes") && !md.includes("Exported with PhiLogg") && !md.includes("Matched:"),
    "Markdown: no old title, findings list, footer or Matched line");

  const jira = w.buildTicketSnippet(ctx, "jira", first3);
  assert(jira.startsWith("*app.log* (50 entries)") && jira.includes("\n*Filter:* Text contains") && jira.includes("\\[case-sensitive, in Message\\]"),
    "Jira wiki: *bold* header, brackets escaped (they'd become links)");
  assert(jira.includes("{noformat}\n" + q3[0].raw + "\n··· 8 lines") && !jira.includes("```") && !jira.includes("**"), "Jira wiki: {noformat} block, no Markdown");

  const plain = w.buildTicketSnippet(ctx, "plain", first3);
  assert(plain.startsWith("app.log (50 entries) · ") && !plain.includes("**") && !plain.includes("{noformat}") && !plain.includes("`"),
    "plain: no markup at all");
  assert(plain.includes("\n    " + q3[0].raw + "\n    ··· 8 lines · +9s ···\n    " + q3[1].raw), "plain: block lines incl. the gap line indented by four spaces");
  assert(plain.includes("[case-sensitive, in Message]"), "plain: no escaping");

  const none = w.buildTicketSnippet(ctx, "markdown", { mode: "first", n: 0 });
  assert(!none.includes("```") && none.endsWith("(no lines selected — nothing quoted)"), "no entries picked -> header + a plain 'nothing quoted' line, no code block");
  const all = w.buildTicketSnippet(ctx, "markdown", { mode: "all" });
  assert(all.includes(expected[10].raw) && !all.includes("more entries not quoted"), "quoting every entry of the view announces no cut");

  section("281c. Bounds and escaping");
  // Code fence grows past the longest backtick run in the quoted lines; a
  // markup-looking filter value is escaped outside the code block.
  const g = await w.addFile("ticks.log", makeLog(0, 3, { msgPrefix: "has ```` ticks *bold* _it_" }), () => {});
  const tf = w.createFilterNode(g.id, "text", "*bold*");
  T.state.activeId = tf.id;
  const tctx = w.collectExportContext();
  const tmd = w.buildTicketSnippet(tctx, "markdown", { mode: "first", n: 5 });
  assert(tmd.includes("\n`````\n") && !tmd.includes("\n```\n"), "Markdown fence is longer than the longest backtick run inside");
  assert(tmd.includes("Text contains: “\\*bold\\*”"), "filter value markup is escaped in the header's filter line");
  const tj = w.buildTicketSnippet(tctx, "jira", { mode: "first", n: 5 });
  assert(tj.includes("Text contains: “\\*bold\\*”"), "Jira: filter value markup escaped");

  // Per-entry cap + total cap: huge lines never blow the ticket limit.
  const huge = "x".repeat(5000);
  const h = await w.addFile("huge.log", makeLog(0, 200, { suffix: () => huge }), () => {});
  T.state.activeId = h.id;
  const hctx = w.collectExportContext();
  const hmd = w.buildTicketSnippet(hctx, "markdown", { mode: "all" });
  assert(hmd.length <= w.eval("TICKET_SNIPPET_MAX_CHARS"), "the snippet stays within TICKET_SNIPPET_MAX_CHARS, got " + hmd.length);
  assert(hmd.includes(" …[truncated]") && !hmd.includes(huge), "an over-long entry is cut at TICKET_ENTRY_MAX_CHARS and marked");
  const m = hmd.match(/… (\d+) more entries not quoted — see the attached export\./);
  assert(m && 200 - Number(m[1]) > 5 && Number(m[1]) < 200, "the total budget stops the quote early and says how many were left out, got " + (m && m[1]));
});
