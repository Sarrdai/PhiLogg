// GROUP phone-title-not-prefix — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP phone-title-not-prefix — the phone title's bold line carries the
   NOT marker like the desktop tree and the tablet status line.
   Origin: 2026-10-06 (phone usability round, step A3).
   ============================================================ */
group("phone-title-not-prefix");

await withApp(async (w, d, T) => {
  section("phone-title-not-prefix a. Inverted node");
  const f = await w.addFile("n.log", makeLog(0, 20), () => {});
  const flt = w.createFilterNode(f.id, "text", "message 1", true);
  const plain = w.createFilterNode(f.id, "text", "message 2");
  w.innerWidth = 390; w.dispatchEvent(new w.Event("resize"));
  const b = () => d.querySelector("#phoneTitle b").textContent;
  T.state.activeId = flt.id; w.render();
  assert(b() === "¬ " + w.nodeDisplayName(flt), "inverted: '¬ ' prefix, got " + b());
  T.state.activeId = plain.id; w.render();
  assert(b() === w.nodeDisplayName(plain), "not inverted: no prefix, got " + b());
  T.state.activeId = f.id; w.render();
  assert(b() === "n.log", "file root: plain name");
});
