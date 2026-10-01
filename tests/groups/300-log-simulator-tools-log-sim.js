// GROUP 300 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* GROUP 300 — Log simulator (tools/log-sim/core.js): every generated format
   parses in the real app to exactly the generated entry count, with its
   exported format definition importable as-is; the mixed format splits
   through a meta format; scenario content feeds the features it names
   (extraction, link pairs, array columns, embedded fragments); output is
   deterministic per seed, size-limited, rotates/parallelizes files, and its
   ZIP writer is readable by the app's ZIP reader. */
group(300);
const logsimLocal = ms => { const x = new Date(ms); return new Date(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate(), x.getUTCHours(), x.getUTCMinutes(), x.getUTCSeconds(), x.getUTCMilliseconds()).getTime(); };
const logsimEntries = (format, n, seed) => { const g = LOGSIM.createGenerator({ format, seed }); return Array.from({ length: n }, () => g.next()); };

await withApp(async (w, d, T) => {
  section("300a. Every format parses to the generated entries: count, time, levels, columns");
  await waitForFormatConfig(T);
  for (const format of ["default", "custom", "bracket", "jsonl", "syslog"]) {
    const [file] = LOGSIM.generateToStrings({ format, entries: 400, seed: 5 });
    const gen = logsimEntries(format, 400, 5);
    const id = "fmt-sim-" + format;
    if (format === "default") assert(LOGSIM.formatExport(format) === null, "the builtin default needs no format import");
    else {
      const parsed = await logsimRegister(w, T, format, id);
      assert(file.name.startsWith("sim-" + format + "-1") && new RegExp("^" + parsed.fileNamePatterns[0].replace(/[.]/g, "\\.").replace(/\*/g, ".*") + "$").test(file.name), format + ": the export's filename glob matches the generated file name");
    }
    const f = await w.addFile(file.name, file.text, () => {});
    const fmtId = format === "default" ? "fmt-default" : id;
    assert(f.formatId === fmtId, format + ": resolved to its format, got " + f.formatId);
    assert(f.entries.length === 400, format + ": 400 entries parsed, got " + f.entries.length);
    assert(f.entries.every((e, i) => e.ts === logsimLocal(gen[i].ts)), format + ": every timestamp parses to the generated wall-clock time");
    assert(f.entries.every((e, i) => i === 0 || f.entries[i - 1].ts <= e.ts), format + ": chronological");
    const other = f.entries.filter(e => w.levelBucket(e.level, e.formatId) === "OTHER").length;
    const expectOther = format === "default" ? gen.filter(e => e.level === "NOTICE" || e.level === "VERBOSE").length : 0;
    assert(other === expectOther, format + ": " + expectOther + " OTHER-level entries expected, got " + other);
    const multi = f.entries.filter(e => e.message.includes("\n")).length;
    if (format !== "jsonl") assert(multi === gen.filter(e => e.cont).length && multi > 0, format + ": continuation lines stay with their entry (" + multi + ")");
    f.entries.forEach((e, i) => { if (e.message.split("\n")[0] !== gen[i].msg && format !== "jsonl") throw new Error(format + " message mismatch at " + i + ": " + e.message); });
  }
  const byFmt = id => T.state.rootIds.map(r => T.state.nodes[r]).find(n => n.formatId === id);
  const custom = byFmt("fmt-sim-custom");
  assert(custom.entries.every(e => e.fields.tenant && e.fields.requestId && e.fields.user && e.thread && e.method), "custom: requestId/user/tenant custom columns + thread/method filled");
  assert(custom.entries.some(e => /^r-[0-9a-f]{6}$/.test(e.fields.requestId)), "custom: some entries carry a request id");
  const json = byFmt("fmt-sim-jsonl");
  assert(json.entries.some(e => e.fields.pos_x && e.fields.pos_z) && json.entries.some(e => /^\[[\d.,]+\]$/.test(e.fields.spectrum || "")), "jsonl: nested pos.* and the spectrum array land in columns");
  assert(json.entries.some(e => e.fields.http_status) && json.entries.some(e => (e.fields.exception || "").includes("\n")), "jsonl: literal dotted key and multi-line exception text");
  assert(json.entries.every(e => e.fields.thread_ && e.fields.ctx_tenant), "jsonl: thread/ctx.tenant on every entry");
  const sys = byFmt("fmt-sim-syslog");
  const sysLevels = new Set(sys.entries.map(e => w.levelBucket(e.level, e.formatId)));
  assert(["FATAL", "ERROR", "WARN", "NOTICE", "INFO", "DEBUG"].every(l => sysLevels.has(l)), "syslog: numeric PRI codes map to named levels, got " + [...sysLevels].join(","));
  assert(sys.entries.every(e => e.fields.host === "shop-01" && e.fields.msgid), "syslog: host/msgid custom columns");
});

