// GROUP tablet-viewbar-fit — the compact-tier "level bar gets its own row" decision counts child margins.
// Origin: 2026-10-06 usability round E3.
group("tablet-viewbar-fit");

if (groupSelected()) {
  await withApp(async (w, d, T) => {
    section("tablet-viewbar-fit a. margins count against the available width");
    await waitForFormatConfig(T);
    const TOUR = require(path.join(__dirname, "..", "tools", "log-sim", "tour.js"));
    const f = await w.addFile("app.log", TOUR.generateTour().find(x => x.path === "demo/app.log").text, () => {});
    T.state.activeId = f.id;
    w.innerWidth = 820; w.dispatchEvent(new w.Event("resize")); w.render();
    assert(d.body.classList.contains("layout-compact"), "sanity: compact tier");
    const viewBar = d.querySelector("#viewBar"), bar = d.querySelector("#levelBar");
    const def = (el, props) => Object.entries(props).forEach(([k, v]) => Object.defineProperty(el, k, { configurable: true, get: typeof v === "function" ? v : () => v }));
    let avail = 0;
    def(viewBar, { clientWidth: () => avail });
    const others = [...viewBar.children].filter(c => c !== bar);
    others.forEach(c => { def(c, { offsetWidth: 0 }); c.style.marginLeft = c.style.marginRight = "0px"; });
    bar.style.marginLeft = bar.style.marginRight = "0px";
    const kids = [...bar.children];
    kids.forEach(c => def(c, { offsetWidth: 44 }));
    const chipsW = kids.length * 44 + (kids.length - 1) * 6 + 4; // + "Add level filter" (stubbed 0 wide) with its 4px gap
    const first = others[0];
    def(first, { offsetWidth: 500 });
    const vcs = w.getComputedStyle(viewBar);
    const pad = (parseFloat(vcs.paddingLeft) || 0) + (parseFloat(vcs.paddingRight) || 0);
    const gapOf = el => parseFloat(w.getComputedStyle(el).columnGap) || 0;
    avail = 500 + chipsW + pad;
    w.updateLevelBarLayout();
    assert(!viewBar.classList.contains("level-own-row"), "widths alone fit exactly: one row");
    first.style.marginRight = "14px"; bar.style.marginRight = "4px";
    w.updateLevelBarLayout();
    assert(viewBar.classList.contains("level-own-row"), "with margins (14 + 4) it overflows: own row");
    avail += 18;
    w.updateLevelBarLayout();
    assert(!viewBar.classList.contains("level-own-row"), "margins fit exactly: one row again");
    first.style.display = "none";
    avail = chipsW + 4 + pad;
    w.updateLevelBarLayout();
    assert(!viewBar.classList.contains("level-own-row"), "a display:none child (and its margins) is ignored");
  });
}
