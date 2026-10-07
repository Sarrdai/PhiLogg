// GROUP relative-time — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP relative-time — Time column as an offset from a pinned "time zero"
   row (FEATURE_BACKLOG.md #6, step 1: display, context menu item, header
   chip, entry detail, minimap zero line; persistence is step 2).
   Origin: 2026-10-07.
   ============================================================ */
group("relative-time");
await withApp(async (w, d, T) => {
  section("relative-time a. formatRelTime");
  const f = w.formatRelTime;
  assert(f(0) === "0:00.000" && f(-0.4) === "0:00.000", "zero has no sign");
  assert(f(1234) === "+0:01.234", "+m:ss.mmm, got " + f(1234));
  assert(f(-420) === "−0:00.420", "negative uses the real minus sign, got " + f(-420));
  assert(f(3599999) === "+59:59.999", "just under 1 h stays m:ss.mmm, got " + f(3599999));
  assert(f(3723456) === "+1:02:03.456", "1 h and up: h:mm:ss.mmm, got " + f(3723456));
  assert(f(-3723456) === "−1:02:03.456", "negative hours, got " + f(-3723456));
  assert(f(2 * 86400000 + 3723456) === "+2d 01:02:03.456", "days, got " + f(2 * 86400000 + 3723456));
  assert(f(1234.6) === "+0:01.235" && f(3599999.6) === "+1:00:00.000", "rounds to whole ms before picking the format, got " + f(1234.6) + " / " + f(3599999.6));

  section("relative-time b. context menu sets the zero; rows show offsets");
  const [sim] = LOGSIM.generateToStrings({ entries: 120, seed: 7 });
  const fa = await w.addFile(sim.name, sim.text, () => {});
  T.state.activeId = fa.id;
  w.render();
  const rowOf = (id, root) => d.querySelector((root || "#tableRows") + ' [data-entry-id="' + id + '"]');
  const menuOn = (row) => { row.dispatchEvent(new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 20 })); };
  const zeroE = fa.entries[3], otherE = fa.entries[5];
  assert(rowOf(zeroE.id) && rowOf(otherE.id), "both rows are rendered");
  assert(!d.querySelector("[data-zero-chip]") && !T.state.relativeTime, "no chip, absolute display before any zero");
  menuOn(rowOf(zeroE.id));
  const item = d.querySelector("#ctxTimeZero");
  assert(item.style.display !== "none" && d.querySelector("#ctxTimeZeroLabel").textContent === "Set as time zero", "menu offers 'Set as time zero'");
  item.click();
  assert(T.state.timeZeroId === zeroE.id && T.state.relativeTime === true, "state: zero pinned, relative on");
  const zCell = rowOf(zeroE.id).querySelector(".col-time");
  assert(zCell.textContent === "0:00.000" && zCell.classList.contains("t-zero") && rowOf(zeroE.id).classList.contains("row-zero"), "the zero row shows 0:00.000 with the zero marker, got " + zCell.textContent);
  const oCell = rowOf(otherE.id).querySelector(".col-time");
  const expect = w.formatRelTime(otherE.ts - zeroE.ts);
  assert(oCell.textContent === expect && !oCell.classList.contains("t-zero"), "another row shows " + expect + ", got " + oCell.textContent);
  assert(oCell.title === w.entryTimeText(otherE), "its title is the absolute time, got " + oCell.title);

  section("relative-time c. header chip toggles relative on/off without sorting");
  let chip = d.querySelector("#tableHeader [data-zero-chip]");
  assert(chip && chip.textContent === "T0 ×" && !chip.classList.contains("off"), "chip 'T0 ×' in the Filter header, got " + (chip && chip.textContent));
  assert(d.querySelector("#highlightHeader [data-zero-chip]"), "chip in the Highlight header too");
  const sortBefore = T.state.sortColumn;
  chip.click();
  assert(T.state.relativeTime === false && T.state.timeZeroId === zeroE.id, "click: relative off, zero remembered");
  assert(T.state.sortColumn === sortBefore, "the chip click did not change the sort");
  assert(rowOf(otherE.id).querySelector(".col-time").textContent === w.entryTimeText(otherE), "cells show the absolute time again");
  chip = d.querySelector("#tableHeader [data-zero-chip]");
  assert(chip && chip.textContent === "T0" && chip.classList.contains("off"), "muted 'T0' chip while off");
  chip.click();
  assert(T.state.relativeTime === true && rowOf(otherE.id).querySelector(".col-time").textContent === expect, "click again: relative on");
  assert(T.state.sortColumn === sortBefore, "still no sort change");

  section("relative-time d. entry detail, highlight view, minimap line");
  w.selectEntry(otherE.id);
  const dt = d.querySelector("#detailMeta .detail-time").textContent;
  assert(dt.startsWith(w.entryTimeText(otherE)) && dt.endsWith("(" + expect + " from T0)"), "detail shows absolute time + '(… from T0)', got " + dt);
  w.selectEntry(zeroE.id);
  assert(d.querySelector("#detailMeta .detail-time").textContent.endsWith("(T0)"), "detail on the zero row ends with (T0)");
  w.selectEntry(otherE.id);
  T.state.pinBookmarksInFilteredView = false;
  w.showFhTab && w.showFhTab("highlight");
  w.render();
  const hlRow = rowOf(otherE.id, "#highlightRows");
  if (hlRow) assert(hlRow.querySelector(".col-time").textContent === expect, "Highlight view row shows the relative text too");
  else assert(false, "Highlight view renders the entry's row");
  w.showFhTab && w.showFhTab("filter");
  w.render();
  w.updateMinimapSelectionMarkers();
  assert(d.querySelector("#minimapSelectionMarkers .minimap-zero-line") && d.querySelector("#minimapSelectionMarkers .minimap-zero-label").textContent === "0", "minimap draws the zero line + '0' label");
  T.state.relativeTime = false;
  w.render(); w.updateMinimapSelectionMarkers();
  assert(!d.querySelector(".minimap-zero-line"), "no zero line in absolute mode");
  d.querySelector("#tableHeader [data-zero-chip]").click();

  section("relative-time e. 'Clear time zero' on the zero row");
  menuOn(rowOf(zeroE.id));
  assert(d.querySelector("#ctxTimeZeroLabel").textContent === "Clear time zero", "label reads 'Clear time zero' on the zero row");
  d.querySelector("#ctxTimeZero").click();
  assert(T.state.timeZeroId === null && T.state.relativeTime === false, "state cleared");
  assert(!d.querySelector("[data-zero-chip]"), "no chip");
  assert(rowOf(otherE.id).querySelector(".col-time").textContent === w.entryTimeText(otherE), "absolute time again");
  assert(!d.querySelector("#detailMeta .detail-t0"), "no detail suffix");

  section("relative-time f. not in view chip, plain-text rows, zero entry gone");
  menuOn(rowOf(zeroE.id));
  d.querySelector("#ctxTimeZero").click();
  const f2 = w.createFilterNode(fa.id, "text", "zzz-no-match-zzz");
  T.state.activeId = f2.id;
  w.render();
  chip = d.querySelector("#tableHeader [data-zero-chip]");
  assert(chip && chip.textContent === "T0 · not in view ×", "chip says not in view, got " + (chip && chip.textContent));
  T.state.activeId = fa.id;
  w.render();
  assert(d.querySelector("#tableHeader [data-zero-chip]").textContent === "T0 ×", "back in view: plain chip");

  const [pt] = LOGSIM.generateToStrings({ format: "plain", entries: 10, seed: 3 });
  const fp = await w.addFile(pt.name, pt.text, () => {}, "fmt-plaintext");
  T.state.activeId = fp.id;
  w.render();
  w.openContextMenu({ clientX: 20, clientY: 20, target: d.body }, fp.entries[2]);
  assert(d.querySelector("#ctxTimeZero").style.display === "none", "menu item hidden for a plain-text row");
  assert(w.displayTimeText(fp.entries[2], { id: "x", ts: 0 }) === String(fp.entries[2].ts), "a plain-text entry's time is never relative");
  w.closeContextMenu();

  T.state.activeId = fa.id;
  w.render();
  let threw = null;
  try { w.deleteNode(fa.id); w.render(); } catch (err) { threw = err; }
  assert(!threw, "closing the zero entry's file does not throw" + (threw ? ": " + threw.message : ""));
  assert(!d.querySelector("[data-zero-chip]"), "no chip once the zero entry is gone");
  assert(!d.querySelector("#tableRows .t-rel"), "no relative cells once the zero entry is gone");
});

