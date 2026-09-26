// Writes a synthetic log in the builtin default format for performance runs:
// node tools/perf/gen-log.js <out-file> <entries>
// 650,000 entries ≈ 100 MB (every 10th entry has a stack-trace line).
// Deterministic, so runs on different days/sessions compare.
const fs = require("fs");
const [out, n] = [process.argv[2], +process.argv[3] || 650000];
if (!out) { console.error("usage: node gen-log.js <out-file> [entries]"); process.exit(1); }
const stream = fs.createWriteStream(out);
let buf = [];
for (let i = 0; i < n; i++) {
  const s = i % 86400;
  const p = x => String(x).padStart(2, "0");
  const ts = `2024-01-15 ${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)},${String(i % 1000).padStart(3, "0")}`;
  buf.push(`${ts}\t${["INFO", "WARN", "ERROR", "DEBUG"][i % 4]}\t"worker-${i % 16}"\tC:\\src\\Project\\Module${i % 50}\\Service.cs\tline ${i % 900}\t[Handle${i % 30}]\t"Processed request ${i} for customer ${i * 7 % 1000} in ${i % 250} ms"`);
  if (i % 10 === 0) buf.push("   at Some.Namespace.Class.Method() in C:\\src\\x.cs:line 42");
  if (buf.length > 10000) { stream.write(buf.join("\n") + "\n"); buf = []; }
}
stream.end(buf.join("\n") + "\n");
