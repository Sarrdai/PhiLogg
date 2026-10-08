// GROUP 220 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 220 — Files & Filters sidebar toolbar (FEATURE_BACKLOG.md #77)
   Origin: #77 (rewritten 2026-09-28 for the static toolbar). #sidebarToolbar
   uses the same flat icon+hover-label buttons as the per-view toolbars
   (buildRowActionsHtml, "rect" shape / setupHitExpandGroups) but its button
   SET is fixed: Rename… | Edit filter… | Invert (NOT) · Adjust clock… ·
   Add to library…. describeSidebarToolbarActions() returns that list with a
   `disabled` flag per button (never omitted); renderSidebarToolbar() builds
   the DOM once and only toggles disabled/label afterwards.
   handleSidebarToolbarActionClick(action) dispatches to the pre-existing
   function/dialog each action already had (zero duplicated business logic).
   With 2+ nodes selected the row is not rendered at all: multi mode shows
   the bulk actions instead (GROUP 319d/e). "Apply from
   library…" left this toolbar (it stays on the tree context menu, GROUP 79
   /194). The retired dynamic-toolbar shape is in the git history.
   ============================================================ */
group(220);

const SB_FIXED = "rename,edit,linkWith,invert,mute,clockOffset,addToLibrary";
const sbState = actions => actions.filter(a => !a.group).map(a => a.action + (a.disabled ? ":off" : ":on")).join(",");

await withApp(async (w, d, T) => {
  section("220a. describeSidebarToolbarActions: nothing selected -> the seven fixed buttons, all disabled");
  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  T.state.multiSelect = new Set();
  T.state.activeId = null; // the active node is always selected, so "nothing selected" means no active node either
  let { actions, note } = w.describeSidebarToolbarActions();
  assert(actions.map(a => a.action).join(",") === SB_FIXED, "fixed set/order, got " + actions.map(a => a.action).join(","));
  assert(actions.every(a => a.disabled === true), "nothing selected: every button disabled (not hidden), got " + sbState(actions));
  assert(!note, "no explanatory note");
  assert(!actions.some(a => a.action === "applyFromLibrary"), "Apply from library… is no longer on the toolbar");
  const caps = actions.map(a => a.caption).join(",");
  assert(caps === "Edit,Edit,Edit,Effect,Effect,Effect,Library", "toolbar groups (captions): Edit | Effect | Library, got " + caps);
});

await withApp(async (w, d, T) => {
  section("220b. 1 file selected: only Adjust clock… enabled; disabled for a merged or an empty file");
  const fa = await w.addFile("a.log", makeLog(0, 5), () => {});
  const fb = await w.addFile("b.log", makeLog(10, 5), () => {});
  T.state.multiSelect = new Set([fa.id]);
  T.state.activeId = fa.id;
  let { actions } = w.describeSidebarToolbarActions();
  assert(sbState(actions) === "rename:off,edit:off,linkWith:off,invert:off,mute:off,clockOffset:on,addToLibrary:off", "got " + sbState(actions));
  assert(actions.find(a => a.action === "clockOffset").target === fa.id, "Adjust clock… targets the selected file");

  const merged = await w.mergeFiles([fa.id, fb.id]);
  T.state.multiSelect = new Set([merged.id]);
  T.state.activeId = merged.id;
  ({ actions } = w.describeSidebarToolbarActions());
  assert(actions.every(a => a.disabled), "a merged file has no clock of its own: everything disabled (buttons stay), got " + sbState(actions));
  assert(actions.length === 7, "...and the button set is unchanged");

  const emptyFileId = "syntheticEmptyFile";
  T.state.nodes[emptyFileId] = { id: emptyFileId, type: "file", merged: false, entries: [], children: [] };
  T.state.multiSelect = new Set([emptyFileId]);
  T.state.activeId = emptyFileId;
  ({ actions } = w.describeSidebarToolbarActions());
  assert(actions.find(a => a.action === "clockOffset").disabled === true, "an empty file (zero entries) disables Adjust clock…");
});

await withApp(async (w, d, T) => {
  section("220c. 2+ files selected: describeSidebarToolbarActions reports the seven fixed buttons all disabled (Merge lives in multi mode)");
  const fa = await w.addFile("a.log", makeLog(0, 5), () => {});
  const fb = await w.addFile("b.log", makeLog(10, 5), () => {});
  T.state.multiSelect = new Set([fa.id, fb.id]);
  T.state.activeId = fa.id;
  const { actions } = w.describeSidebarToolbarActions();
  assert(actions.length === 7 && actions.every(a => a.disabled), "all seven buttons disabled for 2+ selected");
  assert(!actions.some(a => a.action === "merge" || a.action === "and" || a.action === "or" || a.action === "link"), "no bulk action on the toolbar");
});

