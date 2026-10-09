// GROUP multi-select-look — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP multi-select-look — uniform look of a log-row multi-selection and no
   native text selection on Shift/Ctrl+click
   Origin: 2026-10-09 (person-requested, plan-table-selection step 1).
   Every row of state.logMultiSelect gets the same full-width fill
   (--multi-select-fill, background-image so it composes over level tints),
   no per-row border, no special look for the last-clicked row; Shift/Ctrl/Cmd
   mousedown on a row is default-prevented so it starts no text selection.
   ============================================================ */
group("multi-select-look");
await withApp(async (w, d, T) => {
  section("multi-select-look a. CSS");
  const src = fs.readFileSync(path.join(__dirname, "..", "philogg.html"), "utf8");
  assert(/--multi-select-fill:\s*color-mix\(in srgb, var\(--accent\)/.test(src), "the fill token --multi-select-fill is defined from the accent");
  assert(/\.log-row\.row-multi-selected,[^{]*\{background-image:linear-gradient\(var\(--multi-select-fill\)/.test(src), "multi-selected rows paint the fill as a gradient layer");
  assert(/\.log-row\.selected\.row-multi-selected\{box-shadow:none;\}/.test(src), "the focused row of a multi-selection has no extra border");
  assert(!/\.log-row\.row-multi-selected\{box-shadow/.test(src), "no per-row border rule for multi-selected rows");

  section("multi-select-look b. mousedown");
  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  T.state.activeId = f.id;
  w.render();
  const rowAt = i => d.querySelector('#tableRows [data-entry-id="' + f.entries[i].id + '"]');
  const down = (el, opts) => {
    const ev = new w.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, ...opts });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  };
  assert(down(rowAt(3), {}) === false, "plain mousedown on a row is not prevented");
  assert(down(rowAt(3), { shiftKey: true }) === true, "Shift+mousedown on a row is prevented");
  assert(down(rowAt(3), { ctrlKey: true }) === true, "Ctrl+mousedown on a row is prevented");
  assert(down(rowAt(3), { metaKey: true }) === true, "Cmd+mousedown on a row is prevented");
  assert(down(d.querySelector("#sidebar"), { shiftKey: true }) === false, "Shift+mousedown outside log rows is untouched");

  section("multi-select-look c. classes");
  const clickWith = (el, opts) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true, ...opts }));
  clickWith(rowAt(2), {});
  clickWith(rowAt(5), { shiftKey: true });
  const ids = [2, 3, 4, 5];
  assert(ids.every(i => rowAt(i).classList.contains("row-multi-selected")), "all rows of the Shift range carry row-multi-selected");
  assert(rowAt(6) && !rowAt(6).classList.contains("row-multi-selected"), "rows outside the range do not");
});
