// Fast path for `data-*` attribute selectors in jsdom's querySelector(All).
//
// Why: jsdom's selector engine (@asamuzakjp/dom-selector) walks the whole
// tree through the public DOM wrappers and reads every element's attributes
// through the Proxy-backed NamedNodeMap, so ONE document-wide
// `[data-row-action="bookmark"]` costs ~8ms on philogg.html's ~4,700 nodes.
// updateRowActionButtons runs ten of those on every render(), which alone was
// ~45% of the regression suite's CPU time. A real browser answers the same
// query in microseconds, so this is purely a test-environment cost.
//
// What: a selector list whose every item is exactly `[data-x]`, `[data-x="v"]`
// or `[data-x='v']` (lowercase name, no flags, no escapes) is answered here;
// anything else goes to jsdom's own engine untouched. Only "plain" data-*
// attributes are read here: no namespace, a local name of lowercase ASCII
// without a colon, the value compared as a plain string (the HTML legacy
// case-insensitive attribute list has no data-* entry). On those, jsdom's
// engine and the spec agree: descendants of the scope in tree order (never the
// scope itself, never template contents or shadow trees). Any other attribute
// that merely looks like data-* (uppercase or non-ASCII letters, a prefix or a
// colon, a namespace) hands the query back to jsdom's engine, because
// dom-selector reads those its own way: in an HTML document it lowercases every
// attribute name, SVG ones included, matches the part after a colon and
// namespaced attributes too, but compares names case-sensitively once a value
// is given. The app never creates such attributes, so the fallback costs
// nothing in practice.
//
// Document-wide queries go through an index (attribute name -> value ->
// elements in tree order) built by one walk and reused until the next tree
// insertion/removal or data-* attribute change anywhere (a process-wide
// generation counter bumped from jsdom's own _insert/_remove/_attrModified
// hooks). updateRowActionButtons' ten queries run with only `disabled` and
// class changes in between, so they share one walk. Element- and
// fragment-scoped queries (small subtrees) just walk.
//
//   JSDOM_SELECTORS=1       off: every query goes to jsdom's engine
//   JSDOM_SELECTORS=verify  answer every eligible query both ways and throw on
//                           any difference (a full-suite self-check)
//
// GROUP 346 checks the fast path against jsdom's engine on the real page.
"use strict";

require("jsdom"); // loads jsdom's internals in their own order; requiring one directly first breaks its cycles
const mode = process.env.JSDOM_SELECTORS === "1" ? "off" : process.env.JSDOM_SELECTORS === "verify" ? "verify" : "on";
const jsdomOriginals = new Map(); // "Document-impl.js:querySelectorAll" -> jsdom's own method
let planForExport = null, statsForExport = { fallbacks: 0 };

