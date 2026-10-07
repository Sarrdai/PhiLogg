// GROUP explain-row — loaded by philogg.regression.test.js (tests/README.md →
// "Group files").

/* ============================================================
   GROUP explain-row — "Why is this row here?" (FEATURE_BACKLOG #15), engine
   Origin: 2026-10-07. explainEntry(entryId, activeId) explains one entry
   against the active filter chain: per node kept / rejected / skipped /
   muted with a reason line, the first rejecting node, and the view filters
   (level bar, pinned bookmarks). Data: log-sim "basic" + "motion".
   ============================================================ */
group("explain-row");
await withApp(async (w, d, T) => {
  const [file] = LOGSIM.generateToStrings({ format: "default", scenarios: ["basic", "motion"], entries: 1500, seed: 11 });
  const f = await w.addFile(file.name, file.text, () => {});
  const entries = T.state.nodes[f.id].entries;
  const byThread = (th, pred) => entries.find(e => e.thread === th && (!pred || pred(e)));
  const isMove = e => e.message.includes("Move requested");

  // Chain: OR(level WARN,ERROR | text "Move requested") -> NOT text "axis-3" -> text "axis-1" on Thread
  const lvl = w.createFilterNode(f.id, "level", ["WARN", "ERROR"]);
  const mv = w.createFilterNode(f.id, "text", "Move requested");
  const orN = w.createAndOrNode([lvl.id, mv.id], "or");
  const notA3 = w.createFilterNode(orN.id, "text", "axis-3", true);
  const last = w.createFilterNode(notA3.id, "text", "axis-1", false, null, false, ["thread"]);
  T.state.activeId = last.id;

  section("explain-row a. A match: every node kept, OR sub-lines show which side matched");
  const hit = byThread("axis-1", isMove);
  let r = w.explainEntry(hit.id, last.id);
  assert(r.match === true && r.rejectIndex === -1 && r.total === 3 && r.steps.length === 3, "match over 3 nodes, got " + JSON.stringify([r.match, r.total, r.rejectIndex]));
  assert(r.steps.every(s => s.status === "kept"), "all kept: " + r.steps.map(s => s.status));
  assert(r.head === "✓ In the result of " + last.name + " · kept by all 3 nodes", "head: " + r.head);
  assert(r.steps[0].nodeId === orN.id && r.steps[2].nodeId === last.id, "steps run top (first under the file) to the active node");
  assert(r.steps[0].reason === "1 of 2 matched (OR)", "OR reason: " + r.steps[0].reason);
  assert(r.steps[0].subs.length === 2 && r.steps[0].subs[0].ok === false && r.steps[0].subs[1].ok === true, "OR subs: level no, text yes");
  assert(r.steps[0].subs[0].reason === "Level INFO is not in WARN, ERROR", "level sub: " + r.steps[0].subs[0].reason);
  assert(r.steps[0].subs[1].reason === '"Move requested" found', "text sub: " + r.steps[0].subs[1].reason);
  assert(r.steps[1].reason === '"axis-3" not found → kept', "inverted: " + r.steps[1].reason);
  assert(r.steps[1].name.startsWith("¬ "), "inverted node named with ¬ like the tree: " + r.steps[1].name);
  assert(r.steps[2].reason === '"axis-1" found in Thread', "column named: " + r.steps[2].reason);
  assert(r.view === null && r.note === "", "no view step, no note");
  const ids = new Set(T.state.nodes[last.id]._cache.map(e => e.id));
  assert(ids.has(hit.id), "consistent with the node result");

  section("explain-row b. Rejected at the OR, at the inverted node, at the last node");
  const tick = entries.find(e => e.level === "DEBUG");
  r = w.explainEntry(tick.id, last.id);
  assert(r.match === false && r.rejectIndex === 0, "DEBUG tick rejected at step 1, got " + r.rejectIndex);
  assert(r.steps.map(s => s.status).join() === "rejected,skipped,skipped", "statuses: " + r.steps.map(s => s.status));
  assert(r.steps[0].reason === "0 of 2 matched (OR)" && r.steps[0].subs.every(s => !s.ok), "OR reason: " + r.steps[0].reason);
  assert(r.head === "✗ Not in the result · rejected by " + orN.name + " (step 1 of 3)", "head: " + r.head);
  assert(r.steps[1].reason === "" && r.steps[2].reason === "", "skipped steps carry no reason");

  const a3 = byThread("axis-3", isMove);
  r = w.explainEntry(a3.id, last.id);
  assert(r.rejectIndex === 1 && r.steps.map(s => s.status).join() === "kept,rejected,skipped", "rejected at the inverted node: " + r.steps.map(s => s.status));
  assert(r.steps[1].reason === '"axis-3" found → excluded', "inverted reason: " + r.steps[1].reason);
  assert(r.head.endsWith("rejected by ¬ " + w.nodeDisplayName(notA3) + " (step 2 of 3)"), "head: " + r.head);

  const a2 = byThread("axis-2", isMove);
  r = w.explainEntry(a2.id, last.id);
  assert(r.rejectIndex === 2 && r.steps.map(s => s.status).join() === "kept,kept,rejected", "rejected at the last node: " + r.steps.map(s => s.status));
  assert(r.steps[2].reason === '"axis-1" not found in Thread', "last reason: " + r.steps[2].reason);

  section("explain-row c. Muted node: badge, 'passes everything', chain result agrees");
  w.toggleMuteWithUndo([last.id], true);
  r = w.explainEntry(a2.id, last.id);
  assert(r.match === true && r.steps[2].status === "muted" && r.steps[2].reason === "Muted — passes everything", "muted last node: " + JSON.stringify(r.steps[2]));
  w.toggleMuteWithUndo([last.id], false);
  assert(w.explainEntry(a2.id, last.id).match === false, "unmuted again: rejected");
  w.toggleMuteWithUndo([notA3.id], true);
  r = w.explainEntry(a3.id, last.id);
  assert(r.steps[1].status === "muted" && r.rejectIndex === 2, "muted middle node passes, rejected one later, got " + r.steps.map(s => s.status));
  w.toggleMuteWithUndo([notA3.id], false);

  section("explain-row d. View filters: level bar and pinned bookmarks");
  r = w.explainEntry(hit.id, last.id);
  T.state.levelFilter.add("ERROR");
  r = w.explainEntry(hit.id, last.id);
  assert(r.match === true && r.view && r.view.kind === "level" && r.view.text === "Hidden by the level bar (INFO off)", "level view: " + JSON.stringify(r.view));
  assert(r.head.startsWith("✓"), "the node result itself still matches");
  T.state.levelFilter.clear();
  T.state.bookmarks.set(a2.id, { bookmarkedAt: 1 });
  assert(w.explainEntry(a2.id, last.id).view === null, "bookmarked but Pin bookmarks off: no pinned note");
  T.state.pinBookmarksInFilteredView = true;
  r = w.explainEntry(a2.id, last.id);
  assert(r.match === false && r.view && r.view.kind === "pinned" && r.view.text === "Shown because it is bookmarked and Pin bookmarks is on", "pinned view: " + JSON.stringify(r.view));
  assert(r.head.startsWith("✗"), "head still says not in the result");
  T.state.pinBookmarksInFilteredView = false;
  T.state.bookmarks.clear();

  section("explain-row e. Link node: both ends kept, unpaired start rejected, partner info");
  const mvText = w.createFilterNode(f.id, "text", "Move requested");
  const rcText = w.createFilterNode(f.id, "text", "Position reached");
  const link = w.createLinkNode(mvText.id, rcText.id, "after", 1, { key: { pattern: "job=[*:word]" } });
  T.state.activeId = link.id;
  const pairs = w.getEntries(link.id);
  assert(pairs.length > 5 && pairs[0].isPair, "link produced pairs, got " + pairs.length);
  const pr = pairs[0];
  const startId = (pr.first.message.includes("Move requested") ? pr.first : pr.second).id;
  const endId = (pr.first.message.includes("Move requested") ? pr.second : pr.first).id;
  [startId, endId].forEach(id => {
    const x = w.explainEntry(id, link.id);
    assert(x.match === true && x.steps.length === 1 && x.steps[0].status === "kept", "pair end kept: " + id);
    assert(x.steps[0].reason.startsWith("Part of a pair with ") && x.steps[0].reason.includes("Δt "), "partner info: " + x.steps[0].reason);
  });
  const paired = new Set(); pairs.forEach(p => w.getTupleEntries(p).forEach(e => paired.add(e.id)));
  const lonely = entries.find(e => isMove(e) && !paired.has(e.id));
  assert(lonely, "the simulator leaves an aborted move without end");
  r = w.explainEntry(lonely.id, link.id);
  assert(r.match === false && r.rejectIndex === 0 && r.steps[0].reason === "No partner found", "unpaired start: " + JSON.stringify(r.steps[0]));
  const plain = entries.find(e => e.level === "DEBUG");
  assert(w.explainEntry(plain.id, link.id).match === false, "an entry that is neither side is not in the link result");

  section("explain-row f. Context and count-context nodes");
  const base = w.createFilterNode(f.id, "text", "Move requested");
  const cc = w.createCountContextNode(base.id, 1, 1);
  T.state.activeId = cc.id;
  const baseIds = new Set(w.getEntries(base.id).map(e => e.id));
  const inCc = new Set(w.getEntries(cc.id).map(e => e.id));
  const neighbour = entries.find(e => inCc.has(e.id) && !baseIds.has(e.id));
  assert(neighbour, "count context adds neighbours");
  r = w.explainEntry(neighbour.id, cc.id);
  assert(r.match === true && r.steps.length === 2, "neighbour matches via context");
  assert(r.steps[1].reason === "Within the window around a reference entry" && r.steps[1].status === "kept", "context reason: " + r.steps[1].reason);
  assert(r.steps[0].status === "kept" && r.steps[0].reason.includes("brought back by a later context node"), "earlier node does not claim to keep it: " + r.steps[0].reason);
  const far = entries.find(e => !inCc.has(e.id));
  r = w.explainEntry(far.id, cc.id);
  assert(r.match === false && r.rejectIndex === 0 && r.steps[1].status === "skipped", "outside: rejected by the text node, context not reached");
  const ctxN = w.createContextNode(base.id, 1000, 1000);
  T.state.activeId = ctxN.id;
  const inCtx = new Set(w.getEntries(ctxN.id).map(e => e.id));
  const near = entries.find(e => inCtx.has(e.id) && !baseIds.has(e.id));
  assert(near && w.explainEntry(near.id, ctxN.id).steps[1].reason === "Within the window around a reference entry", "time context: within window");
  // a base-matching entry that is itself a reference
  assert(w.explainEntry(w.getEntries(base.id)[0].id, ctxN.id).steps[1].reason === "Within the window around a reference entry", "reference entry is inside its own window");

  section("explain-row g. Edge cases: no selection, file active, regex, nested baked");
  r = w.explainEntry(null, last.id);
  assert(r.note === "Select a row to see which filters keep or reject it." && r.steps.length === 0, "no selection note");
  r = w.explainEntry(hit.id, f.id);
  assert(r.match === true && r.steps.length === 0 && r.note === "No filter is active — every entry of the file is shown.", "file active: " + r.note);
  const rx = w.createFilterNode(f.id, "text", "Move req.*axis=[13]", false, null, false, null, true);
  const rxHit = entries.find(e => /Move req.*axis=[13]/.test(e.raw));
  r = w.explainEntry(rxHit.id, rx.id);
  assert(r.steps[0].reason === "/Move req.*axis=[13]/ found", "regex reason: " + r.steps[0].reason);
  const andN = w.createAndOrNode([mvText.id, w.createFilterNode(f.id, "text", "axis=2").id], "and");
  const a2move = entries.find(e => /Move requested axis=2/.test(e.raw));
  r = w.explainEntry(a2move.id, andN.id);
  assert(r.match && r.steps[0].reason === "2 of 2 matched (AND)", "AND reason: " + r.steps[0].reason);
  r = w.explainEntry(a3.id, andN.id);
  assert(!r.match && r.steps[0].reason === "1 of 2 matched (AND)" && r.steps[0].subs[1].ok === false, "AND rejected: " + r.steps[0].reason);
});