/* ---- step 2: persistence (session cache + session export/import) ---- */
{
  const [sim] = LOGSIM.generateToStrings({ entries: 60, seed: 11 });
  const factory = new IDBFactory();
  let exportedJson = null;

  await withApp(async (w, d, T) => {
    section("relative-time g. session cache: zero + mode persisted");
    const f = await w.addFile(sim.name, sim.text, () => {});
    T.state.activeId = f.id;
    w.render();
    T.state.timeZeroId = f.entries[7].id;
    T.state.relativeTime = true;
    await w.persistFileNode(f);
    await w.persistMetaNow();
    const meta = await w.cacheStoreOp("meta", "readonly", s => s.get("session"));
    assert(meta.timeZero && meta.timeZero.file === f.cacheKey && meta.timeZero.ordinal === 7, "meta.timeZero is file + ordinal");
    assert(meta.settings.relativeTime === true, "meta.settings.relativeTime persisted");
    exportedJson = JSON.stringify(w.buildSessionExport([f.id], new Set()));
  }, { indexedDB: factory });

  await withApp(async (w, d, T) => {
    await T.bootRestore;
    const f = T.state.nodes[T.state.rootIds[0]];
    assert(T.state.timeZeroId === f.entries[7].id && T.state.relativeTime === true, "cache restore: zero entry and relative mode are back");
    T.state.activeId = f.id;
    w.render();
    assert(d.querySelector("#tableHeader [data-zero-chip]") && d.querySelector("#tableRows .t-zero"), "restored view shows the chip and the zero row");
  }, { indexedDB: factory });

  await withApp(async (w, d, T) => {
    section("relative-time h. session export -> import (tier 1 by ordinal)");
    const doc = JSON.parse(exportedJson);
    assert(doc.files[0].timeZero && doc.files[0].timeZero.ordinal === 7 && typeof doc.files[0].timeZero.raw === "string", "export: file record carries timeZero ordinal/ts/raw");
    assert(doc.settings.relativeTime === true, "export: settings.relativeTime");
    const f = await w.addFile("copy.log", sim.text, () => {});
    w.render();
    w.importSessionJson(exportedJson);
    await sleep(80);
    assert(T.state.timeZeroId === f.entries[7].id && T.state.relativeTime === true, "import: zero placed by ordinal, relative on");
  });

  await withApp(async (w, d, T) => {
    section("relative-time i. tier 3 re-anchors the zero by ts + fingerprint");
    const lines = sim.text.trimEnd().split("\n");
    const f0 = await w.addFile("probe.log", sim.text, () => {});
    const raw7 = f0.entries[7].raw;
    const firstLine = raw7.split("\n")[0];
    const idx = lines.indexOf(firstLine);
    assert(idx > 0, "sanity: zero entry's first line located in the source text");
    lines.splice(idx - 1, 1); // drop a line before it so the ordinal shifts
    const f = await w.addFile("shifted.log", lines.join("\n") + "\n", () => {});
    w.deleteNode(f0.id);
    w.render();
    w.importSessionJson(exportedJson);
    await sleep(80);
    const radio = d.querySelector('input[name="sessionMatchTarget"][value="file:' + f.id + '"]');
    if (radio && !d.querySelector("#sessionMatchDialog").classList.contains("hidden")) {
      radio.checked = true;
      fireClick(d.querySelector("#sessionMatchApply"), w);
      await sleep(80);
    }
    const z = T.state.timeZeroId && T.state.nodes[f.id].entries.find(e => e.id === T.state.timeZeroId);
    assert(z && z.raw === raw7, "zero re-anchored to the same entry in the shifted file");
  });
}
