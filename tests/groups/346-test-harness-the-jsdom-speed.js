// GROUP 346 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 346 — Test harness: the jsdom speed-ups stay exact
   Origin: 2026-09-30 test-suite speed-up session. jsdom-fast-selectors.js
   answers `[data-*]` selector lists itself (jsdom's own engine made them ~45%
   of the suite's CPU time): its answers are held against jsdom's engine on
   the real page, across scopes, edge cases and every kind of mutation its
   document index must notice. Also pins what withApp changes about the page
   itself: the stylesheet put back after the parse, the background polls
   caught by name.
   ============================================================ */
group(346);
await withApp(async (w, d, T) => {
  section("346a. data-* fast path == jsdom's engine for every data-* name/value on the loaded page, in document, element and fragment scope");
  const FS = FAST_SELECTORS;
  const f = await w.addFile("a.log", makeLog(0, 30), () => {});
  T.state.activeId = f.id;
  w.render();
  const sameNodes = (a, b) => a.length === b.length && a.every((n, i) => n === b[i]);
  const mismatches = [];
  let checked = 0;
  const check = (scope, sel, label) => {
    checked++;
    const fast = [...scope.querySelectorAll(sel)], slow = FS.jsdomQuerySelectorAll(scope, sel);
    if (!sameNodes(fast, slow)) mismatches.push(label + " " + sel + ": " + fast.length + " vs " + slow.length);
    if (scope.querySelector(sel) !== FS.jsdomQuerySelector(scope, sel)) mismatches.push(label + " " + sel + ": querySelector differs");
  };
  const pairs = new Map();
  for (const el of d.querySelectorAll("*")) {
    for (const a of el.attributes) {
      if (!a.name.startsWith("data-")) continue;
      if (!pairs.has(a.name)) pairs.set(a.name, new Set());
      pairs.get(a.name).add(a.value);
    }
  }
  const selectors = ['[data-row-action="filterForMessage"], [data-row-action="extractMessage"]', "[data-row-action], [data-row-actions]", "[data-nope]", '[data-row-action="nope"]'];
  for (const [name, values] of pairs) {
    selectors.push("[" + name + "]");
    // Two values per name reach the index's value lookup; the other quoting
    // only needs one (each extra selector costs jsdom's engine ~10 queries here).
    [...values].filter(v => !/["'\\]/.test(v)).slice(0, 2).forEach((v, i) => {
      selectors.push("[" + name + '="' + v + '"]');
      if (i === 0) selectors.push("[ " + name + " = '" + v + "' ]");
    });
  }
  const frag = d.createDocumentFragment();
  frag.appendChild(d.querySelector("#tree").cloneNode(true));
  const scopes = [[d, "document"], [d.querySelector("#app"), "#app"], [d.querySelector("#tree"), "#tree"], [d.body.lastElementChild, "last body child"], [frag, "fragment"]];
  for (const sel of selectors) for (const [scope, label] of scopes) check(scope, sel, label);
  assert(pairs.size >= 10 && selectors.length > 40, "sanity: the page carries plenty of data-* to check, got " + pairs.size + " names, " + selectors.length + " selectors");
  assert(FS.mode === "off" || selectors.every(FS.eligible), "every selector built here is one the fast path answers");
  assert(FS.mode === "off" || !["div[data-x]", "[data-x i]", "[DATA-X]", "[data-x=a]", "[data-x~=\"a\"]", "[data-x=\"a\\\"b\"]", ".a, [data-x]", "[aria-label]"].some(FS.eligible),
    "anything but plain [data-*] lists stays with jsdom's engine");
  assert(mismatches.length === 0, "querySelector(All) matches jsdom's engine on all " + checked + " selector/scope pairs: " + mismatches.slice(0, 4));

  section("346b. edge cases: scope itself excluded, template contents, detached trees; odd-shaped data-* names go back to jsdom's engine");
  mismatches.length = 0;
  const fallbacksBefore = FS.stats.fallbacks;
  const box = d.createElement("div");
  box.setAttribute("data-k", "a"); // the scope itself: never in box.querySelectorAll
  box.innerHTML = '<p data-k="a"></p><span data-k="b" data-o=""><i data-k="a"></i></span><template><b data-k="a"></b></template><svg><g data-k="a"></g><g></g></svg><em></em>';
  d.body.appendChild(box);
  const [, , svgPlain] = box.querySelectorAll("g");
  // Shapes dom-selector reads its own way (see the module header): the fast
  // path must hand these queries back, not guess.
  const [g1, em, pEl, spanEl] = [box.querySelectorAll("g")[1], box.querySelector("em"), box.querySelector("p"), box.querySelector("span")];
  const exotic = [ // [element, namespace, local name]
    [g1, null, "data-K"], // non-HTML element keeps the uppercase name
    [em, null, "DATA-K"], // setAttributeNS skips the HTML lowercasing
    [em, "urn:x", "data-k"], // prefixed + namespaced (x:data-k)
    [pEl, "urn:x2", "data-k"], // namespaced, unprefixed, value "zz"
    [spanEl, null, "x:data-k"], // a colon in a null-namespace name
  ];
  g1.setAttribute("data-K", "a");
  em.setAttributeNS(null, "DATA-K", "a");
  em.setAttributeNS("urn:x", "x:data-k", "a");
  pEl.setAttributeNS("urn:x2", "data-k", "zz");
  spanEl.setAttribute("x:data-k", "a");
  assert(exotic.every(([el, ns, local]) => el.hasAttributeNS(ns, local)), "sanity: every odd-shaped attribute is in place");
  const detached = d.createElement("div");
  detached.innerHTML = '<a data-k="a"><b data-k="c"></b></a>';
  const edgeSelectors = ["[data-k]", '[data-k="a"]', "[data-k='b']", '[data-k="zz"]', "[data-o]", '[data-o=""]', "[data-k], [data-o]", '[data-k="b"], [data-k="a"]'];
  for (const sel of edgeSelectors) {
    for (const [scope, label] of [[d, "document"], [box, "box"], [box.querySelector("template").content, "template content"], [detached, "detached"], [box.querySelector("svg"), "svg"]]) check(scope, sel, label);
  }
  assert(svgPlain === undefined && ![...box.querySelectorAll("[data-k]")].includes(box), "the scope element itself is never part of its own result");
  assert(![...d.querySelectorAll("[data-k]")].some(e => e.localName === "b"), "template contents are not part of the document's tree");
  assert(mismatches.length === 0, "edge cases match jsdom's engine: " + mismatches.slice(0, 4));
  assert(FS.mode === "off" || FS.stats.fallbacks > fallbacksBefore, "the odd-shaped names sent queries back to jsdom's engine");

  section("346c. the document index notices every kind of mutation");
  mismatches.length = 0;
  for (const [el, ns, local] of exotic) el.removeAttributeNS(ns, local); // the index only answers while none are left
  const fallbacksPlain = FS.stats.fallbacks;
  const probe = label => { for (const sel of ["[data-k]", '[data-k="a"]', '[data-k="z"]', '[data-k="b"], [data-k="z"]', "[data-flag]"]) check(d, sel, label); };
  probe("warm"); probe("warm again");
  const p = box.querySelector("p"), span = box.querySelector("span");
  const steps = [
    ["appendChild", () => { const x = d.createElement("u"); x.dataset.k = "z"; box.appendChild(x); }],
    ["remove", () => span.remove()],
    ["setAttribute value", () => p.setAttribute("data-k", "z")],
    ["removeAttribute", () => p.removeAttribute("data-k")],
    ["dataset", () => { p.dataset.k = "b"; }],
    ["Attr.value", () => { p.getAttributeNode("data-k").value = "a"; }],
    ["setAttributeNode", () => { const at = d.createAttribute("data-k"); at.value = "z"; box.querySelector("em").setAttributeNode(at); }],
    ["toggleAttribute", () => p.toggleAttribute("data-flag")],
    ["className only", () => { p.className = "changed"; }],
    ["insertBefore (move)", () => box.insertBefore(box.lastElementChild, box.firstChild)],
    ["innerHTML", () => { p.innerHTML = '<q data-k="z"></q>'; }],
    ["insertAdjacentHTML", () => box.insertAdjacentHTML("beforeend", '<s data-k="b"></s>')],
    ["textContent clears", () => { p.textContent = ""; }],
    ["adopt from another document", () => { const other = d.implementation.createHTMLDocument(""); const x = other.createElement("div"); x.setAttribute("data-k", "a"); box.appendChild(x); }],
    ["replaceChildren", () => detached.replaceChildren()],
    ["box removed", () => box.remove()],
  ];
  for (const [label, run] of steps) { run(); probe(label); }
  assert(mismatches.length === 0, "after each mutation the fast path matches jsdom's engine: " + mismatches.slice(0, 4));
  assert(FS.stats.fallbacks === fallbacksPlain, "...answered by the index itself, not handed back to jsdom's engine");
  const late = d.createElement("i");
  d.body.appendChild(late);
  probe("before an odd-shaped name");
  late.setAttribute("x:data-k", "a"); // no "data-" prefix, still has to drop the index
  probe("odd-shaped name added");
  late.remove();
  assert(mismatches.length === 0, "an odd-shaped data-* name added later drops the index too: " + mismatches.slice(0, 4));

  section("346d. withApp: the stylesheet is back in <style> in full, the background polls are caught");
  const styleEl = d.head.querySelector("style");
  assert(styleEl && styleEl.textContent === PAGE_CSS && styleEl.sheet && d.styleSheets.length >= 1, "the app's stylesheet is in its <style> element and parsed");
  const inline = new JSDOM("<!DOCTYPE html><style>" + PAGE_CSS + "</style>");
  assert(styleEl.sheet.cssRules.length === inline.window.document.styleSheets[0].cssRules.length && styleEl.sheet.cssRules.length > 500,
    "same rules as parsing it inline: " + styleEl.sheet.cssRules.length);
  inline.window.close();
  assert(w.__pausedBackgroundPolls.includes("tailTick") && w.__pausedBackgroundPolls.includes("folderScanTick") && w.__pausedBackgroundPolls.length === 2,
    "both background polls were caught by name (a rename would silently let them run again): " + w.__pausedBackgroundPolls);
  assert(typeof w.tailTick === "function" && typeof w.folderScanTick === "function", "...and stay callable by the groups that need a tick");
});
if (groupSelected()) {
  section("346f. app work still running when its window closes doesn't end the shard");
  let release;
  const gate = new Promise(r => { release = r; }); // host-side, like fake-indexeddb's requests
  await withApp(async (w, d) => {
    w.__lateGate = () => gate;
    const s = d.createElement("script");
    s.textContent = "(async () => { await __lateGate(); document.createDocumentFragment(); })();";
    d.body.appendChild(s);
  });
  const before = lateRejectionsDropped;
  release();
  await sleep(20);
  assert(lateRejectionsDropped === before + 1, "the closed window's rejection was dropped instead of crashing this process");
}
if (groupSelected()) {
  section("346e. run.js: groups split across shards run exactly once, the slowest are listed above the total");
  const env = { ...process.env, GROUP: "1,2", SHARDS: "2" };
  delete env.SHARD; delete env.SHARD_CLAIMS; // this shard's own, not the nested run's
  const run = await new Promise(resolve => {
    require("child_process").execFile(process.execPath, [path.join(__dirname, "run.js")], { env, maxBuffer: 16 * 2 ** 20 },
      (err, stdout) => resolve({ code: err ? err.code : 0, out: stdout }));
  });
  const lines = run.out.split("\n");
  const count = title => lines.filter(l => l === "== " + title + " ==").length;
  const total = lines.findIndex(l => / passed, 0 failed across 2 shards in /.test(l));
  const head = lines.indexOf("Slowest groups:");
  const listed = head < 0 ? [] : lines.slice(head + 1, total).map(l => /^ {2}GROUP (\S+) +(\d+\.\d)s$/.exec(l));
  assert(run.code === 0 && total > 0, "the nested sharded run of GROUP 1,2 passes: " + lines.slice(-3).join(" | "));
  assert(count("1. Parsing & basic load") === 1 && count("2. Filter creation basics + live match + token chips") === 1,
    "each group ran in exactly one of the two shards");
  assert(head > 0 && head < total && listed.length === 2 && listed.every(Boolean) && listed.map(m => m[1]).sort().join() === "1,2",
    "the two groups that ran, and only those, are listed above the total: " + lines.slice(head, total + 1).join(" | "));
  assert(!/##SHARD |##GROUPS /.test(run.out), "the machine-readable lines stay out of the output");
}