await withApp(async (w, d, T) => {
  section("300b. Mixed format: default + syslog lines split through a meta format");
  await waitForFormatConfig(T);
  await logsimRegister(w, T, "mixed", "fmt-sim-syslog");
  const meta = { id: "fmt-sim-meta", name: "Sim meta", mode: "meta", targetFormatIds: ["fmt-sim-syslog", "fmt-default"], builtin: false, edited: false, createdAt: 0 };
  T.state.logFormats.push(meta);
  const [file] = LOGSIM.generateToStrings({ format: "mixed", entries: 300, seed: 9 });
  const gen = logsimEntries("mixed", 300, 9);
  const merged = await w.loadMetaFormatText(file.name, file.text, meta);
  assert(merged.entries.length === 300, "300 entries across both grammars, got " + merged.entries.length);
  const sysCount = gen.filter(e => e.scenario === "sensors" || e.scenario === "position").length;
  const src = merged.sources.find(s => s.name === "Simulator: RFC 5424 syslog");
  assert(merged.sources.length === 2 && src && src.count === sysCount, "syslog source holds the " + sysCount + " telemetry entries, got " + (src && src.count));
});

await withApp(async (w, d, T) => {
  section("300c. Scenario content feeds the features it names");
  const gen = logsimEntries("default", 3000, 11);
  const [file] = LOGSIM.generateToStrings({ format: "default", entries: 3000, seed: 11 });
  const f = await w.addFile(file.name, file.text, () => {});
  const count = pat => { const s = w.compileExtractPattern(pat); return f.entries.filter(e => w.wildcardMatch(s.regex, s.columns, e.message)).length; };
  assert(count("Position update x=[*:float] y=[*:float] z=[*:float]") === gen.filter(e => e.scenario === "position").length, "position: the 3D extraction pattern matches every position entry");
  assert(count("temperature=[*:float>85]") > 0 && count("temperature=[*:float>85]") < count("temperature=[*:float]"), "sensors: a value condition finds the rare spikes only");
  assert(count("completed in [*:time]") > 0 && count("started at [*:time]") > 0, "timing: durations and clock times match [*:time]");
  const reqs = gen.filter(e => /^Move requested/.test(e.msg)), reached = gen.filter(e => /^Position reached/.test(e.msg));
  const byJob = new Map(reqs.map(e => [/job=(\S+)/.exec(e.msg)[1], e]));
  assert(reached.length > 10 && reached.every(e => { const r = byJob.get(/job=(\S+)/.exec(e.msg)[1]); return r && r.thread === e.thread && e.ts - r.ts >= 50 && e.ts - r.ts <= 4000; }),
    "motion: every 'Position reached' follows its request on the same axis thread within 50 ms-4 s");
  assert(reached.length < reqs.length, "motion: some requests stay unpaired (aborted)");
  const spec = w.compileExtractPattern("bins=[*]");
  const bins = f.entries.map(e => w.wildcardMatch(spec.regex, spec.columns, e.message)).filter(Boolean).map(m => w.parseArrayCell(m[1]));
  assert(bins.length > 0 && bins.every(a => a && a.length === 16 && a.every(v => typeof v === "number")), "arrays: every bins capture is a 16-number array column value");
  const types = new Set(gen.filter(e => e.scenario === "embedded").flatMap(e => w.findEmbeddedFragments(e.msg + (e.cont ? "\n" + e.cont.join("\n") : "")).map(h => h.type)));
  assert(["xml", "json", "dump"].every(t => types.has(t)), "embedded: XML, JSON and .NET dump fragments are detected, got " + [...types].join(","));
  const groups = new Set(gen.filter(e => e.scenario === "ids").map(e => w.normalizeMessagePattern(e.msg)));
  assert(groups.size <= 5, "ids: GUID/IP/hex/URL messages collapse into their 5 shapes in the Patterns tab, got " + groups.size + ": " + [...groups].map(k => w.patternDisplayText(k)).join(" | "));
  let maxGap = 0;
  for (let i = 1; i < gen.length; i++) maxGap = Math.max(maxGap, gen[i].ts - gen[i - 1].ts);
  assert(maxGap >= 5000, "gaps: at least one idle gap of >= 5 s, max was " + maxGap);
  assert(!LOGSIM.normalizeScenarios("all").includes("tuples") && LOGSIM.normalizeScenarios("tuples").join() === "tuples", "tuples: opt-in, never part of 'all'");
  const tup = logsimEntries2("default", ["tuples"], 400, 3);
  const phrases = ["Probe offset (xo, yo, zo): (", "Probe offset (xo, yo, zo)=(", "Camera center [cx; cy] -> [", "Stage {a/b}={", "Laser xs, ys: ", "Fiducial <u, v> = <",
    "Probe offset (xo, yo, zo) [mm]: (", "Tool tip (tx, ty) = (", "Scan pos xs, ys, zs: ", "Gantry (gx gy gz) = (", "Head (hx hy) [px]: "];
  assert(phrases.every(ph => tup.some(e => e.msg.startsWith(ph))), "tuples: every message shape occurs in 400 entries");
  assert(tup.every(e => e.scenario === "tuples" && Array.isArray(e.json.values)), "tuples: every entry carries its json payload");
});

