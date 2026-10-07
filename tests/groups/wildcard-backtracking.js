// GROUP wildcard-backtracking — a wildcard pattern with many [*] stays fast on
// lines it doesn't match (WildcardRegExp instead of a plain RegExp of
// regexStr), and matches exactly what that RegExp matches: same first match,
// same captures, same index/indices, same global iteration.
// Origin: 2026-10-07 (FEATURE_BACKLOG.md #101).
group("wildcard-backtracking");

if (groupSelected()) {
  const [sim] = LOGSIM.generateToStrings({ format: "default", entries: 1500, seed: 7 });

  await withApp(async (w, d, T) => {
    const f = await w.addFile(sim.name, sim.text, () => {});
    const messages = f.entries.map(e => e.message);
    const longest = messages.reduce((a, b) => (b.length > a.length ? b : a), "");
    assert(longest.split(" ").length > 100, "sanity: the simulator log has a long multi-line message (stack trace), got " + longest.split(" ").length + " words");

    section("wildcard-backtracking a. 7 wildcards on a non-matching line: bounded time");
    // The plain regex took ~12 s for 20 such entries; this one is ~1 ms.
    // The bound is generous so a loaded SHARDS=8 run stays green.
    const bad = "[*] [*] [*] [*] [*] [*] [*] NOMATCH";
    const spec = w.compileExtractPattern(bad);
    const WRE = spec.regex.constructor; // a class declaration is not a window property
    assert(WRE.name === "WildcardRegExp", "compileExtractPattern's regex is a WildcardRegExp");
    let t = Date.now();
    for (let i = 0; i < 200; i++) assert(!w.wildcardMatch(spec.regex, spec.columns, longest), "no match on the stack trace");
    assert(Date.now() - t < 3000, "200 evaluations on a " + longest.length + "-char line took " + (Date.now() - t) + " ms");
    t = Date.now();
    const node = w.createFilterNode(f.id, "text", bad);
    assert(w.getEntries(node).length === 0, "the filter over the whole file matches nothing");
    assert(Date.now() - t < 3000, "filtering " + f.entries.length + " entries took " + (Date.now() - t) + " ms");

    section("wildcard-backtracking b. same matches as the plain RegExp (simulator lines + fuzz)");
    const same = (p, flags, text) => {
      const s = w.compileExtractPattern(p);
      const nat = new RegExp(s.regexStr, flags), wre = new WRE(s, flags);
      for (let r = 0; r < (flags.includes("g") ? 4 : 1); r++) {
        const a = nat.exec(text), b = wre.exec(text);
        const ja = JSON.stringify(a && [...a, a.index, a.indices]), jb = JSON.stringify(b && [...b, b.index, b.indices]);
        if (ja !== jb || nat.lastIndex !== wre.lastIndex) return "pattern " + JSON.stringify(p) + " flags " + flags + " text " + JSON.stringify(text) + ": " + ja + " vs " + jb;
        if (!a) break;
        if (!a[0].length) { nat.lastIndex++; wre.lastIndex++; }
      }
      return null;
    };
    const fixed = [
      "Request [*] completed in [*:int]ms status=[*:int]",
      "Request [*] [*] completed in [*:time] status=[*]",
      "[*] axis=[*:int] target=[*:float] job=[*:word]",
      "Move requested [*]",
      "[*:word] [*] [*:int]",
      "temp [*:float@de|>=10] at [*]",
      "[*][*:int]",
      "at [*].[*]([*]) in [*]:line [*:int]",
    ];
    let checked = 0, matched = 0, firstBad = null;
    for (const p of fixed) for (const m of messages) {
      const err = same(p, "is", m) || same(p, "gids", m);
      if (err && !firstBad) firstBad = err;
      checked++;
      if (w.compileExtractPattern(p).regex.exec(m)) matched++;
    }
    assert(!firstBad, "simulator lines: " + firstBad);
    assert(matched > 100, "sanity: the fixed patterns match simulator lines, " + matched + " of " + checked);
    let seed = 7;
    const rnd = n => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
    const ALPHA = "ab 1,.2:xA\nB-s";
    const rs = n => { let s = ""; for (let i = 0; i < n; i++) s += ALPHA[rnd(ALPHA.length)]; return s; };
    const TOKENS = ["[*]", "[*]", "[*]", "[*:int]", "[*:word]", "[*:hex]", "[*:float]", "[*:time]", "[*:float@de]", "[*:int|>1]"];
    firstBad = null;
    for (let it = 0; it < 3000 && !firstBad; it++) {
      let p = rnd(2) ? rs(1 + rnd(2)) : "";
      const n = 1 + rnd(4);
      for (let k = 0; k < n; k++) { p += TOKENS[rnd(TOKENS.length)]; if (rnd(4)) p += rs(1 + rnd(2)).replace(/[[\]]/g, ""); }
      if (!w.compileExtractPattern(p)) continue;
      const flags = ["is", "s", "ids", "gis", "gids"][rnd(5)];
      for (let j = 0; j < 4 && !firstBad; j++) firstBad = same(p, flags, rs(rnd(14)));
    }
    assert(!firstBad, "fuzz: " + firstBad);

    section("wildcard-backtracking c. highlight ranges and the live preview still use the captures");
    const req = "Request [*] completed in [*:int]ms status=[*:int]";
    const ms = w.textFilterMatchSpec({ type: "filter", filterType: "text", value: req });
    const hit = messages.find(m => /^Request .* completed in \d+ms status=\d+$/.test(m));
    assert(hit, "sanity: a Request ... completed line");
    const ranges = w.findMatchRanges(hit, ms);
    assert(ranges.length === 1 && ranges[0][0] === 0 && ranges[0][1] === hit.length, "the whole line is one highlight range: " + JSON.stringify(ranges));
    const pre = new WRE(w.compileExtractPattern(req), "ids").exec(hit);
    assert(pre && pre.indices.length === 4 && hit.slice(...pre.indices[2]) === pre[2], "the 'd' flag gives capture indices: " + JSON.stringify(pre && pre.indices));
  });
}
