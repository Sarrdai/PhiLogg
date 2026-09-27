#!/usr/bin/env node
// Headless front end of the PhiLogg log simulator (engine: ./core.js).
// Run with --help for usage; --list prints every format and scenario with
// the PhiLogg features it exercises. See tools/log-sim/README.md.
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const sim = require("./core.js");

const HELP = `PhiLogg log simulator — writes sample logs for every PhiLogg feature.

Usage: node tools/log-sim/cli.js [options]

Content
  -f, --format <name>      ${Object.keys(sim.FORMATS).join(" | ")} (default: default)
  -s, --scenarios <list>   comma list, "all" (default) or "all,-gaps,-text"
      --seed <n>           PRNG seed; same seed + options = same bytes (default 1)
      --start <time>       first timestamp, e.g. 2026-01-15T08:00:00 (default)
      --rate <n>           average entries per second of log time (default 10)
      --crlf               CRLF line endings

Amount (per file)
  -n, --entries <n>        number of entries (default 1000 when --size is absent)
      --size <size>        approximate file size, e.g. 500k, 20MB, 1.5GB

Output
  -o, --out <path>         file (single file), directory (--files > 1) or .zip
                           path (--zip). Omitted: single file to stdout.
      --prefix <name>      file name prefix (default sim-<format>)
      --files <n>          number of files (default 1)
      --layout <mode>      rotate: one timeline split across files (folder watch)
                           parallel: one service per file, same time range (merge)
      --skew <ms>          parallel only: clock offset added per file index
      --gzip               gzip every file (.gz appended)
      --zip                bundle all files into one ZIP (-o must end in .zip)
      --no-format-file     don't write the <prefix>.logformat.json next to the
                           output (written for formats PhiLogg can't parse unaided)
      --format-json        print the format's PhiLogg import JSON to stdout, exit

Live mode (tailing)
      --follow             append in real time instead of generating at once
      --interval <ms>      average delay between entries (default 500)
      --jitter <pct>       randomize the delay by ±pct (default 40)
      --rotate-lines <n>   start the next file after n entries (folder watch)
      --duration <s>       stop after s seconds (default: until Ctrl+C)

Info
      --list               list formats and scenarios with feature hints
  -q, --quiet              no summary on stderr
  -h, --help
`;

function parseArgs(argv) {
  const alias = { f: "format", s: "scenarios", n: "entries", o: "out", q: "quiet", h: "help" };
  const flags = new Set(["gzip", "zip", "crlf", "list", "quiet", "help", "follow", "format-json", "no-format-file"]);
  const valued = new Set(["format", "scenarios", "entries", "out", "seed", "start", "rate", "size", "prefix", "files", "layout", "skew",
    "interval", "jitter", "rotate-lines", "duration"]);
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    let k = argv[i];
    if (!k.startsWith("-")) throw new Error("Unexpected argument '" + k + "'");
    let v = null;
    k = k.replace(/^--?/, "");
    const eq = k.indexOf("=");
    if (eq >= 0) { v = k.slice(eq + 1); k = k.slice(0, eq); }
    k = alias[k] || k;
    if (!flags.has(k) && !valued.has(k)) throw new Error("Unknown option --" + k + " (see --help)");
    if (flags.has(k)) { a[k] = true; continue; }
    if (v == null) {
      if (i + 1 >= argv.length) throw new Error("Missing value for --" + k);
      v = argv[++i];
    }
    a[k] = v;
  }
  return a;
}

function listAll() {
  const out = ["FORMATS"];
  for (const [k, f] of Object.entries(sim.FORMATS)) out.push("  " + k.padEnd(9) + f.label + " (" + f.ext + ")", "           " + f.hint);
  out.push("", "SCENARIOS (default: all)");
  for (const [k, s] of Object.entries(sim.SCENARIOS)) out.push("  " + k.padEnd(11) + s.label, "             " + s.hint);
  return out.join("\n") + "\n";
}

function genOptions(a) {
  const o = {
    format: a.format || "default",
    scenarios: a.scenarios || "all",
    seed: a.seed != null ? +a.seed : 1,
    start: a.start || sim.DEFAULTS.start,
    rate: a.rate != null ? +a.rate : sim.DEFAULTS.rate,
    eol: a.crlf ? "\r\n" : "\n",
    files: a.files != null ? +a.files : 1,
    layout: a.layout || "rotate",
    skew: a.skew != null ? +a.skew : 0,
    prefix: a.prefix || null,
  };
  if (!sim.FORMATS[o.format]) throw new Error("Unknown format '" + o.format + "' (see --list)");
  o.scenarios = sim.normalizeScenarios(o.scenarios);
  if (o.layout !== "rotate" && o.layout !== "parallel") throw new Error("--layout must be rotate or parallel");
  if (a.entries != null) o.entries = +a.entries;
  if (a.size != null) {
    o.size = sim.parseSize(a.size);
    if (isNaN(o.size)) throw new Error("Invalid --size '" + a.size + "' (e.g. 500k, 20MB)");
  }
  return o;
}

function human(bytes) {
  return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : bytes >= 1024 ? (bytes / 1024).toFixed(1) + " KB" : bytes + " B";
}

function writeFormatFile(o, dir, log) {
  const prefix = o.prefix || "sim-" + o.format;
  const doc = sim.formatExport(o.format, prefix);
  if (!doc) return;
  const p = path.join(dir, prefix + ".logformat.json");
  fs.writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
  log("format definition: " + p + "  (PhiLogg: Open -> Import..., or drop it onto the window)");
}

