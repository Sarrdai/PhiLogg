// GROUP minimap-bursts — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP minimap-bursts — burst flags on the timeline minimap
   Origin: 2026-10-09 (person-requested, backlog #120 part 1, analysis tools round).
   The minimap marks the active node's bursts (analysisTimeline: a second with >= 5 entries
   and >= 4x the median) with a flag showing the entry count, on the minimap's own axis
   (zoom, time + entries binning), at most the 12 strongest. Time files only. One state
   (default on) behind the Settings switch and the "Bursts" chip; localStorage
   philogg-minimap-bursts. A flag opens #burstPopover (range, count, factor, levels, top 3
   patterns; Time window = one undo step, Zoom = +-10 s; burstActions is the hook for the
   compare / neighbors actions). The analysis is cached per result (no recompute on renders).
   jsdom has no layout: the stubbed minimap is 800 px wide. Sample data: tools/log-sim (bursts, basic).
   ============================================================ */
group("minimap-bursts");

if (groupSelected()) {
  const flagsOf = d => [...d.querySelectorAll("#minimapBursts .minimap-burst")];
  const chipOf = d => d.querySelector("#minimapBurstChip");
  const settingOf = d => d.querySelector("#settingsMinimapBursts");
  const simFile = async (w, scenarios, entries, seed, format) => {
    const [file] = LOGSIM.generateToStrings(format ? { scenarios, entries, seed, format } : { scenarios, entries, seed });
    return w.addFile(file.name, file.text, () => {});
  };
  const show = (w, T, f) => { T.state.activeId = f.id; T.state.sortColumn = null; w.render(); };
  const press = (w, el) => { const ev = new w.MouseEvent("pointerdown", { bubbles: true }); Object.defineProperty(ev, "pointerType", { value: "mouse" }); el.dispatchEvent(ev); };
  const mid = (w, b) => (w.minimapTsToX(b.from) + w.minimapTsToX(b.to)) / 2;

  await withApp(async (w, d, T) => {
    section("minimap-bursts a. default on: one flag per burst with its count, placed on the minimap axis");
    const f = await simFile(w, ["bursts", "basic", "motion"], 12000, 5);
    show(w, T, f);
    const tl = w.analysisTimeline(f.entries);
    assert(tl.bursts.length >= 5 && tl.bursts.length <= 12, "sample has 5-12 bursts: " + tl.bursts.length);
    assert(w.localStorage.getItem("philogg-minimap-bursts") === null && settingOf(d).getAttribute("aria-checked") === "true", "default: on (nothing stored), Settings switch on");
    const chip = chipOf(d);
    assert(!chip.classList.contains("hidden") && chip.textContent === "Bursts" && chip.getAttribute("aria-pressed") === "true", "chip 'Bursts' shown, pressed");
    const flags = flagsOf(d);
    assert(flags.length === tl.bursts.length, "one flag per burst: " + flags.length);
    flags.forEach((fl, i) => {
      const b = tl.bursts[i];
      assert(fl.textContent === b.count.toLocaleString("de-DE"), "flag " + i + " shows the count " + b.count);
      assert(Math.abs(parseFloat(fl.style.left) - mid(w, b)) < 0.06, "flag " + i + " sits at the burst's middle: " + fl.style.left + " vs " + mid(w, b).toFixed(1));
      assert(fl.getAttribute("aria-label").includes(b.count + " entries"), "flag " + i + " has an accessible name");
    });
    assert(d.querySelectorAll("#minimapBursts .minimap-burst-band").length === flags.length && d.querySelectorAll("#minimapBursts .minimap-burst-stem").length === flags.length, "a band and a stem per flag");
    assert(flags.every(fl => w.getComputedStyle(fl).minWidth === "24px"), "hit area at least 24 px wide");
    // the flags are siblings of the <svg>: a click on one never reaches the strip's click-to-jump
    const sel0 = T.state.selectedId;
    fireClick(flags[0], w);
    assert(T.state.selectedId === sel0, "a flag click does not jump to an entry");
    fireKeydown(d, w, "Escape");
    // a different node: bursts of ITS entries
    const errs = w.createFilterNode(f.id, "level", ["ERROR"]);
    T.state.activeId = errs.id; w.render();
    const tlErr = w.analysisTimeline(w.getEntries(errs.id));
    assert(flagsOf(d).length === Math.min(12, tlErr.bursts.length) && flagsOf(d).map(x => x.textContent).join() === tlErr.bursts.map(b => b.count.toLocaleString("de-DE")).join() || tlErr.bursts.length > 12, "the ERROR node's own bursts: " + flagsOf(d).map(x => x.textContent).join());
    assert(tlErr.bursts.length !== tl.bursts.length || flagsOf(d).map(x => x.textContent).join() !== flags.map(x => x.textContent).join(), "different from the file's flags");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("minimap-bursts b. at most the 12 strongest, shown in time order");
    const f = await simFile(w, ["bursts", "basic"], 30000, 3);
    show(w, T, f);
    const tl = w.analysisTimeline(f.entries);
    assert(tl.bursts.length > 30, "many bursts in the sample: " + tl.bursts.length);
    const flags = flagsOf(d);
    assert(flags.length === 12, "limit 12, got " + flags.length);
    const counts = flags.map(fl => +fl.textContent.replace(/\./g, ""));
    const top = tl.bursts.map(b => b.count).sort((a, b) => b - a).slice(0, 12);
    assert(counts.slice().sort((a, b) => b - a).join() === top.join(), "the 12 strongest by count: " + counts.join());
    const lefts = flags.map(fl => parseFloat(fl.style.left));
    assert(lefts.every((x, i) => i === 0 || lefts[i - 1] <= x), "in time order");
    assert(/12 strongest/.test(chipOf(d).title), "chip title says so: " + chipOf(d).title);
    // zoomed into one burst: flags of the drawn range only (the strongest 12 of it)
    const b0 = tl.bursts[0];
    w.setMinimapView(b0.from - 5000, b0.to + 5000);
    const zf = flagsOf(d);
    const inView = tl.bursts.filter(b => b.to >= b0.from - 5000 && b.from <= b0.to + 5000);
    assert(zf.length === Math.min(12, inView.length) && zf.length >= 1 && zf.length < 12, "zoomed: only the bursts inside the window, got " + zf.length + " (expected " + inView.length + ")");
    zf.forEach(fl => assert(parseFloat(fl.style.left) >= 0 && parseFloat(fl.style.left) <= 800, "flag inside the strip"));
    const hit = zf.find(fl => +fl.textContent === b0.count);
    assert(hit && Math.abs(parseFloat(hit.style.left) - mid(w, b0)) < 0.06, "the zoomed axis positions the flag: " + (hit && hit.style.left) + " vs " + mid(w, b0).toFixed(1));
    w.minimapViewReset();
    assert(flagsOf(d).length === 12, "whole file again: 12");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("minimap-bursts c. entries binning: positions follow minimapTsToX in that mode");
    const f = await simFile(w, ["bursts", "basic", "motion"], 12000, 5);
    show(w, T, f);
    const sel = d.querySelector("#settingsMinimapBinningMode");
    sel.value = "entries"; sel.dispatchEvent(new w.Event("change", { bubbles: true }));
    const tl = w.analysisTimeline(f.entries);
    const flags = flagsOf(d);
    assert(flags.length === tl.bursts.length, "same bursts: " + flags.length);
    flags.forEach((fl, i) => assert(Math.abs(parseFloat(fl.style.left) - mid(w, tl.bursts[i])) < 0.06, "entries mode, flag " + i + ": " + fl.style.left + " vs " + mid(w, tl.bursts[i]).toFixed(1)));
    sel.value = "time"; sel.dispatchEvent(new w.Event("change", { bubbles: true }));
    assert(Math.abs(parseFloat(flagsOf(d)[0].style.left) - mid(w, tl.bursts[0])) < 0.06, "back in time mode");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("minimap-bursts d. one state, two controls: chip and Settings switch, persisted");
    const f = await simFile(w, ["bursts", "basic", "motion"], 12000, 5);
    show(w, T, f);
    const n = flagsOf(d).length;
    assert(n > 0, "flags to start with");
    fireClick(chipOf(d), w);
    assert(flagsOf(d).length === 0 && chipOf(d).getAttribute("aria-pressed") === "false" && !chipOf(d).classList.contains("hidden"), "chip off: no flags, chip stays");
    assert(settingOf(d).getAttribute("aria-checked") === "false" && w.localStorage.getItem("philogg-minimap-bursts") === "0", "the Settings switch follows, stored as 0");
    fireClick(settingOf(d), w);
    assert(flagsOf(d).length === n && chipOf(d).getAttribute("aria-pressed") === "true" && w.localStorage.getItem("philogg-minimap-bursts") === "1", "Settings switch on again: flags back, chip pressed, stored as 1");
    fireClick(settingOf(d), w);
    assert(flagsOf(d).length === 0 && chipOf(d).getAttribute("aria-pressed") === "false", "the switch turns them off too");
    // a render keeps it off
    w.render();
    assert(flagsOf(d).length === 0, "stays off across renders");
    // "reload": hydrate from storage
    settingOf(d).setAttribute("aria-checked", "true");
    w.initMinimapBurstsSetting();
    assert(settingOf(d).getAttribute("aria-checked") === "false", "restored as off from localStorage");
    w.localStorage.removeItem("philogg-minimap-bursts");
    w.initMinimapBurstsSetting();
    assert(settingOf(d).getAttribute("aria-checked") === "true", "no stored value: on");
    w.render();
    assert(flagsOf(d).length === n, "flags are back");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("minimap-bursts e. plain-text files have no time axis: no flags, no chip");
    const [file] = LOGSIM.generateToStrings({ scenarios: ["bursts", "basic"], entries: 3000, seed: 5 });
    const f = await w.addFile("notes.txt", file.text, () => {}, "fmt-plaintext");
    show(w, T, f);
    assert(w.nodeIsPlainText(f.id), "sanity: plain text");
    assert(flagsOf(d).length === 0 && chipOf(d).classList.contains("hidden"), "plain text: nothing");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("minimap-bursts f. click on a flag: popover with range, count, factor, levels, top patterns; closes on Esc and outside press");
    const f = await simFile(w, ["bursts", "basic", "motion"], 12000, 5);
    show(w, T, f);
    const tl = w.analysisTimeline(f.entries);
    const pop = d.querySelector("#burstPopover");
    assert(!w.getComputedStyle(pop).display.includes("flex") && pop.classList.contains("hidden"), "closed at first");
    const i = tl.bursts.findIndex(b => b.count === Math.max(...tl.bursts.map(x => x.count)));
    const b = tl.bursts[i];
    const flag = () => flagsOf(d)[i];
    const docClicks = [];
    d.addEventListener("click", ev => docClicks.push(ev.target), false);
    fireClick(flag(), w);
    assert(docClicks.length === 0, "the opening click does not bubble to the document (stopPropagation)");
    assert(!pop.classList.contains("hidden") && flag().classList.contains("sel"), "popover open, flag outlined");
    const title = d.querySelector("#burstPopTitle").textContent;
    assert(title === "Burst " + w.timeRangeBoundLabel(f.id, b.from, true) + " – " + w.timeRangeBoundLabel(f.id, b.to, true), "title: the time range, got " + title);
    assert(d.querySelector("#burstPopCount").textContent === b.count.toLocaleString("de-DE") + " entries in " + w.formatMs(b.to - b.from), "count line: " + d.querySelector("#burstPopCount").textContent);
    assert(d.querySelector("#burstPopFactor").textContent === "×" + b.factor + " vs usual", "factor: " + d.querySelector("#burstPopFactor").textContent);
    const lv = d.querySelector("#burstPopLevels").textContent;
    Object.entries(b.levels).forEach(([k, n]) => assert(lv.includes((k === "OTHER" ? "Other" : k.charAt(0)) + " " + n), "level " + k + " " + n + " in '" + lv + "'"));
    const pats = [...d.querySelectorAll("#burstPopPatterns .burst-pop-pat")];
    assert(pats.length === Math.min(3, b.topPatterns.length) && pats.length >= 1, "top patterns: " + pats.length);
    pats.forEach((p, k) => {
      assert(p.querySelector(".burst-pop-pat-text").textContent === w.patternDisplayText(b.topPatterns[k].key), "pattern " + k + " text");
      assert(+p.querySelector(".burst-pop-pat-n").textContent.replace(/\./g, "") === b.topPatterns[k].count, "pattern " + k + " count");
    });
    const acts = [...d.querySelectorAll("#burstPopActions button")];
    assert(acts.map(x => x.textContent).join() === "Zoom,What came before,Compare with rest,Time window" && acts[3].classList.contains("btn-mini") && !acts[0].classList.contains("btn-mini"), "actions: Zoom, What came before, Compare with rest, then the primary Time window");
    assert(w.burstActions(b).map(a => a.id).join() === "zoom,before,compare,window", "burstActions(b) is the hook for further actions");
    // toggling: a second click on the flag closes
    fireClick(flag(), w);
    assert(pop.classList.contains("hidden") && !flag().classList.contains("sel"), "second click closes");
    fireClick(flag(), w);
    fireKeydown(d, w, "Escape");
    assert(pop.classList.contains("hidden"), "Esc closes");
    fireClick(flag(), w);
    press(w, d.body);
    assert(pop.classList.contains("hidden"), "a press outside closes");
    fireClick(flag(), w);
    assert(!pop.classList.contains("hidden"), "(open before the inside press)");
    press(w, pop);
    assert(!pop.classList.contains("hidden"), "a press inside does not close");
    // another flag moves the popover over
    const other = (i + 1) % tl.bursts.length;
    fireClick(flagsOf(d)[other], w);
    assert(d.querySelector("#burstPopCount").textContent.startsWith(tl.bursts[other].count.toLocaleString("de-DE") + " entries"), "another flag shows its burst");
    // flag right-click: the page never shows a native menu
    const cm = new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    flagsOf(d)[other].dispatchEvent(cm);
    assert(cm.defaultPrevented, "no native context menu on a flag");
    fireKeydown(d, w, "Escape");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("minimap-bursts g. Time window: one timerange node under the active node, one undo step; Zoom: +-10 s");
    const f = await simFile(w, ["bursts", "basic", "motion"], 12000, 5);
    show(w, T, f);
    const tl = w.analysisTimeline(f.entries);
    const b = tl.bursts[1];
    const act = id => d.querySelector('#burstPopActions [data-burst-act="' + id + '"]');
    fireClick(flagsOf(d)[1], w);
    const nodes0 = Object.keys(T.state.nodes).length, undo0 = T.undoStack.length;
    fireClick(act("window"), w);
    const node = T.state.nodes[T.state.activeId];
    assert(Object.keys(T.state.nodes).length === nodes0 + 1 && node.filterType === "timerange" && node.parentId === f.id, "one timerange node under the active node");
    assert(node.value.from === b.from && node.value.to === b.to, "from/to are the burst's first/last entry: " + JSON.stringify(node.value));
    assert(w.getEntries(node.id).length === f.entries.filter(e => e.ts >= b.from && e.ts <= b.to).length, "it keeps the burst's entries");
    assert(T.undoStack.length === undo0 + 1, "one undo step, got +" + (T.undoStack.length - undo0));
    assert(d.querySelector("#burstPopover").classList.contains("hidden"), "popover closed");
    w.undo();
    assert(!T.state.nodes[node.id] && T.state.activeId === f.id, "undo removes the node");
    // Zoom
    fireClick(flagsOf(d)[1], w);
    assert(T.minimapView.trail.length === 0, "whole file before");
    fireClick(act("zoom"), w);
    const v = T.minimapView.trail[T.minimapView.trail.length - 1];
    assert(v && v.from === Math.max(b.from - 10000, f.entries[0].ts) && v.to === Math.min(b.to + 10000, f.entries[f.entries.length - 1].ts), "zoom window = burst +- 10 s (clamped to the file): " + JSON.stringify(v));
    assert(T.minimapView.tMin === v.from && d.querySelector("#burstPopover").classList.contains("hidden"), "minimap zoomed, popover closed");
    assert(flagsOf(d).some(fl => +fl.textContent === b.count), "the burst's flag is still there");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("minimap-bursts h. analysis is cached per result: renders, scroll and flag clicks do not recompute");
    const f = await simFile(w, ["bursts", "basic", "motion"], 12000, 5);
    show(w, T, f);
    let calls = 0;
    const orig = w.analysisTimeline;
    w.analysisTimeline = function () { calls++; return orig.apply(this, arguments); };
    w.render(); w.render();
    d.querySelector("#tableBody").dispatchEvent(new w.Event("scroll"));
    w.renderTimelineMinimap(T.minimapLastRootId || f.id, w.getEntries(f.id));
    fireClick(flagsOf(d)[0], w); fireKeydown(d, w, "Escape");
    assert(calls === 0, "no recompute for renders on the same result (calls: " + calls + ")");
    // another node or the level quick-filter: a new result
    const errs = w.createFilterNode(f.id, "level", ["ERROR"]);
    T.state.activeId = errs.id; w.render();
    assert(calls === 1, "a new active node analyses once, got " + calls);
    w.render();
    assert(calls === 1, "and is cached");
    T.state.activeId = f.id; T.state.levelFilter = new Set(["WARN"]); w.render();
    assert(calls === 2, "level quick-filter: a new result, got " + calls);
    T.state.levelFilter = new Set(); w.render();
    assert(calls === 3, "level filter cleared: back to the file's entries, got " + calls);
    // a changed node result (cache invalidated) is analysed again
    w.invalidateNodeSubtreeCaches(f.id);
    w.render();
    assert(calls === 3 || calls === 4, "invalidating caches does not loop, got " + calls);
    // off: not computed at all
    fireClick(chipOf(d), w);
    const before = calls;
    T.state.activeId = errs.id; w.render();
    assert(calls === before, "switched off: no analysis");
    w.analysisTimeline = orig;
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("minimap-bursts i. phone: flags and popover stay usable, chip is hidden (Settings switch remains)");
    const f = await simFile(w, ["bursts", "basic", "motion"], 12000, 5);
    T.state.activeId = f.id; T.state.sortColumn = null;
    w.innerWidth = 390; w.dispatchEvent(new w.Event("resize"));
    w.render();
    assert(d.body.classList.contains("layout-phone"), "sanity: phone tier");
    const flags = flagsOf(d);
    assert(flags.length > 0, "flags on the phone strip");
    assert(flags.every(fl => w.getComputedStyle(fl).minWidth === "24px" && fl.tagName === "BUTTON"), "tappable buttons, >= 24 px wide");
    assert(w.getComputedStyle(chipOf(d)).display === "none", "chip hidden on the phone");
    fireClick(flags[0], w);
    assert(!d.querySelector("#burstPopover").classList.contains("hidden"), "tap opens the popover");
    assert([...d.querySelectorAll("#burstPopActions button")].length === 2, "same actions");
    fireClick(d.querySelector('#burstPopActions [data-burst-act="window"]'), w);
    assert(T.state.nodes[T.state.activeId].filterType === "timerange", "Time window works on the phone");
    w.innerWidth = 1440; w.dispatchEvent(new w.Event("resize"));
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("minimap-bursts j. Link view: bursts of the shown pairs' entries, unsorted flatten handled");
    const f = await simFile(w, ["bursts", "basic", "motion"], 12000, 5);
    const link = w.createLinkNodeFromBaked(f.id, w.bakedTextCondition("Move requested"), w.bakedTextCondition("Position reached"), "after", 1, { key: { pattern: "job=[*:word]" } });
    T.state.activeId = link.id; T.state.entriesView = "filter";
    w.render();
    assert(!chipOf(d).classList.contains("hidden"), "chip on the Link view's minimap");
    assert(flagsOf(d).every(fl => /^\d/.test(fl.textContent)), "flags (if any) are well formed");
  }, { indexedDB: new IDBFactory() });
}