await withApp(async (w, d, T) => {
  section("220d. 1 unlocked filter: enable matrix per filter type (text / and-or / link)");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  const t1 = w.createFilterNode(f.id, "text", "message 1");
  const t2 = w.createFilterNode(f.id, "text", "message 2");
  const pick = id => { T.state.multiSelect = new Set([id]); T.state.activeId = id; return w.describeSidebarToolbarActions().actions; };
  let actions = pick(t1.id);
  assert(sbState(actions) === "rename:on,edit:on,linkWith:on,invert:on,mute:on,clockOffset:off,addToLibrary:on", "text filter, got " + sbState(actions));
  assert(actions.filter(a => a.target !== t1.id).length === 0, "every action targets the selected filter");

  const andNode = w.createAndOrNode([t1.id, t2.id], "and");
  actions = pick(andNode.id);
  assert(sbState(actions) === "rename:on,edit:on,linkWith:on,invert:on,mute:on,clockOffset:off,addToLibrary:on", "AND node: Edit conditions enabled, got " + sbState(actions));

  const f2 = await w.addFile("b.log", makeLog(0, 20), () => {});
  const l1 = w.createFilterNode(f2.id, "text", "message 1");
  const l2 = w.createFilterNode(f2.id, "text", "message 2");
  const linkNode = w.createLinkNode(l1.id, l2.id, "after", 1);
  actions = pick(linkNode.id);
  assert(sbState(actions) === "rename:on,edit:on,linkWith:on,invert:off,mute:on,clockOffset:off,addToLibrary:on", "link node: Rename, Edit link, Link with, Mute, Add to library only, got " + sbState(actions));

  t1.inverted = true;
  assert(pick(t1.id).find(a => a.action === "invert").label === "Remove NOT", "an inverted filter's button reads 'Remove NOT'");
});

await withApp(async (w, d, T) => {
  section("220e. the locked 'Bookmarks' node: everything disabled");
  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  w.toggleBookmark(f.entries[0].id);
  const bmNode = Object.values(T.state.nodes).find(n => n.filterType === "bookmarks");
  assert(bmNode && bmNode.locked, "sanity: the auto-managed Bookmarks node is locked");
  T.state.multiSelect = new Set([bmNode.id]);
  T.state.activeId = bmNode.id;
  const { actions } = w.describeSidebarToolbarActions();
  assert(actions.length === 7 && actions.every(a => a.disabled), "locked node: seven buttons, all disabled, got " + sbState(actions));
});

await withApp(async (w, d, T) => {
  section("220f. 2+ filters, same root: single-row description all disabled; describeBulkActions offers AND, OR, Link… for 2 and for 3 filters");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  const t1 = w.createFilterNode(f.id, "text", "message 1");
  const t2 = w.createFilterNode(f.id, "text", "message 2");
  T.state.multiSelect = new Set([t1.id, t2.id]);
  T.state.activeId = t1.id;
  assert(w.describeSidebarToolbarActions().actions.every(a => a.disabled), "toolbar buttons all disabled");
  let actions = w.describeBulkActions([t1, t2]).actions;
  assert(actions.map(a => a.action).join(",") === "and,or,link,mute", "AND, OR, Link…, Mute, got " + actions.map(a => a.action).join(","));
  assert(actions.find(a => a.action === "link").label === "Link…", "Link… label has no N-way suffix");
  const t3 = w.createFilterNode(f.id, "text", "message 3");
  actions = w.describeBulkActions([t1, t2, t3]).actions;
  assert(actions.map(a => a.action).join(",") === "and,or,link,mute", "3 filters: AND, OR, Link…, Mute too, got " + actions.map(a => a.action).join(","));
  assert(actions.find(a => a.action === "link").label === "Link…", "3-filter Link… still has no N-way suffix");
});

await withApp(async (w, d, T) => {
  section("220g. filters from different root files / mixed files+filters -> explanatory note + short message (toolbar multi mode)");
  const fa = await w.addFile("a.log", makeLog(0, 5), () => {});
  const fb = await w.addFile("b.log", makeLog(10, 5), () => {});
  const ta = w.createFilterNode(fa.id, "text", "message 1");
  const tb = w.createFilterNode(fb.id, "text", "message 1");
  T.state.multiSelect = new Set([ta.id, tb.id]);
  T.state.activeId = ta.id;
  assert(w.describeSidebarToolbarActions().actions.length === 7, "different roots: only the disabled fixed set");
  let bulk = w.describeBulkActions([ta, tb]);
  assert(bulk.actions.map(a => a.action).join() === "mute" && !!bulk.note && bulk.short === "Filters from different files", "different roots: only Mute (no combine actions), note + short text kept");
  bulk = w.describeBulkActions([fa, ta]);
  assert(bulk.actions.length === 0 && !!bulk.note && bulk.short === "Select only files or only filters", "mixed files+filters: note + short text, no actions");
});

await withApp(async (w, d, T) => {
  section("220h. removed actions never appear (copy/cut/saveFilter/loadFilter/context/countContext/applyFromLibrary)");
  const REMOVED = ["copy", "cut", "saveFilter", "loadFilter", "context", "countContext", "applyFromLibrary"];
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  const fb = await w.addFile("b.log", makeLog(20, 20), () => {});
  const t1 = w.createFilterNode(f.id, "text", "message 1");
  const t2 = w.createFilterNode(f.id, "text", "message 2");
  const shapes = [[], [f.id], [f.id, fb.id], [t1.id], [t1.id, t2.id]];
  shapes.forEach(ids => {
    T.state.multiSelect = new Set(ids); T.state.activeId = f.id;
    const names = w.describeSidebarToolbarActions().actions.map(a => a.action);
    REMOVED.forEach(r => assert(!names.includes(r), "'" + r + "' absent for selection of " + ids.length));
  });
});