async function writeBatch(a, o, log) {
  const summary = [];
  const toStdout = !a.out;
  if (toStdout && (o.files > 1 || a.zip)) throw new Error("--files > 1 and --zip need -o/--out");
  if (a.zip && !/\.zip$/i.test(a.out)) throw new Error("--zip needs an -o path ending in .zip");
  const dirMode = !toStdout && !a.zip && (o.files > 1 || /[\\/]$/.test(a.out) || (fs.existsSync(a.out) && fs.statSync(a.out).isDirectory()));
  if (!toStdout && !a.zip && o.files === 1 && !dirMode) o.singleName = path.basename(a.out);
  const outDir = toStdout ? null : a.zip ? path.dirname(a.out) : dirMode ? a.out : path.dirname(a.out);
  if (outDir) fs.mkdirSync(outDir, { recursive: true });

  const zipFiles = [];
  let sink = null, parts = null, cur = null;
  const closeSink = () => new Promise(res => { if (!sink) return res(); sink.end(res); });
  for (const ev of sim.generateFiles(o)) {
    if (ev.type === "file") {
      const name = ev.name + (a.gzip ? ".gz" : "");
      cur = { name, path: toStdout ? "(stdout)" : a.zip ? name : path.join(outDir, name) };
      if (a.zip) parts = [];
      else if (toStdout) {
        sink = a.gzip ? zlib.createGzip() : null;
        if (sink) sink.pipe(process.stdout);
      } else {
        const file = fs.createWriteStream(cur.path);
        if (a.gzip) { sink = zlib.createGzip(); sink.pipe(file); cur.done = new Promise(r => file.on("close", r)); }
        else { sink = file; cur.done = new Promise(r => file.on("close", r)); }
      }
    } else if (ev.type === "chunk") {
      if (parts) parts.push(ev.text);
      else if (sink) { if (!sink.write(ev.text)) await new Promise(r => sink.once("drain", r)); }
      else if (!process.stdout.write(ev.text)) await new Promise(r => process.stdout.once("drain", r));
    } else {
      if (parts) {
        let data = Buffer.from(parts.join(""), "utf8");
        if (a.gzip) data = zlib.gzipSync(data);
        zipFiles.push({ name: cur.name, data: new Uint8Array(data) });
        parts = null;
      } else if (sink) { await closeSink(); if (cur.done) await cur.done; sink = null; }
      summary.push(cur.path + "  " + ev.entries + " entries, " + human(ev.bytes) + (a.gzip ? " (uncompressed)" : ""));
    }
  }
  if (a.zip) fs.writeFileSync(a.out, sim.zipStore(zipFiles));
  summary.forEach(s => log(s));
  if (a.zip) log("zip: " + a.out + " (" + zipFiles.length + " entries, stored)");
  if (outDir && !a["no-format-file"]) writeFormatFile(o, outDir, log);
  else if (!outDir && sim.formatExport(o.format, o.prefix)) log("note: PhiLogg needs this format's definition — get it with --format-json");
}

async function follow(a, o, log) {
  if (!a.out) throw new Error("--follow needs -o/--out (a directory, or a file for a single file)");
  const fmt = sim.FORMATS[o.format];
  const rotateLines = a["rotate-lines"] != null ? +a["rotate-lines"] : 0;
  const isDir = rotateLines > 0 || (fs.existsSync(a.out) && fs.statSync(a.out).isDirectory()) || /[\\/]$/.test(a.out);
  const dir = isDir ? a.out : path.dirname(a.out);
  fs.mkdirSync(dir, { recursive: true });
  const prefix = o.prefix || "sim-" + o.format;
  const interval = a.interval != null ? +a.interval : 500;
  const jitter = (a.jitter != null ? +a.jitter : 40) / 100;
  const endAt = a.duration != null ? Date.now() + +a.duration * 1000 : Infinity;
  const gen = sim.createGenerator(o);
  let fileNo = 0, file = null, lines = 0, total = 0;
  const openNext = () => {
    fileNo++;
    file = isDir ? path.join(dir, prefix + "-" + fileNo + fmt.ext) : a.out;
    fs.writeFileSync(file, "");
    lines = 0;
    log("writing " + file);
  };
  if (!a["no-format-file"]) writeFormatFile(o, dir, log);
  openNext();
  let stop = false;
  process.on("SIGINT", () => { stop = true; });
  while (!stop && Date.now() < endAt) {
    if (rotateLines && lines >= rotateLines) openNext();
    // appendFileSync opens/writes/closes per entry, so a tailing reader sees
    // every line immediately and a rotation never races an open handle.
    fs.appendFileSync(file, gen.render(gen.next(sim.naiveNow())));
    lines++; total++;
    const delay = Math.max(5, interval * (1 + (Math.random() * 2 - 1) * jitter));
    await new Promise(r => setTimeout(r, delay));
  }
  log("stopped after " + total + " entries in " + fileNo + " file(s)");
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.help) { process.stdout.write(HELP); return; }
  if (a.list) { process.stdout.write(listAll()); return; }
  const o = genOptions(a);
  const log = a.quiet ? () => {} : s => process.stderr.write(s + "\n");
  if (a["format-json"]) {
    const doc = sim.formatExport(o.format, o.prefix);
    process.stdout.write(doc ? JSON.stringify(doc, null, 2) + "\n" : "null\n");
    if (!doc) log("format '" + o.format + "' needs no import: PhiLogg parses it out of the box");
    return;
  }
  if (a.follow) return follow(a, o, log);
  await writeBatch(a, o, log);
}

main().catch(err => {
  process.stderr.write("log-sim: " + err.message + "\n");
  process.exitCode = 1;
});
