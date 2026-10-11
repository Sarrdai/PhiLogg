// GROUP patterns-prefixed-id-tokens — a prefixed id ("r-1a2b3c") and its all-digit twin ("r-482913") are ONE message
// type in the normalization itself, so every consumer (Patterns tab, analysisPatternCounts, neighbors, collapse-repeats) agrees.
// Origin: 2026-10-11 backlog #125 (supersedes patterns-merge-digit-ids-into-hex, backlog #104).
group("patterns-prefixed-id-tokens");

if (groupSelected()) {
  await withApp(async (w, d, T) => {
    await waitForFormatConfig(T);
    const REQ = /^Request r-(\w+) rejected/;

    section("patterns-prefixed-id-tokens a. simulator bursts: digit and hex ids are one key everywhere");
    let digitIds = 0, hexIds = 0;
    for (const seed of [11, 12, 13]) {
      const [file] = LOGSIM.generateToStrings({ format: "default", entries: 1500, seed, scenarios: ["bursts"] });
      const f = await w.addFile("bursts" + seed + ".log", file.text, () => {});
      T.state.activeId = f.id;
      const reqs = f.entries.filter(e => REQ.test(e.message));
      const ids = reqs.map(e => REQ.exec(e.message)[1]);
      const nDigit = ids.filter(x => /^\d+$/.test(x)).length;
      digitIds += nDigit; hexIds += ids.length - nDigit;
      const keys = new Set(reqs.map(e => w.normalizeMessagePattern(e.message)));
      assert(keys.size === 1 && w.patternDisplayText([...keys][0]) === "Request r-<hex> rejected: <#> Service Unavailable", "seed " + seed + ": one normalized key, got " + [...keys].map(k => w.patternDisplayText(k)));
      assert(new Set(reqs.map(e => w.normalizeRepeatMessage(e.message))).size === 1, "seed " + seed + ": collapse-repeats key is shared too");
      const groups = T.patternsAnalysis(f.id).result.groups.filter(g => g.key.startsWith("Request r-"));
      assert(groups.length === 1 && groups[0].count === ids.length, "seed " + seed + ": Patterns tab one group with " + ids.length + ", got " + groups.map(g => g.count));
      w.applyFhView("patterns");
      const rows = [...d.querySelectorAll("#patternsRows .pattern-row")].filter(r => r.querySelector(".pattern-text").textContent.startsWith("Request r-"));
      assert(rows.length === 1, "seed " + seed + ": one Patterns row, got " + rows.length);
      const rep = w.analysisPatternCounts(f.entries).filter(g => g.key.startsWith("Request r-"));
      assert(rep.length === 1 && rep[0].count === ids.length, "seed " + seed + ": analysisPatternCounts one Request r-<hex> group with " + ids.length + ", got " + rep.map(g => w.patternDisplayText(g.key) + " x" + g.count));
    }
    assert(digitIds > 0 && hexIds > 0, "the sample really mixes digit-only (" + digitIds + ") and hex (" + hexIds + ") ids");

    section("patterns-prefixed-id-tokens b. bursts and neighbors see the merged type");
    const [bf] = LOGSIM.generateToStrings({ format: "default", entries: 1500, seed: 11, scenarios: ["bursts"] });
    const bf1 = await w.addFile("b11.log", bf.text, () => {});
    T.state.activeId = bf1.id;
    const reqCount = bf1.entries.filter(e => REQ.test(e.message)).length;
    const nb = w.analysisNeighbors(bf1.entries.filter(e => REQ.test(e.message)).slice(0, 1), bf1.entries, { before: 0, after: 0 });
    assert(nb !== undefined, "analysisNeighbors runs on the sample");
    const all = w.analysisPatternCounts(bf1.entries);
    assert(all.filter(g => /^Request r-/.test(g.key)).length === 1, "no split Request group among all " + all.length + " types");
    assert(reqCount > 0, "sanity: request lines present");

    section("patterns-prefixed-id-tokens c. direct token rules");
    const disp = m => w.patternDisplayText(w.normalizeMessagePattern(m));
    assert(disp("id r-482913 end") === disp("id r-1a2b3c end") && disp("id r-482913 end") === "id r-<hex> end", "digit and hex id share a key, got " + disp("id r-482913 end"));
    assert(disp("job=J-00004 x") === "job=J-<hex> x", "J-00004 is J-<hex>, got " + disp("job=J-00004 x"));
    assert(disp("Worker-3 up") === "Worker-<#> up" && disp("worker-123 up") === "worker-<#> up", "1-3 char ids stay numbers");
    assert(disp("ver v-1234.5 ok") === "ver v-<#> ok" && !/<hex>/.test(disp("ver x-1234,5 ok")), "a decimal is not cut into <hex> + number, got " + disp("ver v-1234.5 ok") + " / " + disp("ver x-1234,5 ok"));
    assert(!/<hex>/.test(disp("value 1e10 reached")) && /<#>/.test(disp("value 1e10 reached")), "1e10 stays numeric, got " + disp("value 1e10 reached"));
    assert(disp("n 12345678 end") === "n <#> end", "an unprefixed all-digit token stays a number");
    assert(disp("id longprefix-123456 end") === "id longprefix-<#> end", "a 4+ letter prefix is not an id prefix");
    assert(w.patternFilterValue(w.normalizeMessagePattern("job=J-00004 x"), 0, true) === "job=J-[*] x", "typed Extract gives [*] for the id");
  });
}
