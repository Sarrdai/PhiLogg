// GROUP tablet-facets — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP tablet-facets — Facets on the tablet tier (tablet UX round, step 3)
   Origin: 2026-10-03 (tablet usability test). #btnFacets shows its "Facets"
   label on the compact tier; path-like facet values start at their last
   segment, cut on the right (JS, full value in the title); a touch long-press on a facet value
   opens a menu (value, Show only / Exclude / Copy value) instead of silently
   excluding; desktop right-click still excludes. jsdom has no layout: the
   fit is exercised with stubbed clientWidth/scrollWidth.
   ============================================================ */
group("tablet-facets");

const tfPointer = (w, type, opts) => {
  const ev = new w.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...opts });
  Object.defineProperty(ev, "pointerType", { value: "touch" });
  Object.defineProperty(ev, "pointerId", { value: 9 });
  Object.defineProperty(ev, "isPrimary", { value: true });
  return ev;
};
const tfSetWidth = (w, px) => { w.innerWidth = px; w.dispatchEvent(new w.Event("resize")); };

await withApp(async (w, d, T) => {
  const rows = [];
  for (let i = 0; i < 12; i++) {
    const ss = String(i).padStart(2, "0");
    rows.push(`2024-01-15 10:00:${ss},000\t${i < 3 ? "ERROR" : "INFO"}\t"${i < 8 ? "Worker-1" : "Worker-2"}"\tC:\\src\\Orders\\OrderService.cs\tline 0\t[M${i % 3}]\t"message ${i}"`);
  }
  const f = await w.addFile("facets.log", rows.join("\n") + "\n", () => {});
  T.state.activeId = f.id; w.render();
  w.setFacetsOpen(true);
  const btn = d.querySelector("#btnFacets");
  const label = btn.querySelector(".facets-btn-label");
  const valueRow = (col, name) => [...d.querySelectorAll('.facet-section[data-col="' + col + '"] .facet-value')].find(v => (v.querySelector(".facet-value-name").dataset.full || v.querySelector(".facet-value-name").textContent) === name);
  const loc = "C:\\src\\Orders\\OrderService.cs line 0";

  section("tablet-facets a. Facets button: text label on the compact tier only");
  tfSetWidth(w, 1400);
  assert(w.getComputedStyle(label).display === "none", "desktop: no label");
  tfSetWidth(w, 800);
  assert(d.body.classList.contains("layout-compact"), "sanity: compact tier");
  assert(label && label.textContent === "Facets" && w.getComputedStyle(label).display !== "none", "tablet: label shown");
  assert(w.getComputedStyle(btn).width === "auto", "tablet: button grows with its label, got " + w.getComputedStyle(btn).width);
  d.body.classList.add("filter-toolbar-labels-never");
  assert(w.getComputedStyle(label).display !== "none", "label independent of the label-mode setting");
  d.body.classList.remove("filter-toolbar-labels-never");

  section("tablet-facets b. Path values start at the last path segment; full value stays in the title");
  const row = valueRow("location", loc);
  const nameEl = row.querySelector(".facet-value-name");
  assert(nameEl.classList.contains("facet-path"), "path-like value is marked");
  assert(!valueRow("thread", "Worker-1").querySelector(".facet-value-name").classList.contains("facet-path"), "plain value is not");
  assert(row.title.startsWith(loc), "title carries the full value");
  // stub layout: 18 chars fit
  Object.defineProperty(nameEl, "clientWidth", { configurable: true, get: () => 100 });
  Object.defineProperty(nameEl, "scrollWidth", { configurable: true, get: () => nameEl.textContent.length * 100 / 18 });
  w.fitFacetPathNames();
  assert(nameEl.textContent === "…\\OrderService.cs…", "too long: starts at the last segment, cut on the right, got " + nameEl.textContent);
  Object.defineProperty(nameEl, "clientWidth", { configurable: true, get: () => 100 * 24 / 18 });
  w.fitFacetPathNames();
  assert(nameEl.textContent === "…\\OrderService.cs line 0", "fits from the last segment: whole segment shown, got " + nameEl.textContent);
  Object.defineProperty(nameEl, "clientWidth", { configurable: true, get: () => 100000 });
  w.fitFacetPathNames();
  assert(nameEl.textContent === loc, "re-fit with room restores the full value");

  section("tablet-facets c. Touch long-press opens the menu (no silent exclude); items work");
  const menu = d.querySelector("#facetValueMenu");
  assert(menu.classList.contains("hidden"), "menu closed initially");
  const target = valueRow("thread", "Worker-1");
  const before = Object.keys(T.state.nodes).length;
  target.dispatchEvent(tfPointer(w, "pointerdown", { clientX: 40, clientY: 60 }));
  await waitFor(() => !menu.classList.contains("hidden"), 3000, "menu opens after the long-press");
  assert(Object.keys(T.state.nodes).length === before && T.state.activeId === f.id, "long-press created no filter");
  assert(d.querySelector("#facetValueMenuValue").textContent === "Worker-1", "first line is the full value");
  assert([...menu.querySelectorAll(".ctx-item")].map(i => i.textContent.trim()).join("|") === "Show only this|Exclude this|Copy value", "three actions");
  target.dispatchEvent(tfPointer(w, "pointerup", { clientX: 40, clientY: 60 }));
  fireClick(target, w); // swallowed by the long-press helper
  assert(T.state.activeId === f.id, "the release click doesn't drill down");

  // outside press dismisses
  d.body.dispatchEvent(tfPointer(w, "pointerdown", { clientX: 5, clientY: 5 }));
  assert(menu.classList.contains("hidden"), "outside pointerdown closes the menu");
  d.body.dispatchEvent(tfPointer(w, "pointerup", { clientX: 5, clientY: 5 }));

  async function openMenu(el) {
    el.dispatchEvent(tfPointer(w, "pointerdown", { clientX: 40, clientY: 60 }));
    await waitFor(() => !menu.classList.contains("hidden"), 3000, "menu opens");
    el.dispatchEvent(tfPointer(w, "pointerup", { clientX: 40, clientY: 60 }));
    fireClick(el, w); // the release click, swallowed by the long-press helper
  }
  // Esc
  await openMenu(valueRow("thread", "Worker-1"));
  fireKeydown(d, w, "Escape");
  assert(menu.classList.contains("hidden"), "Esc closes the menu");

  // Show only
  await openMenu(valueRow("thread", "Worker-1"));
  fireClick(menu.querySelector('[data-act="only"]'), w);
  let node = T.state.nodes[T.state.activeId];
  assert(menu.classList.contains("hidden") && node.parentId === f.id && !node.inverted && node.value === "^Worker-1$", "Show only = the tap's filter");
  // Exclude
  T.state.activeId = f.id; w.render();
  await openMenu(valueRow("thread", "Worker-1"));
  fireClick(menu.querySelector('[data-act="exclude"]'), w);
  node = T.state.nodes[T.state.activeId];
  assert(node.inverted && node.value === "^Worker-1$", "Exclude = the NOT filter");
  // Copy
  T.state.activeId = f.id; w.render();
  let copied = null;
  Object.defineProperty(w.navigator, "clipboard", { configurable: true, value: { writeText: t => { copied = t; return Promise.resolve(); } } });
  await openMenu(valueRow("location", loc));
  assert(d.querySelector("#facetValueMenuValue").textContent === loc, "menu shows the full path value");
  fireClick(menu.querySelector('[data-act="copy"]'), w);
  assert(copied === loc, "Copy value writes the full value, got " + copied);
  assert(d.querySelector("#copyToast").textContent === "Copied", "toast: Copied");

  section("tablet-facets d. Desktop right-click keeps excluding directly");
  tfSetWidth(w, 1400);
  T.state.activeId = f.id; w.render();
  fireContextMenu(valueRow("thread", "Worker-2"), w);
  node = T.state.nodes[T.state.activeId];
  assert(node.inverted && node.value === "^Worker-2$" && menu.classList.contains("hidden"), "right-click = NOT filter, no menu");
});
