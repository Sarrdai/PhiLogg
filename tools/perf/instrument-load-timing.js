// Writes a copy of philogg.html with load-time measurement patched into
// loadUrlIntoTree (the launch-argument / file-association route — the one
// route a headless run can drive). NEVER commit the output; it's a scratch
// copy placed next to the desktop binary by desktop-load-bench.sh.
//
//   node tools/perf/instrument-load-timing.js <philogg.html> <out.html>
//
// What it adds:
// - wall time from loadUrlIntoTree's start until its final render() has
//   run, and how many render() calls happened in between;
// - written to localStorage "philogg-debug-timing" — every philogg-* key is
//   mirrored into settings.json by the desktop wrapper (inject.js, once a
//   second), which is the only way out of a headless webview: no devtools,
//   no console on stdout;
// - a URL containing "nonative" skips the native parser, so the same build
//   measures the old JS path too (name the copied log file accordingly).
const fs = require("fs");
const [src, out] = process.argv.slice(2);
let s = fs.readFileSync(src, "utf8");
function patch(anchor, replacement) {
  if (!s.includes(anchor)) {
    console.error("instrument-load-timing: anchor not found — loadUrlIntoTree changed, update this script:\n" + anchor);
    process.exit(1);
  }
  s = s.replace(anchor, replacement);
}
patch("async function loadUrlIntoTree(url) {",
  "async function loadUrlIntoTree(url) {\n" +
  "  const PERF_T0 = performance.now(); let PERF_R = 0; const PERF_RENDER = render;\n" +
  "  render = function () { PERF_R++; return PERF_RENDER.apply(this, arguments); };");
patch("  if (canParseNatively(urlTailHandle(url))", "  if (!/nonative/.test(url) && canParseNatively(urlTailHandle(url))");
patch("    state.tailFollow = true;\n  }\n  render();\n}\n",
  "    state.tailFollow = true;\n  }\n  render();\n  render = PERF_RENDER;\n" +
  "  localStorage.setItem(\"philogg-debug-timing\", JSON.stringify({ ms: Math.round(performance.now() - PERF_T0), renders: PERF_R, entries: node.entries.length }));\n}\n");
fs.writeFileSync(out, s);
