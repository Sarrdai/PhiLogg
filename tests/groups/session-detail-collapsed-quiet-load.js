// GROUP session-detail-collapsed-quiet-load — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP session-detail-collapsed-quiet-load — homepage card deep links open like their screenshot
   Origin: 2026-10-07 (FEATURE_BACKLOG #112). The optional top-level session-file
   field `detailCollapsed: true` collapses the Entry detail panel after the load
   (the filters/link/plot card sessions set it, like their scenes; patterns does
   not), and a ?session= load that skipped nothing and has no bookmarks/notes shows no
   "Session: N files loaded" summary toast (skips, bookmarks, notes still toast; #114). Data: the simulator's tour output.
   ============================================================ */
group("session-detail-collapsed-quiet-load");
if (groupSelected()) {
  const TOUR = require(path.join(__dirname, "..", "tools", "log-sim", "tour.js"));
  const files = Object.fromEntries(TOUR.generateTour().map(f => [f.path, f.text]));
  const BASE = "http://tour.example/t/";
  const stub = extra => win => {
    win.fetch = async u => {
      const text = extra && extra[u] !== undefined ? extra[u] : files[u.replace(BASE, "")];
      if (text === undefined) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0), text: async () => "" };
      return { ok: true, status: 200, arrayBuffer: async () => new win.TextEncoder().encode(text).buffer, text: async () => text };
    };
  };
  const url = session => "http://localhost/philogg.html?session=" + encodeURIComponent(session);
  const load = (session, check, extra) => withApp(async (w, d, T) => {
    await T.bootRestore;
    await waitFor(() => T.state.rootIds.length >= 1 && T.state.nodes[T.state.rootIds[0]].entries && T.state.nodes[T.state.rootIds[0]].entries.length > 0);
    await sleep(60);
    await check(w, d, T);
  }, { indexedDB: new IDBFactory(), url: url(session), beforeParse: stub(extra) });
  const toast = d => d.querySelector("#copyToast").textContent;

  {
    section("session-detail-collapsed-quiet-load a. The simulator sets detailCollapsed on the filters/link/plot cards only");
    for (const c of ["filters", "link", "plot"]) assert(JSON.parse(files["cards/" + c + ".session.json"]).detailCollapsed === true, c + " card session collapses the detail panel");
    assert(JSON.parse(files["cards/patterns.session.json"]).detailCollapsed === undefined, "patterns card session leaves it alone (scene 09)");
  }

  for (const c of ["filters", "link", "plot"]) {
    await load(BASE + "cards/" + c + ".session.json", async (w, d) => {
      section("session-detail-collapsed-quiet-load b. " + c + " card: panel collapsed, no summary toast");
      assert(w.isDetailCollapsed(), "the Entry detail panel is collapsed");
      assert(!/Session:/.test(toast(d)), "no summary toast for a clean ?session= load, got: " + toast(d));
    });
  }
  await load(BASE + "cards/patterns.session.json", async (w, d) => {
    section("session-detail-collapsed-quiet-load c. patterns card: panel stays expanded (default), no toast");
    assert(!w.isDetailCollapsed(), "the detail panel is expanded");
    assert(!/Session:/.test(toast(d)), "no summary toast, got: " + toast(d));
  });

  {
    const doc = JSON.parse(files["cards/filters.session.json"]);
    doc.files.push({ exportId: "gone", name: "gone.log", url: "missing.log", merged: false, filters: [], bookmarks: [], notes: [], clockOffset: 0 });
    await load(BASE + "cards/x.session.json", async (w, d) => {
      section("session-detail-collapsed-quiet-load d. A skipped record still toasts, and detailCollapsed still applies");
      assert(/1 file loaded/.test(toast(d)) && /1 skipped/.test(toast(d)), "summary toast with the skip, got: " + toast(d));
      assert(w.isDetailCollapsed(), "the panel is collapsed");
    }, { [BASE + "cards/x.session.json"]: JSON.stringify(doc) });
  }

  // GROUP extension (2026-10-07, FEATURE_BACKLOG #114): bookmarks or notes in the session keep the summary toast.
  for (const [kind, field, rec, re] of [
    ["bookmarks", "bookmarks", { ordinal: 3, ts: 0, raw: "" }, /Session: 1 file loaded, \d+ of 1 bookmark placed/],
    ["notes", "notes", { ordinal: 4, ts: 0, raw: "", text: "look here" }, /Session: 1 file loaded, \d+ of 1 note placed/],
  ]) {
    const doc = JSON.parse(files["cards/filters.session.json"]);
    doc.files[0][field] = [rec];
    await load(BASE + "cards/x.session.json", async (w, d) => {
      section("session-detail-collapsed-quiet-load e. A fresh load with " + kind + " still toasts the placed detail");
      assert(re.test(toast(d)), "summary toast names the placed " + kind + ", got: " + toast(d));
      assert(w.isDetailCollapsed(), "detailCollapsed still applies");
    }, { [BASE + "cards/x.session.json"]: JSON.stringify(doc) });
  }
}
