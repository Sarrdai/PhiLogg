// GROUP patterns-extract-constant-num — Patterns "Extract" turns an identifier-suffix number
// ("v<#>" that is 2 in every entry) back into literal text; free-standing and varying numbers stay captures.
// Origin: 2026-10-06 usability round E1.
group("patterns-extract-constant-num");

if (groupSelected()) {
  const TOUR = require(path.join(__dirname, "..", "tools", "log-sim", "tour.js"));
  const tourLog = TOUR.demoLog();

  await withApp(async (w, d, T) => {
    section("patterns-extract-constant-num a. v2 is frozen, other numbers stay captures");
    const f = await w.addFile("app.log", tourLog, () => {});
    T.state.activeId = f.id;
    const res = T.patternsAnalysis(f.id).result;
    const get = res.groups.find(g => g.key.startsWith("GET https://api.example.com/v"));
    assert(get && get.count >= 2, "sanity: the GET pattern group exists");
    w.applyPatternAction(get, "extract");
    let node = T.state.nodes[T.state.activeId];
    assert(node.value === "GET https://api.example.com/v2/orders/[*:int] -> [*:int] ([*:int] ms)", "got: " + node.value);

    section("patterns-extract-constant-num b. a glued number that varies stays a capture");
    T.state.activeId = f.id;
    const sensor = res.groups.filter(g => g.key.startsWith("Sensor T")).sort((a, b) => b.count - a.count)[0];
    assert(sensor, "sanity: the Sensor pattern group exists");
    w.applyPatternAction(sensor, "extract");
    node = T.state.nodes[T.state.activeId];
    assert(node.value.startsWith("Sensor T[*:int] temperature="), "T<#> varies, got: " + node.value);

    section("patterns-extract-constant-num c. plain filter keeps [*]; a single-entry group freezes nothing");
    T.state.activeId = f.id;
    w.applyPatternAction(get, "filter");
    node = T.state.nodes[T.state.activeId];
    assert(node.value === "GET https://api.example.com/v[*]/orders/[*] -> [*] ([*] ms)", "filter value, got: " + node.value);
    const one = await w.addFile("one.log", "2026-01-15 08:00:00,000\tINFO\tx\tf\t1\tm\tload v2 done\n", () => {});
    T.state.activeId = one.id;
    const g1 = T.patternsAnalysis(one.id).result.groups[0];
    assert(g1 && g1.count === 1, "sanity: one-entry group");
    w.applyPatternAction(g1, "extract");
    node = T.state.nodes[T.state.activeId];
    assert(node.value.includes("v[*:int]"), "one match proves nothing, got: " + node.value);
  });
}
