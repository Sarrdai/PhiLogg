// GROUP link-ordinal — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP link-ordinal — the link dialog's hop count reads "1st/2nd/3rd/4th", not "1th"
   Origin: 2026-10-04 (tablet retest). ordinalSuffix(n) + a live suffix span next to .link-hop-n.
   ============================================================ */
group("link-ordinal");

await withApp(async (w, d, T) => {
  section("link-ordinal a. ordinalSuffix table");
  const want = { 1: "st", 2: "nd", 3: "rd", 4: "th", 10: "th", 11: "th", 12: "th", 13: "th", 21: "st", 22: "nd", 23: "rd", 24: "th", 101: "st", 102: "nd", 111: "th", 112: "th", 113: "th", 121: "st" };
  for (const [n, s] of Object.entries(want)) assert(w.ordinalSuffix(+n) === s, n + " -> " + s + ", got " + w.ordinalSuffix(+n));

  section("link-ordinal b. Dialog shows 1st and follows the input");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  const a = w.createFilterNode(f.id, "text", "message 1");
  const b = w.createFilterNode(f.id, "text", "message 2");
  w.render();
  w.openLinkDialog([a.id, b.id]);
  const n = d.querySelector(".link-hop-n"), ord = d.querySelector(".link-hop-ord");
  assert(!!n && !!ord, "hop row has the number input and the suffix span");
  assert(ord.textContent === "st", "default 1 -> st, got " + ord.textContent);
  const type = v => { n.value = v; n.dispatchEvent(new w.Event("input", { bubbles: true })); };
  type("2"); assert(ord.textContent === "nd", "2 -> nd");
  type("3"); assert(ord.textContent === "rd", "3 -> rd");
  type("11"); assert(ord.textContent === "th", "11 -> th");
  type("22"); assert(ord.textContent === "nd", "22 -> nd");
  type(""); assert(ord.textContent === "st", "empty counts as 1");
});
