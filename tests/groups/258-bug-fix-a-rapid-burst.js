// GROUP 258 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 258 — Bug fix: a rapid burst of #tableBody/#highlightBody scroll
   events (native keyboard End/Home, momentum scrolling, ...) used to
   trigger one full renderVisibleRows()/renderHighlightVisibleRows() DOM
   rebuild per animation frame via requestAnimationFrame batching alone —
   cheap for an ordinary file, but expensive enough on a huge compressed
   merge to visibly compete with the browser's own native scroll-animation
   scheduling for main-thread time (person-reported, 2026-09-21, confirmed
   via real Firefox telemetry: holding "End" on an 822,697-entry merge
   repeatedly stalled the native scrollTop >150,000 physical px short of
   the true max, non-deterministically between attempts). That fix
   throttled bursts to one render per 100ms; 2026-09-24 replaced the
   throttle with makeScrollRenderer (one render per animation frame, reading
   the final scroll position, plus a cost-based backoff for expensive
   renders — see GROUP 266), because the 100ms gaps let the viewport scroll
   past the rendered rows. This group now pins the parts both share: a
   scroll render is deferred onto a frame, and a burst collapses onto one
   render that already shows the final position.
   ============================================================ */
group(258);
await withApp(async (w, d, T) => {
  section("258a. A single, isolated scroll event still renders on its very next animation frame — no regression for ordinary (non-burst) scrolling");
  const f = await w.addFile("a.log", makeLog(0, 200), () => {});
  T.state.activeId = f.id;
  w.render();

  const s = d.createElement("script");
  s.textContent = `
    const __origRVR = renderVisibleRows;
    renderVisibleRows = function() { window.__rvrCalls = (window.__rvrCalls||0)+1; return __origRVR(); };
  `;
  d.body.appendChild(s);
  w.__rvrCalls = 0;

  const tableBody = d.querySelector("#tableBody");
  tableBody.scrollTop = T.ROW_HEIGHT * 5;
  tableBody.dispatchEvent(new w.Event("scroll", { bubbles: true }));
  assert(w.__rvrCalls === 0, "the render does NOT run synchronously inside the scroll handler — still deferred onto a frame, got " + w.__rvrCalls);

  await sleep(50); // let the batched rAF actually fire, same idiom GROUP 47 uses
  assert(w.__rvrCalls === 1, "a single scroll event still produces exactly one render on its next frame, got " + w.__rvrCalls);
});

await withApp(async (w, d, T) => {
  section("258b. A rapid burst of scroll events collapses into far fewer renders, and the trailing catch-up render still reflects the true final scrollTop — the actual regression check for the reported bug");
  const f = await w.addFile("a.log", makeLog(0, 2000), () => {});
  T.state.activeId = f.id;
  w.render();

  const s = d.createElement("script");
  s.textContent = `
    const __origRVR = renderVisibleRows;
    renderVisibleRows = function() { window.__rvrCalls = (window.__rvrCalls||0)+1; return __origRVR(); };
  `;
  d.body.appendChild(s);
  w.__rvrCalls = 0;

  const tableBody = d.querySelector("#tableBody");
  // Ten rapid scroll events, all before one animation frame has a chance
  // to elapse — simulates the dense event stream a native keyboard-scroll
  // animation produces.
  const targets = [];
  for (let i = 1; i <= 10; i++) {
    const top = T.ROW_HEIGHT * i * 10;
    targets.push(top);
    tableBody.scrollTop = top;
    tableBody.dispatchEvent(new w.Event("scroll", { bubbles: true }));
  }
  const lastTop = targets[targets.length - 1];

  await sleep(50); // long enough for the next frame's render
  assert(w.__rvrCalls === 1, "ten rapid-fire events collapse onto exactly one render, got " + w.__rvrCalls);
  assert(tableBody.scrollTop === lastTop, "sanity: scrollTop itself already reflects the last dispatched event (scrollTop is a plain DOM property)");
  const expectedIdx = Math.floor(lastTop / T.ROW_HEIGHT);
  const expectedEntry = f.entries[expectedIdx];
  assert(d.querySelector('#tableRows [data-entry-id="' + expectedEntry.id + '"]'), "that one render reflects the TRUE final scrollTop (the last of the ten events), not a stale intermediate one");

  await sleep(150);
  assert(w.__rvrCalls === 1, "no redundant trailing render once the burst settles, got " + w.__rvrCalls + " total");
});

await withApp(async (w, d, T) => {
  section("258c. Same collapsing for the twin #highlightBody/renderHighlightVisibleRows listener");
  const f = await w.addFile("a.log", makeLog(0, 200), () => {});
  T.state.activeId = f.id;
  w.render();
  w.applyFhView("stacked"); // Context/Full split — makes #highlightBody the visible Full-view scroller

  const s = d.createElement("script");
  s.textContent = `
    const __origRHVR = renderHighlightVisibleRows;
    renderHighlightVisibleRows = function() { window.__rhvrCalls = (window.__rhvrCalls||0)+1; return __origRHVR(); };
  `;
  d.body.appendChild(s);
  w.__rhvrCalls = 0;

  const highlightBody = d.querySelector("#highlightBody");
  for (let i = 1; i <= 5; i++) {
    highlightBody.scrollTop = T.ROW_HEIGHT * i * 5;
    highlightBody.dispatchEvent(new w.Event("scroll", { bubbles: true }));
  }
  await sleep(50);
  assert(w.__rhvrCalls === 1, "a rapid burst on #highlightBody also collapses onto one render, got " + w.__rhvrCalls);
  await sleep(150);
  assert(w.__rhvrCalls === 1, "and no redundant trailing render once it settles, got " + w.__rhvrCalls);
});
