// GROUP extract-constant-word — "Filter for this message" turns a [*:word] capture that never
// varies over the file (a constant identifier like "v2") back into literal text.
// Origin: 2026-10-05 (person-reported: Table got a constant column for "v2").
group("extract-constant-word");

if (groupSelected()) {
  const TOUR = require(path.join(__dirname, "..", "tools", "log-sim", "tour.js"));
  const tourLog = TOUR.demoLog();

  await withApp(async (w, d, T) => {
    section("extract-constant-word a. the generated pattern keeps v2 literal, numbers stay captures");
    const f = await w.addFile("app.log", tourLog, () => {});
    const get = f.entries.filter(e => /GET https:\/\/api\.example\.com\/v2\/orders\/\d+ -> 200 \(\d+ ms\)/.test(e.message));
    assert(get.length >= 2, "sanity: the tour log has several GET .../v2/orders/N lines, got " + get.length);
    const raw = w.buildNumericExtractPattern(get[0].message);
    assert(raw.includes("/[*:word]/orders/"), "sanity: the plain generator still makes v2 a word capture: " + raw);
    const pat = w.generatedEntryPattern(get[0], "message", f.id);
    assert(pat === "GET https://api.example.com/v2/orders/[*:int] -> [*:int] ([*:time])", "v2 became literal, got: " + pat);
    assert(!pat.includes("[*:word]"), "no word capture left: " + pat);
    const count = p => { const s = w.compileExtractPattern(p); return f.entries.filter(e => w.wildcardMatch(new RegExp(s.regexStr, "is"), s.columns, e.message)).length; };
    assert(count(pat) === count(raw) && count(pat) >= 2, "the match set is the same as before: " + count(pat) + " vs " + count(raw));

    section("extract-constant-word b. Filter for this message prefills the frozen pattern");
    T.state.activeId = f.id;
    w.openFilterForEntryColumn(get[0], { key: "message", label: "Message" });
    const input = d.querySelector("#filterInput");
    assert(input.value === pat && input.value.includes("/v2/orders/"), "popup input holds the frozen pattern, got: " + input.value);

    section("extract-constant-word c. a word capture that varies stays a capture");
    const job = f.entries.find(e => /Move requested axis=\d+ target=\S+ job=J-\d+/.test(e.message));
    assert(job, "sanity: a Move requested line with a job id");
    const jp = w.generatedEntryPattern(job, "message", f.id);
    assert(jp.includes("job=[*:word]"), "job ids differ between matches: kept as [*:word], got: " + jp);
  });

  section("extract-constant-word d. pure helper edge cases");
  await withApp(async (w, d, T) => {
    const f = await w.addFile("app.log", tourLog, () => {});
    const gets = f.entries.filter(e => /api\.example\.com\/v2\/orders/.test(e.message)).map(e => e.message);
    const pat = "GET https://api.example.com/[*:word]/orders/[*:int] -> [*:int] ([*:time])";
    assert(w.freezeConstantWordCaptures(pat, gets) === "GET https://api.example.com/v2/orders/[*:int] -> [*:int] ([*:time])", "helper freezes v2 only, got: " + w.freezeConstantWordCaptures(pat, gets));
    assert(w.freezeConstantWordCaptures(pat, [gets[0]]) === pat, "a single match leaves the pattern as is");
    assert(w.freezeConstantWordCaptures(pat, []) === pat, "no match leaves the pattern as is");
    assert(w.freezeConstantWordCaptures(pat, [gets[0], gets[1].replace("/v2/", "/v3/")]) === pat, "a differing value keeps the capture");
    assert(w.freezeConstantWordCaptures("no captures [*:int]", gets) === "no captures [*:int]", "no word capture: unchanged");
    assert(w.freezeConstantWordCaptures("[*:int", gets) === "[*:int", "invalid pattern: unchanged");
  });
}