if (mode !== "off") {
  const idlUtils = require("jsdom/lib/generated/idl/utils.js");
  const NodeList = require("jsdom/lib/generated/idl/NodeList.js");
  const NodeImpl = require("jsdom/lib/jsdom/living/nodes/Node-impl.js").implementation;
  const ElementImpl = require("jsdom/lib/jsdom/living/nodes/Element-impl.js").implementation;

  // Plain data-* names are ours; anything else containing "data-" is EXOTIC
  // (see the header) and sends the query to jsdom's engine.
  const EXOTIC = -1;
  const PLAIN = /^data-[^A-Z:\u0080-\uffff]*$/;
  const LOOKS_DATA = /data-/i;
  const dataName = attr => {
    if (attr._namespace === null && PLAIN.test(attr._localName)) return attr._localName;
    return LOOKS_DATA.test(attr._qualifiedName) ? EXOTIC : null;
  };
  const stats = { fallbacks: 0 }; // eligible queries handed to jsdom because of an EXOTIC attribute
  statsForExport = stats;

  // --- invalidation: anything that can change a data-* match bumps `gen` ---
  let gen = 0;
  // Bumped before AND after the original runs, so an index built by anything
  // that runs synchronously inside it is never reused afterwards.
  for (const method of ["_insert", "_remove"]) {
    const orig = NodeImpl.prototype[method];
    NodeImpl.prototype[method] = function () { gen++; try { return orig.apply(this, arguments); } finally { gen++; } };
  }
  // Every attribute change (set/append/remove/replace, Attr.value) ends in
  // Element-impl's _attrModified; the subclasses that override it all call
  // super. `name` is the qualified name; EXOTIC ones count too.
  const origAttrModified = ElementImpl.prototype._attrModified;
  ElementImpl.prototype._attrModified = function (name) {
    if (!(typeof name === "string" && LOOKS_DATA.test(name))) return origAttrModified.apply(this, arguments);
    gen++;
    try { return origAttrModified.apply(this, arguments); } finally { gen++; }
  };

  // --- selector -> plan: [[name, value | null], ...], or null = not ours ---
  const ITEM = /^\s*\[\s*(data-[a-z0-9_-]+)\s*(?:=\s*(?:"([^"\\]*)"|'([^'\\]*)'))?\s*\]\s*$/;
  const plans = new Map();
  const planFor = sel => {
    if (typeof sel !== "string") return null;
    let plan = plans.get(sel);
    if (plan === undefined) {
      plan = [];
      for (const part of sel.split(",")) {
        const m = ITEM.exec(part);
        if (!m) { plan = null; break; }
        plan.push([m[1], m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : null]);
      }
      plans.set(sel, plan);
    }
    return plan;
  };
  planForExport = planFor;

  // Pre-order walk over the impl tree (firstChild/nextSibling/parentNode are
  // plain impl getters, however jsdom stores the tree underneath).
  const walk = (scope, visit) => {
    let n = scope.firstChild;
    while (n) {
      if (n.nodeType === 1 && visit(n) === false) return;
      let next = n.firstChild;
      while (!next && n !== scope) {
        next = n.nextSibling;
        if (!next) { n = n.parentNode; if (n === scope) break; }
      }
      n = next;
    }
  };

  // true / false, or EXOTIC when only jsdom's engine can tell. A plain match
  // decides on its own: jsdom's engine sees that attribute the same way.
  const matches = (el, plan) => {
    const list = el._attributeList;
    let exotic = false;
    for (let i = 0; i < list.length; i++) {
      const name = dataName(list[i]);
      if (name === EXOTIC) { exotic = true; continue; }
      if (name === null) continue;
      for (const [want, value] of plan) {
        if (name === want && (value === null || list[i]._value === value)) return true;
      }
    }
    return exotic ? EXOTIC : false;
  };
  // Matches in tree order, or null when an EXOTIC element could change them.
  const scan = (scope, plan, firstOnly) => {
    let out = [];
    walk(scope, el => {
      const m = matches(el, plan);
      if (m === EXOTIC) { out = null; return false; }
      if (!m) return true;
      out.push(el);
      return !firstOnly;
    });
    return out;
  };

  // Document index: name -> { all: [[seq, el]], byValue: Map(value -> [[seq, el]]) },
  // each list in tree order (seq = the element's position in the walk); null
  // while the document holds an EXOTIC attribute. An element's plain names are
  // unique (one attribute per namespace + local name).
  const indexes = new WeakMap();
  const addTo = (map, key, item) => { const l = map.get(key); if (l) l.push(item); else map.set(key, [item]); };
  const indexFor = doc => {
    const cached = indexes.get(doc);
    if (cached && cached.gen === gen) return cached.byName;
    let byName = new Map();
    let seq = 0;
    walk(doc, el => {
      seq++;
      const list = el._attributeList;
      for (let i = 0; i < list.length; i++) {
        const name = dataName(list[i]);
        if (name === null) continue;
        if (name === EXOTIC) { byName = null; return false; }
        let e = byName.get(name);
        if (!e) byName.set(name, e = { all: [], byValue: new Map() });
        e.all.push([seq, el]);
        addTo(e.byValue, list[i]._value, [seq, el]);
      }
      return true;
    });
    indexes.set(doc, { gen, byName });
    return byName;
  };
  const lookup = (doc, plan, firstOnly) => {
    const byName = indexFor(doc);
    if (!byName) return null;
    const hits = [];
    for (const [name, value] of plan) {
      const e = byName.get(name);
      const list = !e ? null : value === null ? e.all : e.byValue.get(value);
      if (list) hits.push(list);
    }
    let merged;
    if (hits.length <= 1) merged = hits.length ? hits[0] : [];
    else {
      merged = hits.flat().sort((a, b) => a[0] - b[0]).filter((x, i, arr) => i === 0 || arr[i - 1][0] !== x[0]);
    }
    return (firstOnly ? merged.slice(0, 1) : merged).map(x => x[1]);
  };

  const scopeIsReady = impl => !(impl === impl._ownerDocument && !impl.documentElement); // jsdom selects nothing during init
  // Impl elements in tree order, or null = ask jsdom's engine.
  const fastQuery = (scope, plan, firstOnly) => {
    const hits = scope === scope._ownerDocument ? lookup(scope, plan, firstOnly) : scan(scope, plan, firstOnly);
    if (!hits) stats.fallbacks++;
    return hits;
  };
  const sameNodes = (fast, slow) => fast.length === slow.length && fast.every((n, i) => n === slow[i]);
  const mismatch = (sel, fast, slow) => new Error("jsdom-fast-selectors: " + JSON.stringify(sel) + " gave " + fast.length + " node(s), jsdom's engine " + slow.length);

  for (const file of ["Document-impl.js", "Element-impl.js", "DocumentFragment-impl.js"]) {
    const proto = require("jsdom/lib/jsdom/living/nodes/" + file).implementation.prototype;
    const qsa = proto.querySelectorAll, qs = proto.querySelector;
    jsdomOriginals.set(file + ":querySelectorAll", qsa);
    jsdomOriginals.set(file + ":querySelector", qs);
    proto.querySelectorAll = function (selectors) {
      const plan = planFor(selectors);
      const hits = plan && scopeIsReady(this) ? fastQuery(this, plan, false) : null;
      if (!hits) return qsa.call(this, selectors);
      const nodes = hits.map(n => idlUtils.tryWrapperForImpl(n));
      if (mode === "verify") {
        const list = qsa.call(this, selectors);
        const slow = Array.from({ length: list.length }, (_, i) => idlUtils.tryWrapperForImpl(list.item(i)));
        if (!sameNodes(nodes, slow)) throw mismatch(selectors, nodes, slow);
      }
      return NodeList.createImpl(this._globalObject, [], { nodes });
    };
    proto.querySelector = function (selectors) {
      const plan = planFor(selectors);
      const hits = plan && scopeIsReady(this) ? fastQuery(this, plan, true) : null;
      if (!hits) return qs.call(this, selectors);
      const [first] = hits;
      const node = first ? idlUtils.tryWrapperForImpl(first) : null;
      if (mode === "verify") {
        const slow = qs.call(this, selectors);
        if (node !== (slow ? idlUtils.tryWrapperForImpl(slow) : null)) throw mismatch(selectors, node ? [node] : [], slow ? [slow] : []);
      }
      return node;
    };
  }
}

// For GROUP 346: jsdom's own answer for a (wrapper) node, bypassing the fast
// path, whether a selector is one the fast path answers at all, and how often
// an EXOTIC attribute sent an eligible query back to jsdom.
const { implForWrapper, tryWrapperForImpl } = require("jsdom/lib/generated/idl/utils.js");
const IMPL_FILE = { 1: "Element-impl.js", 9: "Document-impl.js", 11: "DocumentFragment-impl.js" };
function jsdomQuerySelectorAll(node, selector) {
  const orig = jsdomOriginals.get(IMPL_FILE[node.nodeType] + ":querySelectorAll");
  if (!orig) return [...node.querySelectorAll(selector)];
  const list = orig.call(implForWrapper(node), selector);
  return Array.from({ length: list.length }, (_, i) => tryWrapperForImpl(list.item(i)));
}
function jsdomQuerySelector(node, selector) {
  const orig = jsdomOriginals.get(IMPL_FILE[node.nodeType] + ":querySelector");
  if (!orig) return node.querySelector(selector);
  const hit = orig.call(implForWrapper(node), selector);
  return hit ? tryWrapperForImpl(hit) : null;
}

module.exports = { mode, jsdomOriginals, eligible: sel => !!(planForExport && planForExport(sel)), stats: statsForExport, jsdomQuerySelectorAll, jsdomQuerySelector };
