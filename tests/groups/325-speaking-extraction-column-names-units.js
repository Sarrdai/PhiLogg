// GROUP 325 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* GROUP 325 — speaking extraction column names + units: the word before a
   placeholder names the column, a short unit word after a float/int/hex
   placeholder becomes col.unit, plot axis titles read "name [unit]". */
group(325);
await withApp(async (w, d, T) => {
  section("325a. compileExtractPattern: derived names, stop words, dedupe, fallback, units");
  const cols = pat => w.compileExtractPattern(pat).columns;
  const sensors = cols("Sensor [*:word] temperature=[*:float] C pressure=[*:float] bar voltage=[*:float] V");
  assert(sensors.map(c => c.name).join("|") === "Sensor|temperature|pressure|voltage", "sensors names, got " + sensors.map(c => c.name));
  assert(sensors.map(c => c.unit || "").join("|") === "|C|bar|V", "sensors units, got " + sensors.map(c => c.unit));
  const timing = cols("completed in [*:int]ms");
  assert(timing[0].name === "completed" && timing[0].unit === "ms", "'in' is a stop word; unit glued to the token, got " + JSON.stringify(timing[0]));
  assert(cols("Position update x=[*:float] y=[*:float] z=[*:float]").map(c => c.name).join() === "x,y,z", "x/y/z");
  assert(cols("x=[*:float] x=[*:float]").map(c => c.name).join() === "x,x 2", "dedupe uses the derived base");
  assert(cols("([*:int])")[0].name === "value" && cols("[*:int] items")[0].name === "value", "no word before -> value");
  assert(cols("a ([*:int]) b=[*:int]").map(c => c.name).join() === "value,b", "'(' before a token -> value; later token still named");
  assert(cols("[*] [*]").map(c => c.name).join() === "value,value 2", "fallback dedupes as before");
  assert(cols("in [*:int]")[0].name === "value", "only stop words -> value");
  assert(cols("took [*:time]")[0].unit === undefined && !("unit" in cols("took [*:time] s")[0]), "time gets no unit");
  assert(!("unit" in cols("name=[*:word] abc")[0]), "word gets no unit");
  assert(!("unit" in cols("v=[*:float] items")[0]), "a word longer than 4 chars is no unit");
  assert(!("unit" in cols("v=[*:float] and more")[0]) && !("unit" in cols("v=[*:float] Not")[0]), "unit stop words (and, not, ...) are no unit, case-insensitive");
  assert(cols("v=[*:float]%")[0].unit === "%" && cols("v=[*:float], next")[0].unit === undefined, "% unit; punctuation right after -> none");

  section("325b. simulator sensors: chips, axis title, rename keeps the unit");
  const [file] = LOGSIM.generateToStrings({ format: "default", scenarios: ["sensors"], entries: 60, seed: 3 });
  const f = await w.addFile(file.name, file.text, () => {});
  const node = w.createFilterNode(f.id, "text", "Sensor [*:word] temperature=[*:float] C pressure=[*:float] bar voltage=[*:float] V");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");
  const chips = [...d.querySelectorAll("#extractPatternView .pattern-chip")];
  assert(chips.length === 4 && chips[1].textContent.replace(/\s+/g, " ").includes("temperature C") && chips[0].textContent.includes("Sensor word"), "chips show name + unit/type, got " + chips.map(c => c.textContent));
  assert(chips[1].title.includes("temperature") && chips[1].title.includes("float"), "tooltip keeps name + type");
  w.applyFhView("plot");
  const sel = (id, v) => { const e = d.querySelector(id); e.value = String(v); e.dispatchEvent(new w.Event("change", { bubbles: true })); };
  fireClick(d.querySelector('.plot-type-btn[data-type="scatter"]'), w);
  sel("#plotXSelect", -1);
  sel("#plotYSelectSingle", 1);
  const titles = () => [...d.querySelectorAll("#plotSvg .plot-axis-title")].map(t => t.textContent);
  fireClick(d.querySelector('.plot-type-btn[data-type="line"]'), w);
  const yItem = d.querySelector("#plotYList .plot-y-item input[data-col=\"1\"]").closest("label");
  assert(yItem.textContent.trim() === "temperature C" && yItem.querySelector(".plot-y-unit").textContent === "C", "Y list: plain name + dim unit span, got " + yItem.textContent);
  assert(w.getComputedStyle(yItem).textTransform === "none", "Y list label is not uppercased");
  fireClick(d.querySelector('.plot-type-btn[data-type="scatter"]'), w);
  assert(titles().includes("temperature [C]"), "Y axis title 'temperature [C]', got " + JSON.stringify(titles()));
  assert(T.extractColumns.find(c => c.colIndex === 1).name === "temperature", "table/legend name stays plain");
  w.renameColumn(node, 1, "Temp");
  w.applyFhView("table"); w.applyFhView("plot");
  assert(titles().includes("Temp [C]"), "rename changes the name only, unit stays, got " + JSON.stringify(titles()));
});
