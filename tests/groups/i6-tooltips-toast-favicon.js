// GROUP i6-tooltips-toast-favicon — loaded by philogg.regression.test.js
// (tests/README.md -> "Group files").

/* ============================================================
   GROUP i6-tooltips-toast-favicon — Round I, package I6 (small fixes), items 7-9
   Origin: 2026-10-09 (desktop usability test).
   7. Opening a dialog (or the filter popup) dismisses the hover cards of the
      toolbars (the "Edit filter…" card stayed over the logo): .expanded /
      .labels-live are removed, a focused toolbar button is blurred, the
      chart/minimap tooltips are hidden. A later hover shows them again.
   8. Removing a filter shows "Filter removed" + Undo on every layout (it was
      phone only); Undo restores it.
   9. The page carries an inline data-URI favicon (no /favicon.ico request, so
      no 404 on load).
   ============================================================ */
group("i6-tooltips-toast-favicon");

await withApp(async (w, d, T) => {
  section("i6-tooltips-toast-favicon a. a dialog opening dismisses hover cards, focus card and tooltips");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["basic"], entries: 100, seed: 7 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  const a = w.createFilterNode(f.id, "text", "Move requested");
  const b = w.createFilterNode(f.id, "text", "Position reached");
  T.state.activeId = a.id;
  w.render();
  const sideBtn = d.querySelector("#sidebarToolbar .row-action-btn");
  const container = sideBtn.parentElement;
  assert(!!sideBtn, "a sidebar toolbar button");
  sideBtn.classList.add("expanded");
  container.classList.add("labels-live");
  sideBtn.focus();
  const tip = d.querySelector("#plotTooltip");
  tip.classList.remove("hidden");
  w.openLinkDialog([a.id, b.id]);
  assert(await waitFor(() => !sideBtn.classList.contains("expanded")), "the hover card collapsed when the dialog opened");
  assert(!container.classList.contains("labels-live"), "the hand-over state is cleared");
  assert(d.activeElement !== sideBtn, "the toolbar button no longer holds the focus-visible card");
  assert(tip.classList.contains("hidden"), "the plot tooltip is hidden");

  section("i6-tooltips-toast-favicon b. the filter popup does it too; closing and re-hovering is untouched");
  w.closeLinkDialog();
  sideBtn.classList.add("expanded");
  w.openEditFilterPopup(a.id);
  assert(await waitFor(() => !sideBtn.classList.contains("expanded")), "the hover card collapsed when the filter popup opened");
  fireClick(d.querySelector("#btnCloseFilterPopup"), w);
  sideBtn.classList.add("expanded"); // a new hover while nothing opens
  await new Promise(r => setTimeout(r, 20));
  assert(sideBtn.classList.contains("expanded"), "nothing dismisses a hover card while no dialog opens");
});

await withApp(async (w, d, T) => {
  section("i6-tooltips-toast-favicon c. desktop: removing a filter offers 'Filter removed' + Undo");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["basic"], entries: 100, seed: 7 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  const flt = w.createFilterNode(f.id, "text", "Heartbeat");
  w.render();
  assert(w.innerWidth >= 1000, "a desktop-width window");
  w.openTreeContextMenu({ clientX: 10, clientY: 10, preventDefault() {}, stopPropagation() {} }, flt.id);
  fireClick(d.querySelector('#treeContextMenu [data-action="delete"]'), w);
  assert(!T.state.nodes[flt.id], "the filter is removed");
  const toast = d.querySelector("#copyToast");
  assert(toast.firstChild.textContent === "Filter removed" && toast.classList.contains("has-action") && toast.querySelector(".toast-action").textContent === "Undo", "toast 'Filter removed' + Undo, got " + toast.textContent);
  fireClick(toast.querySelector(".toast-action"), w);
  assert(!!T.state.nodes[flt.id] && T.state.nodes[flt.id].value === "Heartbeat", "Undo brings the filter back");
});

await withApp(async (w, d, T) => {
  section("i6-tooltips-toast-favicon d. inline favicon");
  const icon = d.querySelector('head link[rel="icon"]');
  assert(!!icon && /^data:image\/svg\+xml,/.test(icon.getAttribute("href")), "an inline SVG data URI icon");
  assert(d.querySelectorAll('head link[rel~="icon"]').length === 1, "exactly one icon link");
  assert(!/favicon\.ico/.test(d.documentElement.outerHTML.slice(0, 4000)), "no favicon.ico reference");
});
