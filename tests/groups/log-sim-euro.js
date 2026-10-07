// GROUP log-sim-euro — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP log-sim-euro — the simulator writes a € and the golden fixture pins it
   Origin: 2026-10-07 (backlog #117). The text scenario's umlaut line now holds
   a "€", so --encoding output has the byte 0x80 (Windows-1252/-1250), 0x88
   (Windows-1251) or 0xA4 (ISO-8859-15), and the shared JS/Rust golden fixture
   (tests/fixtures/native-parse-golden.json, GROUP 264 + the crate's cargo test)
   covers a Windows-1252 0x80 byte. Data: tools/log-sim (format default,
   scenario text, seed 5, 12 entries — the recipe of the encoding-* cases).
   ============================================================ */
group("log-sim-euro");
{
  const text = LOGSIM.generateToStrings({ format: "default", entries: 12, seed: 5, scenarios: ["text"] })[0].text;
  const byteOf = (enc, ch) => Buffer.from(LOGSIM.encodeText(ch + "", enc))[0];
  assert(/hat Auftrag \d+ \(Summe \d+,50 €\) geändert/.test(text), "the text scenario writes a € in its umlaut line");
  const golden = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "native-parse-golden.json"), "utf8"));
  const c = golden.cases.find(x => x.name === "encoding-explicit-windows-1252");
  const bytes = Buffer.from(c.base64, "base64");
  const euroLine = c.entries.find(e => e.message.includes("€"));
  assert(Buffer.from(LOGSIM.encodeText(text, "windows-1252")).equals(bytes), "the Windows-1252 golden case is the simulator's output (seed 5, text scenario)");
  assert(bytes.includes(0x80) && euroLine && /\(Summe \d+,50 €\)/.test(euroLine.message), "the Windows-1252 golden case holds a 0x80 byte that decodes to €");
  assert(byteOf("windows-1252", "€") === 0x80 && byteOf("windows-1250", "€") === 0x80 && byteOf("windows-1251", "€") === 0x88 && byteOf("iso-8859-15", "€") === 0xA4,
    "each encoding writes its own byte for €");
  const g2 = golden.cases.find(x => x.name === "encoding-explicit-windows-1251");
  assert(Buffer.from(g2.base64, "base64").includes(0x88), "the Windows-1251 golden case holds 0x88");
}
