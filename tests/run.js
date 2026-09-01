#!/usr/bin/env node
// Shard runner for philogg.regression.test.js.
//
// The suite builds ~290 jsdom windows and its groups are independent, so the
// only thing standing between it and the machine's other cores was that it ran
// as one long top-level-await script. This spawns one child per shard, each
// running the same file with SHARD=<index>/<total>; the file's own group()
// markers make each child skip the groups that aren't its own (see the "Group
// selection" comment there). Every child prints a `##SHARD {...}` line, which
// is summed here into the single total the suite has always reported — so a
// dropped group shows up immediately as a lower count than the expected 2833.
//
//   npm test                 shard across the available cores
//   SHARDS=1 npm test        one process, no sharding (what CI/debugging wants)
//   GROUP=58,127 npm test    just those groups, in one process (~1-2s)
"use strict";

const { spawn } = require("child_process");
const os = require("os");
const path = require("path");

const TEST_FILE = path.join(__dirname, "philogg.regression.test.js");
const cores = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
// GROUP= is a single-group dev run; sharding it would only add process startup.
const shards = process.env.GROUP ? 1 : Math.max(1, Math.min(Number(process.env.SHARDS) || cores, 8));

function runShard(index) {
  return new Promise(resolve => {
    const env = { ...process.env };
    if (shards > 1) env.SHARD = index + "/" + shards;
    const child = spawn(process.execPath, [TEST_FILE], { env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", c => { out += c; });
    child.stderr.on("data", c => { err += c; });
    child.on("close", code => resolve({ index, code, out, err }));
  });
}

(async () => {
  const started = Date.now();
  const results = await Promise.all(Array.from({ length: shards }, (_, i) => runShard(i)));

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
      console.log("shard " + r.index + "/" + shards + " produced no result line (exit code " + r.code + ")");
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
  process.exit(failed || broken ? 1 : 0);
})();
