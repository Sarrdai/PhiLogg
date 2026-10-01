// GROUP 327 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* GROUP 327 — tuple-style messages: a name list paired positionally with a
   value list gives the extraction columns their names (and group units).
   Data: log-sim's opt-in "tuples" scenario. */
group(327);
await withApp(async (w, d, T) => {
  section("327a. every simulator shape compiles to the expected names and units");
  const nu = pat => w.compileExtractPattern(pat).columns.map(c => c.name + (c.unit ? "[" + c.unit + "]" : "")).join(",");
  const cases = [
    ["Probe offset (xo, yo, zo): ([*:float] , [*:float], [*:float])", "xo,yo,zo"],
    ["Probe offset (xo, yo, zo)=([*:float]mm , [*:float]mm, [*:float]mm)", "xo[mm],yo[mm],zo[mm]"],
    ["Camera center [cx; cy] -> [[*:float]px; [*:float]px]", "cx[px],cy[px]"],
    ["Stage {a/b}={[*:int]/[*:int]}", "a,b"],
    ["Laser xs, ys: [*:float]mu, [*:float]mu", "xs[mu],ys[mu]"],
    ["Fiducial <u, v> = <[*:float] m, [*:float] m>", "u[m],v[m]"],
    ["Probe offset (xo, yo, zo) [mm]: ([*:float], [*:float], [*:float])", "xo[mm],yo[mm],zo[mm]"],
    ["Tool tip (tx, ty) = ([*:float], [*:float]) mm", "tx[mm],ty[mm]"],
    ["Scan pos xs, ys, zs: [*:float], [*:float], [*:float] \u00b5m", "xs[\u00b5m],ys[\u00b5m],zs[\u00b5m]"],
    ["Gantry (gx gy gz) = ([*:float] [*:float] [*:float])", "gx,gy,gz"],
    ["Head (hx hy) [px]: [*:float] [*:float]", "hx[px],hy[px]"],
  ];
  cases.forEach(([pat, want]) => assert(nu(pat) === want, pat + " -> " + want + ", got " + nu(pat)));

  section("327b. variations, group-unit priority, guards");
  assert(nu("(xo, yo, zo) (mm): ([*:float], [*:float], [*:float])") === "xo[mm],yo[mm],zo[mm]", "(mm) group unit after the names");
  assert(nu("(xo, yo, zo) {mm}: ([*:float], [*:float], [*:float])") === "xo[mm],yo[mm],zo[mm]", "{mm} group unit after the names");
  assert(nu("(xo, yo)=([*:float], [*:float])mm") === "xo[mm],yo[mm]", "unit glued to the closing bracket");
  assert(nu("(xo, yo, zo) [mm]: ([*:float]\u00b5m, [*:float], [*:float])") === "xo[\u00b5m],yo[mm],zo[mm]", "a token's own unit beats the group unit");
  assert(nu("xs, ys: [*:float], [*:float]mm") === "xs[mm],ys[mm]" , "unbracketed list: a unit on the last token only applies to all");
  assert(nu("xs, ys: [*:float]mm, [*:float] px") === "xs[mm],ys[px]", "own units on several tokens: no group unit");
  assert(nu("(xo, yo): ([*:float], [*:float], [*:float])") === "value,value 2,value 3", "count mismatch: no pairing, fallback names");
  assert(nu("(a, b, c): ([*:float], [*:float]; [*:float])") === "value,value 2,value 3", "mixed separators in the value list: no pairing");
  assert(nu("(a; b, c): ([*:float], [*:float], [*:float])") === "value,value 2,value 3", "mixed separators in the name list: no pairing");
  assert(nu("pos=[*:int] (xo, yo): ([*:float], [*:float])") === "pos,xo,yo", "a token outside the list keeps the word-before rule");
  assert(nu("Queue depth: [*:int] [*:int]") === "depth,value", "a space-separated sentence is not a name list");
  assert(nu("xs ys: [*:float] [*:float]") === "ys,value", "space-separated names need brackets");
  assert(nu("(xo, yo): ([*:float], [*:float] and more") === "xo,yo" , "a missing closing bracket is fine");
  assert(nu("(xo, yo): ([*:float], [*:float]]") === "value,value 2", "a wrong closing bracket cancels the pairing");
  assert(nu("x=[*:float] x=[*:float]") === "x,x 2", "ordinary patterns keep the word-before rule and dedupe");
  assert(nu("(x, x): ([*:int], [*:int])") === "x,x 2", "dedupe applies to tuple names too");
  assert(nu("temperature=[*:float] C pressure=[*:float] bar") === "temperature[C],pressure[bar]", "non-tuple units unchanged");
  assert(nu("v=[*:float] and more") === "v", "unit stop words still hold");

  section("327c. end to end on simulator output: names, chips, plot axis title");
  const [file] = LOGSIM.generateToStrings({ format: "default", scenarios: ["tuples", "basic"], entries: 600, seed: 5 });
  const f = await w.addFile(file.name, file.text, () => {});
  const node = w.createFilterNode(f.id, "text", "Probe offset (xo, yo, zo)=([*:float]mm , [*:float]mm, [*:float]mm)");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");
  assert(T.extractRowsData.length > 3, "the tuple shape matches simulator entries, got " + T.extractRowsData.length);
  assert(T.extractColumns.filter(c => c.colIndex >= 0).map(c => c.name).join() === "xo,yo,zo", "table columns named xo,yo,zo");
  const chips = [...d.querySelectorAll("#extractPatternView .pattern-chip")].map(c => c.textContent.replace(/\s+/g, " ").trim());
  assert(chips[0].includes("xo mm"), "chip shows name and unit, got " + chips.join("|"));
  w.applyFhView("plot");
  fireClick(d.querySelector('.plot-type-btn[data-type="scatter"]'), w);
  const sel = (id, v) => { const e = d.querySelector(id); e.value = String(v); e.dispatchEvent(new w.Event("change", { bubbles: true })); };
  sel("#plotXSelect", 0);
  sel("#plotYSelectSingle", 1);
  const titles = [...d.querySelectorAll("#plotSvg .plot-axis-title")].map(t => t.textContent);
  assert(titles.includes("xo [mm]") && titles.includes("yo [mm]"), "plot axis titles 'xo [mm]' / 'yo [mm]', got " + JSON.stringify(titles));
});
