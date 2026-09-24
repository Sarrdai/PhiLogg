// CPU profile of philogg.html's render() for a large file, in jsdom — finds
// what a render spends its time on without any webview. See
// docs/performance-testing.md.
//
//   cd tests && NODE_PATH=$PWD/node_modules node --max-old-space-size=8000 \
//     ../tools/perf/render-profile.js <log-file>
//
// Loads the file with addFile (the JS parser — jsdom has no Worker), times
// the load and two warm render()s broken down by the top-level render
// steps, then prints the hottest functions (self and inclusive) of two more
// renders. Line numbers in the profile are relative to the inline <script>
// (add that tag's line in philogg.html). jsdom-only costs to discount:
// querySelectorAll (updateRowActionButtons) is far slower here than in a
// browser.
const { JSDOM } = require("jsdom");
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const inspector = require("inspector");

const html = fs.readFileSync(path.join(__dirname, "..", "..", "philogg.html"), "utf8");
const m = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop();
const dom = new JSDOM(html.replace(m[0], "<script></script>"), {
  runScripts: "dangerously", pretendToBeVisual: true, url: "http://localhost/",
  beforeParse(w) {
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    Object.defineProperty(w.Element.prototype, "clientHeight", { get() { return 800; } });
    Object.defineProperty(w.Element.prototype, "clientWidth", { get() { return 1200; } });
  },
});
new vm.Script(m[1]).runInContext(dom.getInternalVMContext());
const w = dom.window;

// Global function declarations are window properties, and the page's own
// calls resolve through them — so wrapping them here times the real calls.
const times = {};
for (const name of ["render", "renderTree", "renderLevelBar", "renderMainView", "renderTimelineMinimap"]) {
  const orig = w[name];
  w[name] = function (...a) {
    const t = performance.now();
    try { return orig.apply(this, a); } finally { times[name] = (times[name] || 0) + performance.now() - t; }
  };
}
const report = label => {
  console.log(label);
  for (const k in times) { console.log("   " + k.padEnd(22) + Math.round(times[k]) + " ms"); delete times[k]; }
};

(async () => {
  await new Promise(r => setTimeout(r, 500));
  const text = fs.readFileSync(process.argv[2], "utf8");
  let t = performance.now();
  const node = await w.addFile(path.basename(process.argv[2]), text);
  console.log("addFile (parse + load render): " + Math.round(performance.now() - t) + " ms, " + node.entries.length + " entries");
  report("  of which:");
  for (const label of ["warm render #1", "warm render #2"]) {
    t = performance.now(); w.render();
    console.log(label + ": " + Math.round(performance.now() - t) + " ms");
    report("  of which:");
  }

  const session = new inspector.Session();
  session.connect();
  const post = (msg, params) => new Promise((res, rej) => session.post(msg, params || {}, (e, r) => (e ? rej(e) : res(r))));
  await post("Profiler.enable");
  await post("Profiler.setSamplingInterval", { interval: 100 });
  await post("Profiler.start");
  w.render(); w.render();
  const { profile } = await post("Profiler.stop");
  const byId = new Map(profile.nodes.map(n => [n.id, n]));
  const parent = new Map();
  profile.nodes.forEach(n => (n.children || []).forEach(c => parent.set(c, n.id)));
  const key = n => (n.callFrame.functionName || "(anonymous)") + " :" + n.callFrame.lineNumber;
  const self = {}, incl = {};
  profile.samples.forEach((id, i) => {
    const dt = profile.timeDeltas[i] || 0;
    self[key(byId.get(id))] = (self[key(byId.get(id))] || 0) + dt;
    const seen = new Set();
    for (let cur = id; cur; cur = parent.get(cur)) {
      const k = key(byId.get(cur));
      if (!seen.has(k)) { incl[k] = (incl[k] || 0) + dt; seen.add(k); }
    }
  });
  // The inspector's own `post` frame and V8's idle/program buckets are the
  // profiler waiting, not the page.
  const noise = k => /^(post|\(idle\)|\(program\)|\(root\)) :/.test(k);
  const top = (o, n) => Object.entries(o).filter(([k]) => !noise(k)).sort((a, b) => b[1] - a[1]).slice(0, n)
    .forEach(([k, v]) => console.log("   " + String(Math.round(v / 1000)).padStart(6) + " ms  " + k));
  console.log("profile of two warm renders — self time:"); top(self, 15);
  console.log("inclusive:"); top(incl, 30);
  process.exit(0);
})();
