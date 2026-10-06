// GROUP patterns-merge-digit-ids-into-hex — Patterns: an all-digit id ("r-123456") joins the sibling "r-<hex>" group;
// a number with no hex sibling ("job=J-<#>") stays a number.
// Origin: 2026-10-06 backlog #104.
group("patterns-merge-digit-ids-into-hex");

if (groupSelected()) {
  await withApp(async (w, d, T) => {
    await waitForFormatConfig(T);
    const REQ = /^Request r-(\w+) rejected/;
    const reqGroups = f => T.patternsAnalysis(f.id).result.groups.filter(g => g.key.startsWith("Request r-"));

    section("patterns-merge-digit-ids-into-hex a. simulator bursts: digit and hex ids are one r-<hex> group with the summed count");
    let digitIds = 0, hexIds = 0;
    for (const seed of [11, 12, 13]) {
      const [file] = LOGSIM.generateToStrings({ format: "default", entries: 1500, seed, scenarios: ["bursts"] });
      const f = await w.addFile("bursts" + seed + ".log", file.text, () => {});
      T.state.activeId = f.id;
      const ids = f.entries.map(e => REQ.exec(e.message)).filter(Boolean).map(m => m[1]);
      const nDigit = ids.filter(x => /^\d+$/.test(x)).length;
      digitIds += nDigit; hexIds += ids.length - nDigit;
      const groups = reqGroups(f);
      assert(groups.length === 1, "seed " + seed + ": one request group, got " + groups.map(g => w.patternDisplayText(g.key) + " x" + g.count));
      assert(w.patternDisplayText(groups[0].key) === "Request r-<hex> rejected: <#> Service Unavailable", "seed " + seed + ": shape " + w.patternDisplayText(groups[0].key));
      assert(groups[0].count === ids.length, "seed " + seed + ": count " + groups[0].count + " = all " + ids.length + " request lines (" + nDigit + " digit-only)");
      assert([...groups[0].levels.values()].reduce((a, b) => a + b, 0) === ids.length, "seed " + seed + ": levels map summed");
      const first = f.entries.find(e => REQ.test(e.message));
      assert(groups[0].firstTs === first.ts && groups[0].first.ts === first.ts, "seed " + seed + ": first = the earliest request entry");
      const last = f.entries.filter(e => REQ.test(e.message)).pop();
      assert(groups[0].lastTs === last.ts, "seed " + seed + ": lastTs = the latest request entry");
      // the Patterns view shows it as a single row, with count and share of the summed group
      w.applyFhView("patterns");
      const rows = [...d.querySelectorAll("#patternsRows .pattern-row")].filter(r => r.querySelector(".pattern-text").textContent.startsWith("Request r-"));
      assert(rows.length === 1 && rows[0].children[0].textContent === String(ids.length).replace(/\B(?=(\d{3})+(?!\d))/g, "."), "seed " + seed + ": one row, count " + (rows[0] && rows[0].children[0].textContent));
    }
    assert(digitIds > 0 && hexIds > 0, "the sample really mixes digit-only (" + digitIds + ") and hex (" + hexIds + ") ids");

    section("patterns-merge-digit-ids-into-hex b. no hex sibling: a digit id stays a number (Job J-<#> next to merged request ids)");
    const [mixFile] = LOGSIM.generateToStrings({ format: "default", entries: 2500, seed: 7, scenarios: ["bursts", "motion"] });
    const mf = await w.addFile("mix.log", mixFile.text, () => {});
    T.state.activeId = mf.id;
    const mixGroups = T.patternsAnalysis(mf.id).result.groups;
    const jobGroups = mixGroups.filter(g => /J-/.test(w.patternDisplayText(g.key)));
    assert(jobGroups.length > 0 && jobGroups.every(g => /J-<#>/.test(w.patternDisplayText(g.key))), "J-<#> groups present and still numbers: " + jobGroups.map(g => w.patternDisplayText(g.key)));
    assert(!mixGroups.some(g => /J-<hex>/.test(w.patternDisplayText(g.key))), "no J-<hex> group appears");
    const jobEntries = mf.entries.filter(e => /\bJ-\d+/.test(e.message.split("\n")[0])).length;
    assert(jobGroups.reduce((a, g) => a + g.count, 0) === jobEntries && jobEntries > 0, "J- groups keep all " + jobEntries + " entries");
    assert(reqGroups(mf).length === 1, "request ids in the same file still merge into one group");

    section("patterns-merge-digit-ids-into-hex c. direct: prefix rule and several differing positions");
    const norm = m => w.normalizeMessagePattern(m);
    const acc = msgs => { // msgs are derived from simulator request lines, see the float-mask section
      const a = w.createPatternAcc();
      msgs.forEach((m, i) => { const e = { message: m, ts: 1000 + i, level: "ERROR", formatId: null }; a.step(e); });
      return a.finish().groups;
    };
    const simMsgs = f => f.entries.map(e => e.message).filter(m => REQ.test(m));
    const [bf] = LOGSIM.generateToStrings({ format: "default", entries: 1500, seed: 11, scenarios: ["bursts"] });
    const bursts = await w.addFile("b11.log", bf.text, () => {});
    const hexMsg = simMsgs(bursts).find(m => !/^Request r-\d+ /.test(m));
    const digMsg = simMsgs(bursts).find(m => /^Request r-\d+ /.test(m));
    assert(hexMsg && digMsg, "sanity: simulator gives both id shapes");
    // two prefixed ids in one message: (digit,digit) merges only into a sibling whose differing positions are all num->hex swaps
    const two = (a, b) => a.replace(/^Request /, "Request ") + " / " + b.replace(/^Request /, "Request ");
    const g2 = acc([two(digMsg, digMsg), two(hexMsg, digMsg), two(digMsg, hexMsg), two(hexMsg, hexMsg)]);
    // each message has one entry; (num,num) merges into the first sibling found, (num,hex) and (hex,num) merge into (hex,hex)
    assert(g2.length === 1 && g2[0].count === 4 && w.patternDisplayText(g2[0].key).startsWith("Request r-<hex> rejected: <#> Service Unavailable / Request r-<hex>"), "all four shapes end in the (hex,hex) group: " + g2.map(g => w.patternDisplayText(g.key) + " x" + g.count));
    const g3 = acc([two(hexMsg, digMsg), two(digMsg, hexMsg)]);
    assert(g3.length === 2, "(hex,num) and (num,hex) do not merge into each other: " + g3.length + " groups");
    // a number that is not behind a short letter prefix never merges
    const g4 = acc(["id 123456 end", "id deadbeef end"]);
    assert(g4.length === 2, "free-standing digits stay separate from a hex word: " + g4.length + " groups");
    const g5 = acc(["id longprefix-123456 end", "id longprefix-4f2d1a end"]);
    assert(g5.length === 2 && g5.some(g => w.patternDisplayText(g.key) === "id longprefix-<#> end"), "a 4+ letter prefix is not an id prefix: " + g5.map(g => w.patternDisplayText(g.key)));
    assert(norm("id r-123456 end") !== norm("id r-4f2d1a end"), "normalizeMessagePattern itself is unchanged (still two keys)");

    section("patterns-merge-digit-ids-into-hex d. floatMask is remapped when the merged number placeholder disappears");
    // Derived from simulator request lines: only the all-digit ids get a decimal point after "rejected:", the hex ones stay integers.
    const text = bf.text.split("\n").map(l => (/Request r-\d+ rejected: 503 Service/.test(l) ? l.replace("rejected: 503 Service", "rejected: 503.25 Service") : l)).join("\n");
    const ff = await w.addFile("floats.log", text, () => {});
    T.state.activeId = ff.id;
    const fg = reqGroups(ff);
    assert(fg.length === 1, "still one merged group, got " + fg.length);
    assert(fg[0].floatMask === 1, "bit of the old <#>#1 (503.25) now sits at index 0 of the merged key, mask " + fg[0].floatMask);
    assert(w.patternFilterValue(fg[0].key, fg[0].floatMask, true) === "Request r-[*] rejected: [*:float] Service Unavailable", "typed value: " + w.patternFilterValue(fg[0].key, fg[0].floatMask, true));

    section("patterns-merge-digit-ids-into-hex e. filter and Extract of the merged group match both id shapes");
    const sim = await w.addFile("bursts11b.log", bf.text, () => {});
    T.state.activeId = sim.id;
    const mg = reqGroups(sim)[0];
    const total = simMsgs(sim).length;
    assert(mg.count === total && mg.count > 0, "sanity: merged group holds " + total + " lines");
    w.applyPatternAction(mg, "filter");
    let node = T.state.nodes[T.state.activeId];
    assert(node.value === "Request r-[*] rejected: [*] Service Unavailable", "filter value: " + node.value);
    assert(w.getEntries(node.id).length === total, "the filter matches all " + total + " entries, digit-only ids included, got " + w.getEntries(node.id).length);
    assert(w.getEntries(node.id).some(e => /^Request r-\d+ /.test(e.message)) && w.getEntries(node.id).some(e => /^Request r-(?!\d+ )\w+ /.test(e.message)), "both id shapes are among the matches");
    T.state.activeId = sim.id;
    w.applyPatternAction(mg, "extract");
    node = T.state.nodes[T.state.activeId];
    assert(node.value === "Request r-[*] rejected: [*:int] Service Unavailable", "extract value (id column is [*], not [*:int]): " + node.value);
    const spec = w.compileExtractPattern(node.value);
    assert(spec && spec.columns.map(c => c.type).join() === "text,int", "columns: " + (spec && spec.columns.map(c => c.type)));
    assert(w.getEntries(node.id).length === total, "the Extract node matches all " + total + " entries");
  });
}