await withApp(async (w, d, T) => {
  section("300d. Determinism, size limit, multi-file layouts, plain text, ZIP round trip");
  const a = LOGSIM.generateToStrings({ entries: 200, seed: 4 })[0].text;
  assert(a === LOGSIM.generateToStrings({ entries: 200, seed: 4 })[0].text && a !== LOGSIM.generateToStrings({ entries: 200, seed: 5 })[0].text, "same seed -> same bytes, other seed -> other bytes");
  const sized = LOGSIM.generateToStrings({ size: "20k", seed: 2 })[0];
  assert(sized.bytes >= 20480 && sized.bytes < 20480 + 5000 && Buffer.byteLength(sized.text) === sized.bytes, "size limit: stops right after 20 KB (" + sized.bytes + " bytes, counted as UTF-8)");
  const crlf = LOGSIM.generateToStrings({ entries: 20, eol: "\r\n" })[0].text;
  assert(crlf.split("\r\n").length === crlf.split("\n").length, "CRLF endings on every line");
  const rot = LOGSIM.generateToStrings({ files: 3, entries: 50, seed: 3 });
  const first = t => w.parseHeaderLine(t.split("\n")[0]).ts, last = t => w.parseHeaderLine(t.trimEnd().split("\n").filter(l => /^\d{4}-/.test(l)).pop()).ts;
  assert(rot.map(r => r.name).join(",") === "sim-default-1.log,sim-default-2.log,sim-default-3.log" && last(rot[0].text) <= first(rot[1].text) && last(rot[1].text) <= first(rot[2].text), "rotate: one timeline continued across the files");
  const par = LOGSIM.generateToStrings({ files: 2, entries: 50, layout: "parallel", skew: 60000 });
  assert(first(par[1].text) - first(par[0].text) > 50000 && par[0].text.includes("\\Shop\\") && par[1].text.includes("\\Billing\\"), "parallel: own service per file, clock skew applied");
  const plain = LOGSIM.generateToStrings({ format: "plain", entries: 100, seed: 6 })[0];
  assert(plain.name.endsWith(".txt") && !/^\d{4}-/m.test(plain.text) && plain.text.trimEnd().split("\n").length >= 100, "plain: timestamp-free text lines");
  const enc = new TextEncoder();
  const zip = LOGSIM.zipStore(rot.map(r => ({ name: "logs/" + r.name, data: enc.encode(r.text) })));
  const entries = await w.readZipEntries(new w.File([zip], "sim.zip"));
  assert(entries.length === 3 && entries.every(e => e.compressionMethod === 0) && entries[1].name === "logs/sim-default-2.log", "the app lists the simulator's ZIP entries");
  assert(new TextDecoder().decode(await entries[2].extract()) === rot[2].text, "a stored entry extracts byte-for-byte");
});

await withApp(async (w, d, T) => {
  section("300e. Document formats: one valid minified JSON document, one well-formed XML document");
  const [j] = LOGSIM.generateToStrings({ format: "jsondoc", entries: 60, seed: 4 });
  const doc = JSON.parse(j.text);
  assert(j.name === "sim-jsondoc-1.json" && !j.text.includes("\n") && doc.entries.length === 60 && j.entries === 60, "jsondoc: a single-line, valid JSON document with 60 entries");
  assert(doc.entries.some(e => e.data && typeof e.data === "object" && Object.keys(e.data).length), "jsondoc: scenario payloads appear as nested data");
  assert(w.prettyPrintedJsonOrNull(j.text).split("\n").length > 100, "jsondoc: pretty printing expands it to many lines");
  assert(j.text === LOGSIM.generateToStrings({ format: "jsondoc", entries: 60, seed: 4 })[0].text, "jsondoc: deterministic per seed");
  const [x] = LOGSIM.generateToStrings({ format: "xmldoc", entries: 60, seed: 4 });
  const xd = new w.DOMParser().parseFromString(x.text, "application/xml");
  assert(x.name.endsWith(".xml") && !xd.querySelector("parsererror") && xd.documentElement.nodeName === "log" && xd.querySelectorAll("entry").length === 60, "xmldoc: well-formed, 60 <entry> elements");
  assert(x.text.split("\n").filter(l => l.startsWith("  <entry ")).length === 60, "xmldoc: every entry starts on its own line");
  assert(LOGSIM.formatExport("jsondoc") === null && LOGSIM.formatExport("xmldoc") === null, "document formats need no format import");
});
