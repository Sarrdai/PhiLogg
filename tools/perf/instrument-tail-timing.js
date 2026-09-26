// Writes a copy of philogg.html that, once loadUrlIntoTree has rendered the
// launch-argument file, times five tailTick() polls with the file unchanged
// ("idle") and then the first poll that finds appended lines ("growth"),
// and stores { idle: [ms…], growth: ms, added: entries } under localStorage
// "philogg-debug-tail" (mirrored into settings.json by the desktop wrapper —
// see instrument-load-timing.js). Scratch output only; used by
// desktop-tail-bench.sh. NEVER commit the output.
//
//   node tools/perf/instrument-tail-timing.js <philogg.html> <out.html>
const fs = require("fs");
const [src, out] = process.argv.slice(2);
let s = fs.readFileSync(src, "utf8");
const anchor = "    state.tailFollow = true;\n  }\n  render();\n}\n";
if (!s.includes(anchor)) { console.error("instrument-tail-timing: anchor not found — loadUrlIntoTree changed, update this script"); process.exit(1); }
s = s.replace(anchor, anchor.replace(/}\n$/, "") + `  (async () => {
    const rec = { idle: [], growth: null };
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const one = async () => { while (node.tail.busy) await wait(5); const t = performance.now(); await tailTick(); return performance.now() - t; };
    for (let i = 0; i < 5; i++) { rec.idle.push(Math.round(await one())); await wait(100); }
    localStorage.setItem("philogg-debug-tail", JSON.stringify(rec));
    const n0 = node.entries.length;
    for (let i = 0; i < 300 && node.entries.length === n0; i++) { const ms = await one(); if (node.entries.length !== n0) rec.growth = Math.round(ms); await wait(100); }
    rec.added = node.entries.length - n0;
    localStorage.setItem("philogg-debug-tail", JSON.stringify(rec));
  })();
}
`);
fs.writeFileSync(out, s);
