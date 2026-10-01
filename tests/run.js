#!/usr/bin/env node
// Shard runner for philogg.regression.test.js.
//
// The suite builds ~290 jsdom windows and its groups are independent, so the
// only thing standing between it and the machine's other cores was that it ran
// as one long top-level-await script. This spawns one child per shard, each
// running the same file; the file's own group() markers let each child skip
// the groups that aren't its own (see the "Group selection" comment there).
// The children share a claims directory (SHARD_CLAIMS): whichever child gets
// to a group first runs it, so the work spreads itself evenly instead of by a
// fixed split. Every child prints a `##SHARD {...}` line, which is summed here
// into the single total the suite has always reported — so a dropped group
// shows up immediately as a lower count than the one in tests/README.md.
//
//   npm test                 shard across the available cores
//   SHARDS=1 npm test        one process, no sharding (what CI/debugging wants)
//   GROUP=58,127 npm test    just those groups, in one process (~1-2s)
"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const TEST_FILE = path.join(__dirname, "philogg.regression.test.js");
const cores = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
// GROUP= is a single-group dev run; sharding it would only add process startup.
const shards = process.env.GROUP ? 1 : Math.max(1, Math.min(Number(process.env.SHARDS) || cores, 8));
// Each child's V8 heap is capped at its share of the free memory (half of it:
// RSS runs at about twice the heap). Uncapped, V8 keeps the closed windows'
// dead vm contexts around until memory gets tight, so every child grew to
// ~2 GB RSS — eight of them got a 13 GB container OOM-killed, which only showed
// up as a shard with no result line. Capped, V8 collects them sooner, at no
// measurable cost (1.6 GB here: as fast as uncapped). Never below 1 GB, which
// the heaviest shard still fits in comfortably.
const freeMemory = typeof process.availableMemory === "function" ? process.availableMemory() : os.freemem();
const heapMb = Math.max(1024, Math.min(4096, Math.floor(freeMemory / shards / 2 / 2 ** 20)));
const claimsDir = shards > 1 ? fs.mkdtempSync(path.join(os.tmpdir(), "philogg-shards-")) : null;

function runShard(index) {
  return new Promise(resolve => {
    const env = { ...process.env };
    if (shards > 1) { env.SHARD = index + "/" + shards; env.SHARD_CLAIMS = claimsDir; }
    const child = spawn(process.execPath, ["--max-old-space-size=" + heapMb, TEST_FILE], { env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", c => { out += c; });
    child.stderr.on("data", c => { err += c; });
    child.on("close", (code, signal) => resolve({ index, code, signal, out, err }));
  });
}

(async () => {
  const started = Date.now();
  const results = await Promise.all(Array.from({ length: shards }, (_, i) => runShard(i)));
  if (claimsDir) fs.rmSync(claimsDir, { recursive: true, force: true });

  let passed = 0, failed = 0, broken = false;
  const failures = [];
  for (const r of results) {
    const marker = r.out.split("\n").find(l => l.startsWith("##SHARD "));
    // Forward the child's own output verbatim, minus the machine-readable line.
    process.stdout.write(r.out.split("\n").filter(l => !l.startsWith("##SHARD ")).join("\n"));
    if (r.err.trim()) process.stderr.write(r.err);
    if (shards === 1) {
      // Unsharded: the child already printed the real summary and set the code.
      if (r.code !== 0) broken = true;
      continue;
    }
    if (!marker) {
      broken = true;
      console.log("shard " + r.index + "/" + shards + " produced no result line (" + (r.signal ? "killed by " + r.signal + (r.signal === "SIGKILL" ? ", out of memory?" : "") : "exit code " + r.code) + ")");
      continue;
    }
    const res = JSON.parse(marker.slice("##SHARD ".length));
    passed += res.passed;
    failed += res.failed;
    failures.push(...res.failures);
  }

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (shards > 1) {
    console.log("\n" + "=".repeat(60));
    console.log(passed + " passed, " + failed + " failed across " + shards + " shards in " + secs + "s");
    failures.forEach(f => console.log("FAIL  " + f));
  } else {
    console.log("\n(1 shard, " + secs + "s)");
  }
  process.exitCode = failed || broken ? 1 : 0; // not process.exit() — see the test file's own note: it truncates buffered stdout
})();
