// GROUP 328 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* GROUP 328 — Find bar: cross-file hit counts (FEATURE_BACKLOG #30)
   With the find bar open, a valid query and 2+ loaded files, every file root
   row shows a .tree-hit-badge with the WHOLE file's match count (same test as
   the bar's own counter); clicking it jumps to that file's first hit.
   Data: log-sim "basic" scenario, two seeds. */
group(328);
await withApp(async (w, d, T) => {
  const gen = seed => LOGSIM.generateToStrings({ format: "default", scenarios: ["basic"], entries: 400, seed })[0];
  const A = gen(21), B = gen(22);
  const cnt = (text, pred) => text.split("\n").filter(Boolean).filter(pred).length;
  const ci = word => text => cnt(text, l => l.toLowerCase().includes(word.toLowerCase()));
  const cs = word => text => cnt(text, l => l.includes(word));
  const fa = await w.addFile("a.log", A.text, () => {});
  const fb = await w.addFile("b.log", B.text, () => {});
  const fbs = d.createElement("script");
  fbs.textContent = "window.__find = { get state() { return findState; } };";
  d.body.appendChild(fbs);
  const bar = d.getElementById("findBar"), input = d.getElementById("findInput"), count = d.getElementById("findCount");
  const badge = id => d.querySelector('#tree .tree-row[data-node-id="' + id + '"] > .tree-hit-badge');
  const allBadges = () => d.querySelectorAll("#tree .tree-hit-badge").length;
  const type = async q => { input.value = q; fireInput(input, w); await sleep(250); };
  const settle = async () => { for (let i = 0; i < 40; i++) { await sleep(20); if ([fa, fb].every(f => { const b = badge(f.id); return !b || !b.classList.contains("pending"); })) break; } };
  T.state.activeId = fa.id;
  w.render();

  section("328a. Badges on every file root, whole-file counts (even under a narrowing filter)");
  fireKeydown(d, w, "f", { ctrlKey: true });
  await type("heartbeat");
  await settle();
  assert(badge(fa.id) && badge(fb.id), "both file roots show a badge");
  assert(badge(fa.id).textContent === String(ci("heartbeat")(A.text)) && badge(fb.id).textContent === String(ci("heartbeat")(B.text)),
    "counts are the whole files' matches: " + badge(fa.id).textContent + "/" + badge(fb.id).textContent);
  assert(badge(fa.id).nextElementSibling.classList.contains("tree-count"), "the badge sits directly before .tree-count");
  assert(/matches for "heartbeat" in the whole file/.test(badge(fa.id).title), "title text, got " + badge(fa.id).title);
  assert(count.title === "a.log: " + ci("heartbeat")(A.text) + "\nb.log: " + ci("heartbeat")(B.text), "#findCount title lists per-file counts, got " + JSON.stringify(count.title));
  const nodes0 = Object.keys(T.state.nodes).length;
  const warn = w.createFilterNode(fa.id, "text", "WARN");
  T.state.activeId = warn.id;
  w.render();
  await settle();
  assert(count.textContent !== "" && badge(fa.id).textContent === String(ci("heartbeat")(A.text)),
    "with a narrowing filter active, the file badge still counts the whole file");
  assert(Object.keys(T.state.nodes).length === nodes0 + 1, "the find created no node (only the test's own filter)");

  section("328b. Aa changes counts; 0 is dimmed; no badge cases");
  fireClick(d.getElementById("findCaseBtn"), w);
  await settle();
  input.value = "HEARTBEAT"; fireInput(input, w); await sleep(250); await settle();
  assert(badge(fa.id).classList.contains("zero") && badge(fa.id).textContent === "0" && /No matches for "HEARTBEAT" in this file/.test(badge(fa.id).title),
    "case-sensitive 'HEARTBEAT': 0, class zero");
  input.value = "Heartbeat"; fireInput(input, w); await sleep(250); await settle();
  assert(badge(fa.id).textContent === String(cs("Heartbeat")(A.text)) && !badge(fa.id).classList.contains("zero"), "Aa on: 'Heartbeat' matches exactly the capitalized lines");
  fireClick(d.getElementById("findCaseBtn"), w);
  await settle();
  input.value = "("; fireInput(input, w); await sleep(250);
  fireClick(d.getElementById("findRegexBtn"), w);
  await sleep(50);
  assert(allBadges() === 0 && !count.hasAttribute("title"), "invalid regex: no badges, no counter title");
  fireClick(d.getElementById("findRegexBtn"), w);
  input.value = ""; fireInput(input, w); await sleep(250);
  assert(allBadges() === 0, "empty query: no badges");

  section("328c. Click a badge: activates that file and selects its first hit");
  input.value = "retry"; fireInput(input, w); await sleep(250); await settle();
  T.state.activeId = fa.id; w.render(); await settle();
  const b0 = badge(fb.id);
  assert(b0 && !b0.classList.contains("zero"), "file b has hits for 'retry'");
  fireClick(b0, w);
  await sleep(60);
  assert(T.state.activeId === fb.id, "the click activated file b");
  const firstHit = fb.entries.find(e => /retry/i.test(e.message || "")) ;
  assert(firstHit && T.state.selectedId === firstHit.id, "…and selected its first hit");
  assert(/^1 \/ /.test(count.textContent), "counter reads 1 / m, got " + count.textContent);
  fireClick(badge(fb.id), w); // active file: no re-activation, jumps to the first hit again
  assert(T.state.selectedId === firstHit.id, "badge click on the active file selects the first hit");
  T.state.activeId = fa.id; w.render(); await settle();
  const row = d.querySelector('#tree .tree-row[data-node-id="' + fb.id + '"]');
  fireClick(row.querySelector(".tree-label"), w);
  await sleep(60);
  assert(T.state.activeId === fb.id && T.state.selectedId === firstHit.id, "a click on the file row itself also lands on the first hit");

  section("328c2. A temp-anchor row (selection from another file) is never counted as a hit");
  // Selection is on a 'retry' hit in file b; switching to file a splices it into a's view.
  assert(T.state.activeId === fb.id && /retry/i.test(fb.entries.find(e => e.id === T.state.selectedId).message || ""), "sanity: selection is a matching hit of file b");
  const aBadgeN = Number(badge(fa.id).textContent);
  fireClick(badge(fa.id), w);
  await sleep(60);
  // The badge click selects a's first hit, which (correctly) drops b's anchor;
  // re-create the foreign selection: select b's hit again, then switch to a.
  w.selectEntry(firstHit.id);
  w.applyTempAnchorOnActiveNodeSwitch(fa.id);
  w.render();
  w.findRefresh();
  await sleep(60);
  assert(T.state.activeId === fa.id && T.currentViewEntries.some(e => e._tempAnchor), "sanity: b's selected entry is spliced into a's view as a temp anchor");
  assert(count.textContent === aBadgeN + " matches" || count.textContent === "1 / " + aBadgeN, "counter total equals a's badge count (" + aBadgeN + "), got " + count.textContent);
  assert(!T.currentViewEntries.some((e, i) => e._tempAnchor && w.__find.state.hits.includes(i)), "no hit index points at the _tempAnchor row");
  // Same file: a matching anchor row (excluded by the active filter) isn't counted either.
  const inA = fa.entries.find(e => /retry/i.test(e.message || ""));
  const narrow = w.createFilterNode(fa.id, "text", "Queue depth");
  w.render();
  w.selectEntry(inA.id);
  fireClick(d.querySelector('#tree .tree-row[data-node-id="' + narrow.id + '"]'), w);
  await sleep(60);
  assert(T.currentViewEntries.some(e => e._tempAnchor && e.id === inA.id), "sanity: the matching entry is spliced in as a temp anchor");
  assert(w.__find.state.hits.length === 0 && count.textContent === "No results", "the anchor row is not counted, got " + count.textContent);
  w.deleteFilterNodeWithUndo(narrow.id);
  T.state.activeId = fa.id; w.render(); await settle();

  section("328d. renderTree keeps badges; tail append updates; closing a file removes; single file: none");
  w.renderTree();
  assert(badge(fa.id) && badge(fb.id), "renderTree() keeps the badges");
  const before = Number(badge(fa.id).textContent);
  fa.tail = { pending: "" };
  const extra = LOGSIM.generateToStrings({ format: "default", scenarios: ["basic"], entries: 100, seed: 23 })[0].text;
  const oldLen = fa.entries.length;
  w.appendTailText(fa, extra);
  delete fa.tail; // only borrowed for appendTailText; no real tail to poll
  w.render();
  await settle();
  await sleep(50);
  assert(fa.entries.length > oldLen && Number(badge(fa.id).textContent) === before + cnt(extra, l => l.toLowerCase().includes("retry")),
    "a tail append counts the new tail, got " + badge(fa.id).textContent);
  w.deleteFilterNodeWithUndo(fb.id);
  w.render();
  await sleep(50);
  assert(allBadges() === 0, "one file left: no badge at all");
  assert(!count.hasAttribute("title"), "…and no counter title");

  section("328e. Closing the bar removes badges");
  await w.addFile("c.log", gen(24).text, () => {});
  w.render(); await settle();
  assert(allBadges() === 2, "two files again: badges back");
  fireKeydown(d, w, "Escape");
  assert(!isVisible(bar, w) && allBadges() === 0, "Esc closes the bar and drops every badge");
});
