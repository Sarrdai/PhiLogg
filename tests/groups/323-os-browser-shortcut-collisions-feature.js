// GROUP 323 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 323 — OS / browser shortcut collisions (FEATURE_BACKLOG #49)
   Origin: 2026-09-29. closeFile defaults to Alt+W in the plain browser
   build (Ctrl+W is reserved by browsers) via SHORTCUT_ACTIONS.browserDefault
   + defaultShortcutBinding(), Ctrl+W on desktop (window.philogg, read at
   call time); comboFromEvent uses ev.code for Alt+letter/digit (macOS
   Option dead keys); no browser-build default is a reserved combo.
   ============================================================ */
group(323);
await withApp(async (w, d, T) => {
  section("323a. browser build: closeFile default is Alt+W; Ctrl+W does not close, Alt+W does");
  assert(!w.philogg, "sanity: no window.philogg");
  const b = w.getShortcutBinding("closeFile");
  assert(b.alt === true && !b.ctrl && b.key === "w", "closeFile default is Alt+W in the browser build");
  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  T.state.activeId = f.id; w.render();
  fireKeydown(d, w, "w", { ctrlKey: true });
  assert(T.state.nodes[f.id], "Ctrl+W does not close the file in the browser build");
  fireKeydown(d, w, "w", { altKey: true });
  assert(!T.state.nodes[f.id], "Alt+W closes the file");

  section("323b. Shortcut Manager row shows the build default; Reset restores it");
  const rowKbds = () => [...d.querySelectorAll("[data-action-id='closeFile'] .shortcut-combo kbd")].map(k => k.textContent).join("+");
  w.renderShortcutBindingsList();
  assert(rowKbds() === "Alt+W", "row shows Alt+W in the browser build, got " + rowKbds());
  fireClick(d.querySelector("[data-action-id='closeFile'] .shortcut-rebind-btn"), w);
  fireKeydown(d, w, "q", { ctrlKey: true });
  assert(rowKbds() === "Ctrl+Q", "rebind applied");
  fireClick(d.querySelector("[data-action-id='closeFile'] .shortcut-reset-btn"), w);
  assert(rowKbds() === "Alt+W", "Reset restores the browser default");

  section("323c. desktop build (window.philogg set): Ctrl+W is the default");
  w.philogg = {};
  const dk = w.getShortcutBinding("closeFile");
  assert(dk.ctrl === true && !dk.alt && dk.key === "w", "closeFile default is Ctrl+W with window.philogg");
  w.renderShortcutBindingsList();
  assert(rowKbds() === "Ctrl+W", "row shows Ctrl+W on desktop");
  const f2 = await w.addFile("b.log", makeLog(0, 5), () => {});
  T.state.activeId = f2.id; w.render();
  fireKeydown(d, w, "w", { altKey: true });
  assert(T.state.nodes[f2.id], "Alt+W does not close on desktop");
  fireKeydown(d, w, "w", { ctrlKey: true });
  assert(!T.state.nodes[f2.id], "Ctrl+W closes on desktop");
  delete w.philogg;

  section("323d. macOS Option+letter: dead-key ev.key with ev.code KeyN still matches Alt+N");
  const f3 = await w.addFile("c.log", makeLog(0, 5), () => {});
  T.state.activeId = f3.id; w.render();
  w.selectEntry(f3.entries[1].id);
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Dead", code: "KeyN", altKey: true, bubbles: true, cancelable: true }));
  assert(!d.querySelector("#noteDialog").classList.contains("hidden"), "Alt+N (key Dead, code KeyN) opens the note dialog");
  fireClick(d.querySelector("#noteDialogCancel"), w);
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "\u02dc", code: "KeyN", altKey: true, bubbles: true, cancelable: true }));
  assert(!d.querySelector("#noteDialog").classList.contains("hidden"), "Alt+N (key U+02DC) opens the note dialog too");
  fireClick(d.querySelector("#noteDialogCancel"), w);
  const c = w.comboFromEvent(new w.KeyboardEvent("keydown", { key: "\u00e5", code: "Digit5", altKey: true }));
  assert(c.key === "5" && c.alt, "Alt+Digit uses the digit");
  const c2 = w.comboFromEvent(new w.KeyboardEvent("keydown", { key: "ArrowUp", code: "ArrowUp", altKey: true }));
  assert(c2.key === "arrowup", "Alt+Arrow unaffected");
  const c3 = w.comboFromEvent(new w.KeyboardEvent("keydown", { key: "=", code: "Equal", ctrlKey: true }));
  assert(c3.key === "+", "= still normalized to +");
  const c4 = w.comboFromEvent(new w.KeyboardEvent("keydown", { key: "n", code: "KeyN", ctrlKey: true }));
  assert(c4.key === "n", "without Alt, ev.key is used");
  const c5 = w.comboFromEvent(new w.KeyboardEvent("keydown", { key: "z", code: "KeyY", altKey: true }));
  assert(c5.key === "z", "QWERTZ Alt+Z: a plain-letter ev.key wins over the US-position ev.code");

  section("323e. no browser-build default is a browser-reserved combo");
  const reserved = [
    { ctrl: true, key: "w" }, { ctrl: true, key: "t" }, { ctrl: true, key: "n" },
    { ctrl: true, shift: true, key: "w" }, { ctrl: true, shift: true, key: "t" }, { ctrl: true, shift: true, key: "n" },
    { ctrl: true, key: "tab" }, { ctrl: true, shift: true, key: "tab" },
  ];
  const actions = T.SHORTCUT_ACTIONS || w.eval("SHORTCUT_ACTIONS");
  const offenders = actions.filter(a => { const c = w.defaultShortcutBinding(a); return reserved.some(r => w.comboEquals(c, r)); }).map(a => a.id);
  assert(offenders.length === 0, "no browser-build default equals a reserved combo, offenders: " + offenders.join(","));
});
