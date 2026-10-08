// GROUP 223 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 223 — Complete the log-entry right-click context menu
   (FEATURE_BACKLOG.md #78)
   Origin: this session. Numbered 223, not 219, to avoid colliding with the
   unrelated stepper-control GROUP 219 merged into main the same day.
   Three changes to #contextMenu/openContextMenu:
   (1) "Filter for this ___" (#ctxFilterForColumn) moved to the very top,
   right under the timestamp meta row's separator, instead of being buried
   below After/Before/Bookmark/Note. (2) A new "Extract" item
   (#ctxExtractMessage) sits right next to it — a one-click version calling
   the unchanged extractMessageFilter(entry), shown only when the entry's
   message has something extractable (buildNumericExtractPattern !== null),
   the exact same gate the #viewBar row-action's own "Extract" button
   already uses for its disabled state. The rest of the menu is regrouped
   by separators (meta -> Filter-for-this-___ + Extract -> After/Before/
   Time filter from selection -> Bookmark/Note/Add to selection -> Copy;
   regrouped and headed again 2026-10-08, GROUP context-menu-groups)
   but otherwise unchanged. (3) A new "Copy" item (#ctxCopy) at the very
   bottom: NOT a plain copyLogSelectionToClipboard() call (which reads
   whatever state.logMultiSelect/state.selectedId currently holds,
   ignoring which row was actually right-clicked) — person-confirmed
   semantics: copy the right-clicked row, UNLESS it's already part of the
   current multi-selection, in which case copy the whole selection
   (calling copyLogSelectionToClipboard() unmodified). Both paths share a
   new formatEntriesForClipboard(entries), factored out of
   copyLogSelectionToClipboard's own inline formatting, so a single row and
   a full selection can never format differently.
   ============================================================ */
group(223);
await withApp(async (w, d, T) => {
  section("223. Context menu: reorder, Extract item, selection-aware Copy");

  // Two lines: one with numeric message content (extractable), one without.
  const line1 = `2024-01-15 10:00:00,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 0\t[DoWork]\t"processed 42 items"\n`;
  const line2 = `2024-01-15 10:00:01,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 1\t[DoWork]\t"no numeric content here"\n`;
  const f = await w.addFile("ctx219.log", line1 + line2 + makeLog(2, 6), () => {});
  T.state.activeId = f.id;
  w.render();

  // --- (1) Order: meta, then five headed groups (GROUP context-menu-groups
  // pins the headings and the show/hide behaviour in detail) ---
  const menuChildren = [...d.querySelector("#contextMenu").children];
  assert(menuChildren[0].id === "ctxMeta", "sanity: the timestamp meta row is still the menu's first child");
  const tokens = menuChildren.map(c => c.id || (c.classList.contains("ctx-sep") ? "sep" : c.classList.contains("ctx-head") ? "head:" + c.textContent : "?"));
  const expectedOrder = ["ctxMeta", "sep", "head:Filter", "ctxFilterForColumn", "ctxExtractMessage",
    "sep", "head:Time filter", "ctxBefore", "ctxAfter", "ctxTimeRangeFromSelection",
    "sep", "head:Analyze", "ctxWhyRow", "ctxPairWith", "ctxTimeZero",
    "sep", "head:Mark", "ctxBookmark", "ctxNote", "ctxAddToSelection",
    "sep", "head:Copy & open", "ctxCopy", "ctxCopyTicket", "ctxOpenInVs", "ctxOpenInRider"];
  assert(JSON.stringify(tokens) === JSON.stringify(expectedOrder),
    "menu order: Filter / Time filter / Analyze / Mark / Copy & open, got " + JSON.stringify(tokens));

  // --- (2) Extract item: visible + correct outcome for an extractable
  // message, hidden for a message with nothing extractable ---
  w.openContextMenu({ clientX: 10, clientY: 10 }, f.entries[0]);
  assert(isVisible(d.querySelector("#ctxExtractMessage"), w) === true, "Extract is shown for a message with numeric content");
  const beforeChildren = f.children.slice();
  fireClick(d.querySelector("#ctxExtractMessage"), w);
  assert(f.children.length === beforeChildren.length + 1, "Extract creates exactly one new filter node");
  const extractedId = f.children.find(id => !beforeChildren.includes(id));
  const extracted = T.state.nodes[extractedId];
  assert(extracted.filterType === "text" && extracted.value === "processed [*:int] items",
    "Extract commits the same auto-extraction pattern extractMessageFilter/buildNumericExtractPattern would build, got " + JSON.stringify(extracted && extracted.value));
  assert(JSON.stringify(extracted.columns) === JSON.stringify(["message"]), "the created node is restricted to the message column");
  assert(T.state.activeId === extracted.id, "Extract reveals the created node as active, same as extractMessageFilter's own behavior");

  w.openContextMenu({ clientX: 10, clientY: 10 }, f.entries[1]);
  assert(isVisible(d.querySelector("#ctxExtractMessage"), w) === false, "Extract is hidden for a message with nothing extractable ('no numeric content here')");
  w.closeContextMenu();

  // --- (3) Copy: selection-aware semantics ---
  // The Extract action above left the extraction's own child node active
  // (narrowing #tableRows to just its own match) — back to the file itself
  // so every entry has a row to right-click again.
  T.state.activeId = f.id;
  w.render();
  let copied = null;
  w.navigator.clipboard.writeText = text => { copied = text; return Promise.resolve(); };
  const rowAt = i => d.querySelector('#tableRows [data-entry-id="' + f.entries[i].id + '"]');
  const clickWith = (el, opts) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true, ...opts }));

  // Nothing selected at all -> right-clicking a row copies just that row.
  T.state.logMultiSelect.clear();
  T.state.selectedId = null;
  w.openContextMenu({ clientX: 10, clientY: 10 }, f.entries[3]);
  fireClick(d.querySelector("#ctxCopy"), w);
  assert(copied === f.entries[3].raw, "with nothing selected, Copy copies just the right-clicked row's raw text");

  // Right-clicking a row that is NOT part of the current multi-selection ->
  // copies just that row, ignoring the unrelated active selection.
  clickWith(rowAt(2), {});
  clickWith(rowAt(4), { ctrlKey: true });
  assert(T.state.logMultiSelect.size === 2 && !T.state.logMultiSelect.has(f.entries[6].id), "sanity: a 2-row selection is active, not including entry 6");
  copied = null;
  w.openContextMenu({ clientX: 10, clientY: 10 }, f.entries[6]);
  fireClick(d.querySelector("#ctxCopy"), w);
  assert(copied === f.entries[6].raw, "right-clicking a row OUTSIDE the current selection copies just that row, not the unrelated selection");

  // Right-clicking a row that IS part of an active 2+ multi-selection ->
  // copies the whole selection, byte-identical to copyLogSelectionToClipboard().
  copied = null;
  w.openContextMenu({ clientX: 10, clientY: 10 }, f.entries[4]);
  fireClick(d.querySelector("#ctxCopy"), w);
  const expectedSelectionText = [2, 4].map(i => f.entries[i].raw).join("\n");
  assert(copied === expectedSelectionText, "right-clicking a row INSIDE the current selection copies the whole selection, sorted chronologically");
  copied = null;
  w.copyLogSelectionToClipboard();
  assert(copied === expectedSelectionText, "...byte-identical to calling copyLogSelectionToClipboard() directly");

  // --- Regression guard: pre-existing items still work, just repositioned ---
  // Extract (above) reveals the created node as active — reset back to the
  // file itself so the actions below create their nodes as its children,
  // same as every other assertion in this group.
  T.state.activeId = f.id;
  T.state.logMultiSelect.clear();
  w.openContextMenu({ clientX: 10, clientY: 10 }, f.entries[5]);
  assert(isVisible(d.querySelector("#ctxBookmark"), w) === true, "Bookmark this row is still offered, just moved into the third group");
  fireClick(d.querySelector("#ctxBookmark"), w);
  assert(T.state.bookmarks.has(f.entries[5].id), "Bookmark this row still toggles a bookmark");

  const beforeAfterChildren = f.children.slice();
  w.openContextMenu({ clientX: 10, clientY: 10 }, f.entries[5]);
  fireClick(d.querySelector("#ctxAfter"), w);
  const afterId = f.children.find(id => !beforeAfterChildren.includes(id));
  assert(T.state.nodes[afterId].filterType === "timerange" && T.state.nodes[afterId].value.from === f.entries[5].ts && T.state.nodes[afterId].value.to === null,
    "'Filter after this' still creates the expected timerange node, just repositioned in the menu");

  // Back to the unfiltered file view so every entry has a row again (the
  // "Filter after this" node above narrows #tableRows to entries 5+).
  T.state.activeId = f.id;
  w.render();
  clickWith(rowAt(2), {});
  clickWith(rowAt(4), { ctrlKey: true });
  w.openContextMenu({ clientX: 10, clientY: 10 }, f.entries[4]);
  assert(isVisible(d.querySelector("#ctxTimeRangeFromSelection"), w) === true, "'Filter selected time range' still shows for a 2+ selection");
  assert(isVisible(d.querySelector("#ctxAddToSelection"), w) === true, "'Add to selection' is still always offered");
  w.closeContextMenu();
});
