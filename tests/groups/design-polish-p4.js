// GROUP design-polish-p4 — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP design-polish-p4 — one calm button language (C1)
   Origin: 2026-10-10 design polish round, package P4. Action icon buttons are 28x28 ghost
   rounded squares (6px); level filters stay circles; the "+" badge is a solid accent disc with a
   2px ring; the view tabs are a segmented control with a raised --bg-popover segment.
   ============================================================ */
group("design-polish-p4");

await withApp(async (w, d, T) => {
  const css = Array.from(d.querySelectorAll("style")).map(s => s.textContent).join("\n");
  const body = sel => {
    const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = css.match(new RegExp("^\\s*" + esc + "\\s*\\{([^}]*)\\}", "m"));
    return m ? m[1] : "";
  };

  section("design-polish-p4 a. tokens");
  assert(/--btn-hover:color-mix\(in srgb, var\(--text-primary\) 9%, transparent\)/.test(css), "--btn-hover 9% in :root");
  assert(/--bg-popover:color-mix\(in srgb, var\(--text-primary\) 9%, var\(--bg-app\)\)/.test(css), "--bg-popover derived in :root (dark)");
  ["light", "catppuccin-latte"].forEach(t => {
    const blk = css.match(new RegExp(':root\\[data-theme="' + t + '"\\]\\{([^}]*)\\}'))[1];
    assert(/--btn-hover:color-mix\(in srgb, var\(--text-primary\) 8%, transparent\)/.test(blk), t + ": --btn-hover 8%");
    assert(/--bg-popover:color-mix\(in srgb, #fff 55%, var\(--bg-app\)\)/.test(blk), t + ": --bg-popover light mix");
  });

  section("design-polish-p4 b. icon buttons: ghost rest / hover / active / disabled");
  const rest = body(".toolbar-icon-btn");
  assert(/width:28px/.test(rest) && /height:28px/.test(rest) && /border:0/.test(rest) && /border-radius:6px/.test(rest) && /background:transparent/.test(rest), "28x28, no border, transparent, 6px: " + rest);
  assert(/color:var\(--text-secondary\)/.test(rest), "icon in --text-secondary");
  assert(/background:var\(--btn-hover\)/.test(body(".toolbar-icon-btn:hover")) && /color:var\(--text-primary\)/.test(body(".toolbar-icon-btn:hover")), "hover");
  assert(/background:var\(--accent-soft\)/.test(css.match(/\.toolbar-icon-btn\.active, \.toolbar-icon-btn\.active:hover\{[^}]*\}/)[0]) && /--accent-strong/.test(css.match(/\.toolbar-icon-btn\.active, \.toolbar-icon-btn\.active:hover\{[^}]*\}/)[0]), "active = accent-soft + accent-strong");
  assert(/opacity:\.38/.test(body(".toolbar-icon-btn:disabled")) && /background:transparent/.test(body(".toolbar-icon-btn:disabled:hover")), "disabled .38, no hover fill");
  assert(/border-radius:6px/.test(body(".row-action-btn.rect")) && /border-radius:6px/.test(body(".row-action-btn:not(.level-btn)")), "row-action buttons are 6px");
  assert(!/\.icon-toggle(\.active)?::after/.test(css), "no teal underline rule for active toggles");
  const notes = d.querySelector("#filteredToolbar .toggle-notes");
  const cs = w.getComputedStyle(notes);
  assert(cs.borderTopWidth === "0px", "rendered toggle has no border");

  section("design-polish-p4 c. level filters stay circles");
  assert(/border-radius:50%/.test(body(".level-btn")), ".level-btn border-radius:50%");

  section("design-polish-p4 d. add badge: solid accent disc with a 2px ring");
  const badge = body(".add-badge");
  assert(/background:var\(--accent\)/.test(badge) && /box-shadow:0 0 0 2px var\(--bg-panel\)/.test(badge) && /color:var\(--accent-on\)/.test(badge), "solid accent + ring: " + badge);

  section("design-polish-p4 e. view tabs: segmented control");
  const track = body(".view-tabs");
  assert(/padding:2px/.test(track) && /border-radius:8px/.test(track) && /border:0/.test(track) && /var\(--text-primary\) 7%/.test(track) && /gap:2px/.test(track), "track: " + track);
  const act = body(".view-tab.active");
  assert(/background:var\(--bg-popover\)/.test(act) && /box-shadow:0 1px 2px[^;]*0 0 0 \.5px/.test(act) && /color:var\(--text-primary\)/.test(act), "active segment raised: " + act);
  const seg = body(".view-tab");
  assert(/font-size:12\.5px/.test(seg) && /font-weight:550/.test(seg) && /border-radius:6px/.test(seg), "segment font/radius");
  assert(/var\(--text-tertiary\)/.test(body(".view-tab:disabled")), "disabled tabs tertiary");
  const tab = d.querySelector("#fhTabs .view-tab");
  if (tab) assert(w.getComputedStyle(tab.parentElement).borderTopWidth === "0px", "rendered track has no border");

  section("design-polish-p4 f. library split button follows the ghost language");
  assert(/border:0/.test(body("#btnLibrary")) && /height:28px/.test(body("#btnLibrary")) && /border-radius:6px/.test(body("#btnLibrary")), "ghost split button");
  assert(/border-left:1px solid var\(--hairline\)/.test(body("#btnLibrary > span + span")), "segments still divided");
});