await withApp(async (w, d, T) => {
  section("220i. handleSidebarToolbarActionClick: dispatches to the underlying function/dialog with the per-selection target; disabled/unknown actions are no-ops");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  const textNode = w.createFilterNode(f.id, "text", "message 1");
  let calls = [];
  const spy = name => { const orig = w[name]; w[name] = (...args) => { calls.push([name, args]); return orig.apply(w, args); }; };
  spy("openClockOffsetDialog"); spy("startRenameNode"); spy("editFilterNode");
  spy("toggleInvertWithUndo"); spy("openFilterLibrarySaveDialog"); spy("openFilterLibraryDialog"); spy("performBulkAction");

  T.state.multiSelect = new Set([textNode.id]);
  T.state.activeId = textNode.id;
  w.handleSidebarToolbarActionClick("rename");
  assert(calls.some(c => c[0] === "startRenameNode" && c[1][0] === textNode.id), "rename -> startRenameNode(target)");
  w.handleSidebarToolbarActionClick("edit");
  assert(calls.some(c => c[0] === "editFilterNode" && c[1][0] === textNode.id), "edit -> editFilterNode(target)");
  w.handleSidebarToolbarActionClick("invert");
  assert(calls.some(c => c[0] === "toggleInvertWithUndo" && c[1][0] === textNode.id), "invert -> toggleInvertWithUndo(target)");
  w.handleSidebarToolbarActionClick("addToLibrary");
  assert(calls.some(c => c[0] === "openFilterLibrarySaveDialog" && c[1][0] === textNode.id), "addToLibrary -> openFilterLibrarySaveDialog(target)");

  calls = [];
  ["applyFromLibrary", "context", "countContext", "copy", "cut", "saveFilter", "loadFilter"].forEach(a => w.handleSidebarToolbarActionClick(a));
  assert(calls.length === 0, "removed action names are no-ops");
  assert(!T.state.clipboard, "...Copy/Cut in particular do not set state.clipboard");

  T.state.multiSelect = new Set([f.id]);
  T.state.activeId = f.id;
  w.handleSidebarToolbarActionClick("clockOffset");
  assert(calls.some(c => c[0] === "openClockOffsetDialog" && c[1][0] === f.id), "clockOffset -> openClockOffsetDialog(target)");

  const fb = await w.addFile("b.log", makeLog(30, 5), () => {});
  T.state.multiSelect = new Set([f.id, fb.id]);
  T.state.activeId = f.id;
  calls = [];
  w.handleSidebarToolbarActionClick("merge");
  assert(calls.length === 0, "bulk actions are no longer handled by the toolbar (selection bar owns them)");

  calls = [];
  T.state.multiSelect = new Set();
  w.handleSidebarToolbarActionClick("rename");
  assert(calls.length === 0, "a disabled action (nothing selected) is a no-op");
});

await withApp(async (w, d, T) => {
  section("220j. rendered toolbar: built once, fixed buttons in the DOM, only disabled/label toggle; 2+ selected swaps the row for multi mode and back");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  const t1 = w.createFilterNode(f.id, "text", "message 1");
  const t2 = w.createFilterNode(f.id, "text", "message 2");
  const btns = () => [...d.querySelectorAll('#sidebarToolbar [data-row-action]')];
  T.state.multiSelect = new Set(); T.state.activeId = null; w.render();
  assert(btns().map(b => b.dataset.rowAction).join(",") === SB_FIXED, "seven fixed buttons rendered, got " + btns().map(b => b.dataset.rowAction).join(","));
  assert(btns().every(b => b.disabled), "all disabled with nothing selected");
  assert(btns().every(b => b.querySelector("svg.icon use")), "every button draws a sprite icon");
  const before = btns();
  T.state.multiSelect = new Set([t1.id]); T.state.activeId = t1.id; w.render();
  const after = btns();
  assert(before.every((b, i) => b === after[i]), "the same button elements survive a render (no rebuild)");
  assert(after.map(b => b.disabled ? "0" : "1").join("") === "1111101", "text filter: Adjust clock… disabled, rest enabled");
  T.state.multiSelect = new Set([t1.id, t2.id]); w.render();
  const tbEl = d.querySelector("#sidebarToolbar");
  assert(btns().length === 0 && tbEl.classList.contains("multi"), "2 filters selected: the single-node buttons are not rendered, toolbar is in multi mode");
  T.state.multiSelect = new Set([t1.id]); w.render();
  assert(btns().map(b => b.dataset.rowAction).join(",") === SB_FIXED && !tbEl.classList.contains("multi"), "back to one node: the seven buttons return, multi class gone");
  assert(tbEl.querySelector('[data-multi-action]') === null, "...and no multi-mode content is left");
});
