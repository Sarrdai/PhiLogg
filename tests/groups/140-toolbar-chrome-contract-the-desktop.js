// GROUP 140 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 140 — Toolbar chrome contract the desktop wrapper injects against
   Origin: this session (Tauri wrapper). The wrapper never edits
   philogg.html; it injects CSS/DOM keyed off #toolbar's own
   structure instead — the wrapper's inject.js stamps the drag region as a
   data-tauri-drag-region walk over #toolbar and its non-control
   descendants, and appends the window-control buttons
   into .toolbar-right. None of that is reachable from jsdom, but the
   selectors and the height it is all derived from are — and silently
   renaming or restyling them would break the wrapper's window chrome
   with nothing failing here. This group is that tripwire.
   ============================================================ */
group(140);
await withApp(async (w, d, T) => {
  section("140. #toolbar's structure/height, which both desktop wrappers' injected chrome depends on");

  const toolbar = d.querySelector("#toolbar");
  assert(toolbar && toolbar.tagName === "HEADER", "#toolbar exists and is the page header");
  assert(toolbar.querySelector(".toolbar-right"),
    ".toolbar-right exists — where the desktop wrapper appends its window-control buttons");
  assert(toolbar.querySelector(".brand"),
    ".brand exists — where the macOS traffic-light inset padding is applied");

  const css = [...d.querySelectorAll("style")].map(s => s.textContent).join("\n");
  const toolbarRule = css.match(/#toolbar\s*\{[^}]*\}/);
  assert(toolbarRule, "#toolbar has its own style rule");
  assert(/height\s*:\s*50px/.test(toolbarRule[0]),
    "#toolbar is 50px tall — the wrapper's injected window chrome is sized against this");

  // Everything interactive inside the toolbar has to keep matching the
  // wrapper's own no-drag selector list ("button, input, select, textarea,
  // a, label, .ctx-item"), or clicking it would drag the window instead.
  const interactive = [...toolbar.querySelectorAll("*")].filter(el => typeof el.onclick === "function" || el.tabIndex >= 0);
  const stray = interactive.filter(el => !el.closest("button, input, select, textarea, a, label, .ctx-item"));
  assert(stray.length === 0,
    "every focusable/clickable toolbar element is covered by the wrapper's no-drag selectors, stray: " +
    stray.map(el => el.tagName + (el.id ? "#" + el.id : "")).join(", "));
});
