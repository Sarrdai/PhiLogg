// GROUP toolbar-labels-always-zindex — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP toolbar-labels-always-zindex — inline labels don't paint over popups
   Origin: 2026-10-03 (tablet usability test). The floating-pill label rules
   carry z-index:45; in the "Always" overrides the label becomes
   position:static but is a flex item, where z-index still applies, so it was
   drawn above #filterPopup (z-index 40). The overrides now reset it to auto.
   ============================================================ */
group("toolbar-labels-always-zindex");
await withApp(async (w, d, T) => {
  const z = el => w.getComputedStyle(el).zIndex;
  const mk = (cls, parentCls) => {
    const b = d.createElement("button");
    b.className = parentCls;
    const l = d.createElement("span");
    l.className = cls;
    b.appendChild(l);
    d.body.appendChild(b);
    return { b, l };
  };
  const rowFilter = mk("row-action-label", "row-action-btn");
  const rowView = mk("row-action-label", "row-action-btn rect");
  const tb = d.createElement("button");
  tb.className = "toolbar-icon-btn";
  tb.innerHTML = '<span class="tb-hit"></span><span class="tb-label"></span>';
  d.body.appendChild(tb);

  section("toolbar-labels-always-zindex a. Hover mode keeps the floating pill above (z-index 45)");
  assert(z(rowFilter.l) === "45" && z(tb.querySelector(".tb-label")) === "45", "labels float at z-index 45 by default");

  section("toolbar-labels-always-zindex b. Always mode: z-index auto for both kinds");
  d.body.classList.add("filter-toolbar-labels-always");
  assert(z(rowFilter.l) === "auto", "filter-toolbar label z-index auto, got " + z(rowFilter.l));
  d.body.classList.remove("filter-toolbar-labels-always");
  d.body.classList.add("view-toolbar-labels-always");
  assert(z(rowView.l) === "auto", "view-toolbar .rect label z-index auto, got " + z(rowView.l));
  assert(z(tb.querySelector(".tb-label")) === "auto", ".tb-label z-index auto, got " + z(tb.querySelector(".tb-label")));
  assert(z(rowFilter.l) === "45", "the filter-toolbar label is not affected by the view-toolbar mode");
  d.body.classList.remove("view-toolbar-labels-always");
}, { toolbarLabels: "hover" });
