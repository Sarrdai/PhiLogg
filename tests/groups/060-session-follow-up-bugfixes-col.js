// GROUP 60 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 60 — Session follow-up bugfixes: col-delta/col-time overflow-clip,
   tree context menu grouped with separators
   Origin: this session, person-reported. (a) "wenn ich die deltaT Spalte
   verstecke, bleiben die Einträge in der Tabelle aber hinter den nun
   darüber liegenden Log-Levels sichtbar" — .col-delta (and, defensively,
   .col-time) lacked overflow:hidden, unlike .col-thread/.col-loc/
   .col-method/.col-msg, which already had it — a column collapsed to a
   0px --row-grid track (via the column-visibility toggle, or just a very
   narrow drag-resize) didn't clip its own text content, which kept
   rendering at natural width and spilled into the next column, appearing
   underneath its opaque background. (b) "Das Kontextmenü auf dem Filter
   Tree ist ziemlich voll geworden. gruppiere die Einträge sinnvoll, analog
   zum Kontextmenü auf den Messages" — #treeContextMenu's per-node item
   list (11 items on a filter node) is now built into GROUP_ORDER buckets
   (edit/clipboard/library/danger) joined by .ctx-sep, the same grouping
   convention #contextMenu (the log-row menu) already established.
   UPDATED, same-day later session: "Time context…"/"Count context…" removed
   from the edit bucket entirely (FEATURE_BACKLOG.md #79) — there is no
   longer any user-facing way to create a fresh context/countContext node.
   60b's ordering assertions updated (edit group is now just edit/invert)
   and extended with an explicit absence guard plus a link-node regression
   check (see GROUP 220/221 for the sidebar toolbar's own side of this).
   ============================================================ */
group(60);
await withApp(async (w, d, T) => {
  section("60a. col-delta/col-time declare overflow:hidden (bugfix: hidden/narrow column content no longer bleeds into the next column)");

  const f = await w.addFile("a.log", makeLog(0, 3), () => {});
  T.state.activeId = f.id;
  w.render();

  const cs = w.getComputedStyle;
  const deltaEl = d.querySelector("#tableRows .col-delta");
  const timeEl = d.querySelector("#tableRows .col-time");
  assert(deltaEl && cs(deltaEl).overflow === "hidden", "col-delta declares overflow:hidden, got " + (deltaEl && cs(deltaEl).overflow));
  assert(timeEl && cs(timeEl).overflow === "hidden", "col-time declares overflow:hidden too (defensive — also resizable now), got " + (timeEl && cs(timeEl).overflow));
  // Same fix already existed for these three (regression guard: this bugfix
  // must not have accidentally removed it).
  ["col-thread", "col-location", "col-method"].forEach(cls => {
    const el = d.querySelector("#tableRows ." + cls);
    assert(el && cs(el).overflow === "hidden", "." + cls + " still declares overflow:hidden");
  });
});

await withApp(async (w, d, T) => {
  section("60b. Tree context menu items grouped with separators (analogous to the log-row context menu)");

  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  w.render();
  const textNode = w.createFilterNode(f.id, "text", "message 1");
  w.render();

  const treeRow = d.querySelector('.tree-row[data-node-id="' + textNode.id + '"]');
  fireContextMenu(treeRow, w);
  const menu = d.querySelector("#treeContextMenu");
  const children = [...menu.children];
  const seps = children.filter(c => c.classList.contains("ctx-sep")).length;
  assert(seps >= 4, "a filter node's context menu has at least 4 separators (meta + 3 group boundaries among edit/clipboard/library/danger), got " + seps);

  // Group order: edit (edit/invert) before clipboard (copy/cut) before
  // library (saveFilter) before danger (delete)
  // — verify relative order via each action's index.
  // ("Save to library…" moved out of this menu onto the sidebar toolbar's
  // "Add to library…" action; "Apply from library…" moved to the Library ▾ menu. "Time
  // context…"/"Count context…" were REMOVED from this menu entirely, this
  // session — FEATURE_BACKLOG.md #79 — so the edit group is now just
  // edit/invert; see the regression guard right below for their absence.)
  const indexOf = action => children.findIndex(c => c.dataset && c.dataset.action === action);
  assert(indexOf("context") === -1 && indexOf("countContext") === -1,
    "'Time context…'/'Count context…' no longer appear on a filter node's context menu — there is no user-facing way left to create a fresh one (FEATURE_BACKLOG.md #79)");
  assert(indexOf("edit") < indexOf("invert"), "edit group stays together and in order: edit, invert");
  assert(indexOf("invert") < indexOf("copy") && indexOf("copy") < indexOf("cut"), "clipboard group (copy, cut) comes after the edit group");
  assert(indexOf("cut") < indexOf("saveFilter") && indexOf("saveFilter") < indexOf("delete"),
    "library group (save filter) comes after clipboard, before the danger group");
  assert(indexOf("applyFromLibrary") === -1, "'Apply from library…' is gone from the context menu (Library ▾ menu in #viewBar — GROUP 320)");
  assert(indexOf("loadFilter") === -1, "'Load filter…' is gone from the context menu (the central Open → Import…/drop replaces it — GROUP 294)");
  assert(indexOf("saveToLibrary") === -1, "'Save to library…' is no longer a context-menu action (moved to the sidebar toolbar's 'Add to library…')");
  assert(indexOf("saveFilter") < indexOf("delete"), "danger group (remove filter) comes last");

  // A .ctx-sep must actually separate the edit and clipboard groups (not
  // just "somewhere in the menu") — the item right after "invert" (edit
  // group's now-last item) up to "copy" (clipboard's first) is exactly one sep.
  const invertIdx = indexOf("alert"); // "Alert on new matches" (#87) follows Mute, which follows Invert (NOT), as the edit group's last item
  assert(children[invertIdx + 1].classList.contains("ctx-sep") && children[invertIdx + 2].dataset.action === "copy",
    "a .ctx-sep sits directly between the edit group's last item and the clipboard group's first");

  w.closeTreeContextMenu();

  // A link filter (Invert excluded) still groups cleanly with just "edit"
  // (Rename) in the edit group — regression guard that removing
  // context/countContext didn't leave a dangling empty-group separator for
  // a filterType that also excludes invert.
  const f2 = await w.addFile("b.log", makeLog(0, 20, { msgPrefix: "other" }), () => {});
  const t1 = w.createFilterNode(f.id, "text", "message 1");
  const t2 = w.createFilterNode(f2.id, "text", "message 1");
  const linkNode = w.createLinkNode(t1.id, t2.id, "after", 1);
  w.render();
  fireContextMenu(d.querySelector('.tree-row[data-node-id="' + linkNode.id + '"]'), w);
  const linkChildren = [...d.querySelector("#treeContextMenu").children];
  const linkIndexOf = action => linkChildren.findIndex(c => c.dataset && c.dataset.action === action);
  assert(linkIndexOf("context") === -1 && linkIndexOf("countContext") === -1 && linkIndexOf("invert") === -1,
    "a link node's context menu offers none of invert/context/countContext");
  assert(linkIndexOf("rename") < linkIndexOf("copy"), "rename (edit group) still precedes copy (clipboard group) for a link node");
  w.closeTreeContextMenu();

  // A plain (non-merged, entries-bearing) file node groups cleanly: the edit
  // group (just "Adjust clock…", FEATURE_BACKLOG.md #29), then the library
  // group, then the danger item — no empty/dangling leading separator for the
  // groups that have nothing in them.
  fireContextMenu(d.querySelector('.tree-row[data-node-id="' + f.id + '"]'), w);
  const fileChildren = [...d.querySelector("#treeContextMenu").children];
  const fileIndexOf = action => fileChildren.findIndex(c => c.dataset && c.dataset.action === action);
  assert(fileIndexOf("clockOffset") >= 0 && fileIndexOf("clockOffset") < fileIndexOf("delete"),
    "a file node's context menu offers 'Adjust clock…' in the edit group, before the danger (remove file) item");
  assert(fileIndexOf("loadFilter") === -1 && fileIndexOf("applyFromLibrary") === -1, "a file node's menu has no filter-library items any more");
  const libSep = fileChildren.filter(c => c.classList.contains("ctx-sep")).length;
  assert(libSep === 2, "file node menu has 2 separators (meta, edit->danger; the library group is empty), got " + libSep);
});

await withApp(async (w, d, T) => {
  section("60c. Extraction view: #btnCopySelection/#btnCopyAllExtract removed (person-requested)");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  const extractNode = w.createFilterNode(f.id, "text", "message [*:int]");
  T.state.activeId = extractNode.id;
  w.render();
  w.applyFhView("table");

  assert(d.querySelector("#btnCopySelection") === null, "#btnCopySelection button no longer exists");
  assert(d.querySelector("#btnCopyAllExtract") === null, "#btnCopyAllExtract button no longer exists");
  assert(d.querySelector(".extract-actions") === null, "the now-empty .extract-actions wrapper was removed too, not left behind empty");
  // #extractViewTabs itself is gone (docs/archive/ui-implementation-plan.md Schritt 6
  // — its Table/Plot switch is now part of the main #fhTabs group instead).
  assert(d.querySelector("#extractViewTabs") === null, "the old sub-toolbar Table/Plot switch is gone, superseded by the main #fhTabs group");
  assert(d.querySelector("#extractPatternView"), "sanity: the rest of the extraction toolbar (pattern view) is untouched");
});
