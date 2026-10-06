// GROUP patterns-short-hex-id — Patterns: a short mixed hex request id is one <hex>, not a number per digit run.
// Origin: 2026-10-06 usability round E3.
group("patterns-short-hex-id");

if (groupSelected()) {
  await withApp(async (w, d, T) => {
    section("patterns-short-hex-id a. simulator bursts: every Request r-<id> line is one group");
    await waitForFormatConfig(T);
    let digitOnly = 0, letterOnly = 0, expLike = 0;
    for (const seed of [11, 12, 13]) {
      const [file] = LOGSIM.generateToStrings({ format: "default", entries: 1500, seed, scenarios: ["bursts"] });
      const f = await w.addFile("bursts" + seed + ".log", file.text, () => {});
      T.state.activeId = f.id;
      const ids = f.entries.map(e => /^Request r-(\w+) rejected/.exec(e.message)).filter(Boolean).map(m => m[1]);
      assert(ids.length >= 100, "seed " + seed + ": sanity, request lines: " + ids.length);
      digitOnly += ids.filter(x => /^\d+$/.test(x)).length;
      letterOnly += ids.filter(x => /^[a-f]+$/.test(x)).length;
      expLike += ids.filter(x => /^\d+e\d+$/.test(x)).length;
      // An all-digit id is a plain number (J-00004 must stay J-<#>), so it forms its own group.
      const hexIds = ids.filter(x => !/^\d+$/.test(x)).length, numIds = ids.filter(x => /^\d+$/.test(x)).length;
      const groups = T.patternsAnalysis(f.id).result.groups.filter(g => g.key.startsWith("Request r-"));
      const shapes = groups.map(g => w.patternDisplayText(g.key) + " x" + g.count).sort();
      const want = ["Request r-<hex> rejected: <#> Service Unavailable x" + hexIds].concat(numIds ? ["Request r-<#> rejected: <#> Service Unavailable x" + numIds] : []).sort();
      assert(JSON.stringify(shapes) === JSON.stringify(want), "seed " + seed + ": groups " + JSON.stringify(shapes) + " want " + JSON.stringify(want));
    }
    assert(digitOnly > 0 && letterOnly > 0 && expLike > 0, "the sample contains digit-only (" + digitOnly + "), letter-only (" + letterOnly + ") and exponent-like (" + expLike + ") ids");

    section("patterns-short-hex-id b. direct normalization checks");
    const norm = m => w.normalizeMessagePattern(m);
    const disp = m => w.patternDisplayText(norm(m));
    assert(!/<hex>/.test(disp("value 1e10 reached")) && /<#>/.test(disp("value 1e10 reached")) , "1e10 stays numeric, got " + disp("value 1e10 reached"));
    assert(!/<hex>/.test(disp("value 2E5 reached")), "2E5 stays numeric, got " + disp("value 2E5 reached"));
    assert(disp("load v2 done") === "load v<#> done", "v2 unchanged, got " + disp("load v2 done"));
    assert(disp("Sensor T3 ok") === "Sensor T<#> ok", "T3 unchanged, got " + disp("Sensor T3 ok"));
    assert(disp("Worker-3 up") === "Worker-<#> up", "Worker-3 unchanged, got " + disp("Worker-3 up"));
    assert(disp("id r-123456 end") === "id r-<#> end" && disp("job=J-00004 x") === "job=J-<#> x" && disp("id r-dedcac end") === "id r-<hex> end" && disp("id r-4e5123 end") === "id r-<hex> end", "prefixed ids of any mix");
    assert(disp("worker-12 and Worker-123 up") === "worker-<#> and Worker-<#> up", "short numbers / long prefixes stay numbers");
    assert(disp("id r-4f2d1a end") === "id r-<hex> end", "short id, got " + disp("id r-4f2d1a end"));
    assert(disp("id deadbe3f end") === "id <hex> end", "8+ hex still hex");
  });
}