// ---- UI: the Why tab, the context menu entry, the phone sheet ----
const erSetWidth = (w, px) => { w.innerWidth = px; w.dispatchEvent(new w.Event("resize")); };
await withApp(async (w, d, T) => {
  const [file] = LOGSIM.generateToStrings({ format: "default", scenarios: ["basic", "motion"], entries: 600, seed: 11 });
  const f = await w.addFile(file.name, file.text, () => {});
  const entries = T.state.nodes[f.id].entries;
  const mv = w.createFilterNode(f.id, "text", "Move requested");
  const ax1 = w.createFilterNode(mv.id, "text", "axis-1", false, null, false, ["thread"]);
  T.state.activeId = ax1.id;
  erSetWidth(w, 1440);
  w.render();
  const panel = d.getElementById("detailPanel"), body = d.getElementById("whyPanelBody"), tab = d.getElementById("lowerTabWhy");
  const kept = entries.filter(e => e.thread === "axis-1" && e.message.includes("Move requested"));
  const other = entries.find(e => e.thread === "axis-2" && e.message.includes("Move requested"));
  const sel = id => w.selectEntry(id);

  section("explain-row h. Tab: placement, selection, persisted, follows the selection without render()");
  assert(tab && tab.textContent === "Why" && tab.title === "Why is this row here? — which filter node keeps or rejects the selected entry", "tab label and title");
  assert(tab.previousElementSibling === d.getElementById("lowerTabDetail"), "placed right after Entry detail");
  sel(kept[0].id);
  fireClick(tab, w);
  assert(panel.classList.contains("lower-why") && tab.getAttribute("aria-selected") === "true", "panel switches to the Why tab");
  assert(w.localStorage.getItem("philogg-lower-tab") === "why", "persisted under philogg-lower-tab");
  assert(d.getElementById("lowerTabDetail").getAttribute("aria-selected") === "false", "Entry detail deselected");
  assert(isVisible(body, w) && !isVisible(d.getElementById("detailBody"), w), "Why body visible, entry body hidden");
  assert(body.querySelector(".why-head.why-match").textContent === "✓ In the result of " + ax1.name + " · kept by all 2 nodes", "head: " + body.querySelector(".why-head").textContent);
  const steps = [...body.querySelectorAll(".why-step")];
  assert(steps.length === 2 && steps.every(s => s.classList.contains("why-kept")), "two kept steps");
  assert(steps[1].querySelector(".why-reason").textContent === '"axis-1" found in Thread' && steps[1].querySelector(".why-badge").textContent === "kept", "reason and badge");

  let renders = 0;
  const realRender = w.render, realTree = w.renderTree;
  w.render = (...a) => { renders++; return realRender(...a); };
  w.renderTree = (...a) => { renders++; return realTree(...a); };
  try {
    sel(other.id);
    assert(renders === 0, "following the selection never calls render()/renderTree(), got " + renders);
  } finally { w.render = realRender; w.renderTree = realTree; }
  // other is in no result of ax1 but still selectable via entryIndex: the tab follows
  assert(body.querySelector(".why-head.why-reject").textContent === "✗ Not in the result · rejected by " + ax1.name + " (step 2 of 2)", "rejected head: " + body.querySelector(".why-head").textContent);
  const rs = [...body.querySelectorAll(".why-step")];
  assert(rs[0].classList.contains("why-kept") && rs[1].classList.contains("why-rejected") && rs[1].querySelector(".why-badge").textContent === "rejected", "second step rejected");
  w.selectEntry(null);
  assert(body.querySelector(".why-note").textContent === "Select a row to see which filters keep or reject it.", "no selection note");
  sel(kept[0].id);

  section("explain-row i. Node names activate the node, the selection stays; muted/skipped/view/subs render");
  const btn0 = body.querySelector('.why-step[data-node-id="' + mv.id + '"] .why-node');
  assert(btn0 && btn0.tagName === "BUTTON" && btn0.textContent === mv.name, "node name is a button");
  fireClick(btn0, w);
  assert(T.state.activeId === mv.id && T.state.selectedId === kept[0].id, "node activated, entry still selected");
  assert(panel.classList.contains("lower-why") && body.querySelectorAll(".why-step").length === 1, "tab now explains against the new active node");
  T.state.activeId = ax1.id; w.render();
  sel(other.id);
  assert([...body.querySelectorAll(".why-step")].map(s => s.querySelector(".why-badge").textContent).join() === "kept,rejected", "badges");
  const orN = w.createAndOrNode([mv.id, w.createFilterNode(f.id, "text", "Heartbeat").id], "or");
  const after = w.createFilterNode(orN.id, "text", "zzzz-never");
  T.state.activeId = after.id; w.render();
  sel(kept[0].id);
  const st = [...body.querySelectorAll(".why-step")];
  assert(st.map(s => s.querySelector(".why-badge").textContent).join() === "kept,rejected", "OR kept, last rejected");
  assert(body.querySelectorAll(".why-subs li").length === 2 && body.querySelector(".why-sub-ok") && body.querySelector(".why-sub-no") && body.querySelector(".why-subs").textContent.includes("✓"), "OR sub-lines with check marks");
  assert(![...body.querySelectorAll(".why-subs li")].some(li => li.textContent.includes(" — ")), "sub-lines don't repeat a name their reason already quotes: " + body.querySelector(".why-subs").textContent);
  w.toggleMuteWithUndo([after.id], true);
  w.render();
  assert(body.querySelector(".why-step.why-muted .why-badge").textContent === "muted", "muted badge");
  w.toggleMuteWithUndo([after.id], false);
  T.state.levelFilter.add("ERROR");
  T.state.activeId = ax1.id; w.render();
  assert(body.querySelector(".why-view").textContent === "Hidden by the level bar (INFO off)", "view step: " + (body.querySelector(".why-view") || {}).textContent);
  T.state.levelFilter.clear();
  w.render();

  section("explain-row j. Context menu: entry after 'Pair with…', selects the row and opens the tab (expands a collapsed panel)");
  w.setLowerTab("detail");
  w.toggleDetailCollapsed(true);
  assert(panel.classList.contains("collapsed"), "panel collapsed");
  const ev = new w.MouseEvent("contextmenu", { clientX: 40, clientY: 40, bubbles: true });
  w.openContextMenu(ev, kept[1]);
  const item = d.getElementById("ctxWhyRow");
  assert(isVisible(item, w) && item.textContent.trim() === "Why is this row here?", "menu item shown");
  assert(item.previousElementSibling === d.getElementById("ctxPairWith"), "right after 'Pair with…'");
  fireClick(item, w);
  assert(d.getElementById("contextMenu").classList.contains("hidden"), "menu closes");
  assert(T.state.selectedId === kept[1].id, "row selected");
  assert(w.localStorage.getItem("philogg-lower-tab") === "why" && panel.classList.contains("lower-why") && !panel.classList.contains("collapsed"), "Why tab open, panel expanded");
  assert(body.querySelector(".why-head") && body.querySelector(".why-head").textContent.startsWith("✓"), "explains the clicked row");
  w.openContextMenu(ev, { isPair: true, id: "pair:x:y", ts: 1, message: "x" });
  assert(!isVisible(item, w), "hidden for a link-view pair");
  w.closeContextMenu();

  section("explain-row k. Phone: sheet tab 'Why' beside Entry, enabled only with a selection");
  w.setLowerTab("detail");
  T.state.activeId = ax1.id;
  erSetWidth(w, 390);
  w.render();
  assert(d.body.classList.contains("layout-phone"), "phone tier");
  w.selectEntry(null);
  assert(tab.disabled, "Why is disabled without a selection");
  fireClick(tab, w);
  assert(!d.body.classList.contains("sheet-open"), "no selection: the Why tab does nothing");
  const card = d.querySelector('#tableRows .log-row[data-entry-id="' + kept[0].id + '"]');
  assert(card, "card rendered");
  card.click();
  assert(d.body.classList.contains("sheet-open") && !tab.disabled, "card tap opens the sheet, Why enabled");
  assert(tab.previousElementSibling === d.getElementById("lowerTabDetail"), "beside Entry");
  fireClick(tab, w);
  assert(panel.classList.contains("lower-why") && tab.getAttribute("aria-selected") === "true" && isVisible(body, w), "sheet shows the Why tab");
  assert(w.localStorage.getItem("philogg-lower-tab") !== "why", "phone tab not persisted");
  assert(body.querySelector(".why-head").textContent.startsWith("✓"), "explanation rendered");
  sel(other.id);
  assert(body.querySelector(".why-head").textContent.startsWith("✗"), "follows the selection on the phone");
  fireClick(d.getElementById("lowerTabDetail"), w);
  assert(!panel.classList.contains("lower-why") && panel.classList.contains("lower-facets") === false, "Entry tab leaves Why");
});
