// GROUP card-sessions-view-param — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP card-sessions-view-param — ?view=<tab> and the homepage cards' sessions
   Origin: 2026-10-07 (FEATURE_BACKLOG #108, person-requested). The four
   feature cards of the homepage open the hosted app in the state their
   screenshot shows: the simulator's tour output writes cards/<card>.session.json
   (the screenshot scenes' filter tree + active node, no banner) next to a
   cards/app.log, and ?view=<tab> picks the tab after the session load (the
   session format does not carry it). Unknown values are ignored; Table/Plot
   only apply to an extraction node.
   ============================================================ */
group("card-sessions-view-param");
if (groupSelected()) {
  const TOUR = require(path.join(__dirname, "..", "tools", "log-sim", "tour.js"));
  const files = Object.fromEntries(TOUR.generateTour().map(f => [f.path, f.text]));
  const BASE = "http://tour.example/t/";
  const page = (card, view) => "http://localhost/philogg.html?session=" + encodeURIComponent(BASE + "cards/" + card + ".session.json") + (view ? "&view=" + view : "");
  const stub = win => {
    win.fetch = async u => {
      const text = files[u.replace(BASE, "")];
      if (text === undefined) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0), text: async () => "" };
      return { ok: true, status: 200, arrayBuffer: async () => new win.TextEncoder().encode(text).buffer, text: async () => text };
    };
  };
  const load = (card, view, check) => withApp(async (w, d, T) => {
    await T.bootRestore;
    await waitFor(() => T.state.rootIds.length === 1 && T.state.nodes[T.state.rootIds[0]].entries && T.state.nodes[T.state.rootIds[0]].entries.length > 0);
    await sleep(60);
    await check(w, d, T, T.state.nodes[T.state.rootIds[0]], T.state.nodes[T.state.activeId]);
  }, { indexedDB: new IDBFactory(), url: page(card, view), beforeParse: stub });
  const tab = d => d.querySelector("#fhTabs .view-tab.active").dataset.fhTab;

  {
    section("card-sessions-view-param a. The simulator writes one session per card, deterministic, no banner");
    const names = Object.keys(files);
    assert(["cards/app.log", "cards/filters.session.json", "cards/link.session.json", "cards/patterns.session.json", "cards/plot.session.json"].every(n => names.includes(n)), "card files are in the tour output: " + names);
    const again = Object.fromEntries(TOUR.generateTour().map(f => [f.path, f.text]));
    assert(names.every(k => files[k] === again[k]), "same bytes on every run");
    for (const c of Object.keys(TOUR.CARDS)) {
      const s = JSON.parse(files["cards/" + c + ".session.json"]);
      assert(s.banner === undefined && s.files.length === 1 && s.files[0].url === "app.log" && !s.files[0].logFormat, c + ": one file by relative url, default format, no banner");
    }
  }

  await load("filters", "filtered", async (w, d, T, file, active) => {
    section("card-sessions-view-param b. Filters card: the screenshot's tree, Thread axis-2 active on Filtered");
    assert(file.entries.length === 6000, "cards/app.log has 6000 entries: " + file.entries.length);
    assert(file.children.length === 9, "the nine filters of the scene tree: " + file.children.length);
    assert(active.name === "Thread axis-2" && active.columns.join() === "thread" && w.getEntries(active.id).length > 100, "Thread axis-2 (thread column) is active: " + active.name);
    assert(tab(d) === "filter", "the Filtered tab is shown");
    assert(!isVisible(d.querySelector("#tourBanner"), w), "no tour banner");
  });

  await load("link", "filtered", async (w, d, T, file, active) => {
    section("card-sessions-view-param c. Link card: the Move requested -> Position reached link, Filtered");
    assert(active.filterType === "link" && active.linkKey && active.linkKey.pattern === "job=[*]", "the link node is active");
    const pairs = w.getEntries(active.id).length;
    assert(pairs > 100 && pairs < 1000, "it yields pairs: " + pairs);
    assert(tab(d) === "filter", "Filtered tab");
  });

  await load("patterns", "patterns", async (w, d, T, file, active) => {
    section("card-sessions-view-param d. Patterns card: the file is active on the Patterns tab");
    assert(active.id === file.id, "the file node is active");
    assert(tab(d) === "patterns", "the Patterns tab is shown");
  });

  await load("plot", "plot", async (w, d, T, file, active) => {
    section("card-sessions-view-param e. Plot card: Position active, scatter x/y colored by t, equal axes, on Plot");
    assert(active.name === "Position" && active.plotConfig && active.plotConfig.type === "scatter" && active.plotConfig.axisEqual === true, "Position with its scatter plotConfig");
    assert(tab(d) === "plot", "the Plot tab is shown");
    assert(d.querySelector("#plotTypeRow .active, #plotTypeRow [aria-pressed=true]") !== null || d.querySelector('#plotTypeRow [data-type="scatter"]').className.includes("active"), "the scatter type is selected");
  });

  await load("plot", null, async (w, d, T, file, active) => {
    section("card-sessions-view-param f. Without ?view= the session opens on the default tab; with an unknown value too");
    assert(active.name === "Position" && tab(d) === "filter", "no view param: default Filtered tab, tab: " + tab(d));
  });
  await load("plot", "nonsense", async (w, d, T, file, active) => {
    assert(active.name === "Position" && tab(d) === "filter", "unknown view value is ignored, tab: " + tab(d));
  });
  await load("filters", "plot", async (w, d, T, file, active) => {
    assert(active.name === "Thread axis-2" && tab(d) === "filter", "Plot on a node without an extraction is ignored, tab: " + tab(d));
  });
  await load("filters", "context", async (w, d, T, file, active) => {
    assert(tab(d) === "highlight", "view=context shows the Context tab, tab: " + tab(d));
  });
}
