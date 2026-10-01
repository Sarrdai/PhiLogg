// GROUP 190 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 190 — this session (2026-09-08), person-reported bug: "before" +
   "Enforce chronological order" always produced an empty result. Diagnosed
   as not a bug in linkOrderEnforced itself (Group 22 already pins the
   monotonic-timestamp semantics deliberately) — the option is simply a
   no-op or an always-empty trap for a single-direction hop chain (all
   "before" always drops everything, all "after"/a lone hop never drops
   anything), and is only meaningful once the chain mixes directions. Fix
   is dialog-side gating: updateLinkOrderEnforceAvailability() hides the
   whole #linkOrderEnforceRow (and unchecks its input) whenever the current
   hop directions aren't diverse (< 2 hops, or all hops share a direction),
   called from renderLinkHops() and on every hop dir <select> change.
   Person-requested follow-up (same session): a disabled-but-visible
   checkbox with a hint text read as too subtle — the row is hidden
   outright instead, moved below Exclusive matches, and both options now
   use the pill-shaped .settings-switch (same component as the Settings
   dialog and the filter popup's Aa/NOT toggles) instead of plain
   checkboxes. See docs/filters.md "Opt-in options: order enforcement &
   exclusive matches".
   ============================================================ */
group(190);
{
  function makeLog3(f) {
    return [
      `2024-01-15 10:00:00,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 0\t[DoWork]\t"First A"`,
      `2024-01-15 10:00:05,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 1\t[DoWork]\t"Second A"`,
      `2024-01-15 10:00:10,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 2\t[DoWork]\t"Third A"`,
    ].join("\n") + "\n";
  }

  await withApp(async (w, d, T) => {
    section("190. Link dialog: order-enforce gating on hop-direction diversity");
    const f = await w.addFile("a.log", makeLog3(), () => {});
    const first = w.createFilterNode(f.id, "text", "First");
    const second = w.createFilterNode(f.id, "text", "Second");
    const third = w.createFilterNode(f.id, "text", "Third");
    w.render();

    // Single hop (2 filters) -> row hidden outright.
    w.openLinkDialog([first.id, second.id]);
    const row = d.querySelector("#linkOrderEnforceRow");
    assert(row.classList.contains("hidden"), "single hop: order-enforce row is hidden");
  });

  await withApp(async (w, d, T) => {
    const f = await w.addFile("a.log", makeLog3(), () => {});
    const first = w.createFilterNode(f.id, "text", "First");
    const second = w.createFilterNode(f.id, "text", "Second");
    const third = w.createFilterNode(f.id, "text", "Third");
    w.render();

    // Two hops, same direction (after/after) -> still hidden.
    w.openLinkDialog([first.id, second.id, third.id]);
    d.querySelector("#linkRefSelect").value = first.id;
    d.querySelector("#linkRefSelect").dispatchEvent(new w.Event("change"));
    let hopRows = d.querySelectorAll("#linkHopsList .link-hop-row");
    hopRows[0].querySelector(".link-hop-dir").value = "after";
    hopRows[0].querySelector(".link-hop-dir").dispatchEvent(new w.Event("change"));
    hopRows[1].querySelector(".link-hop-dir").value = "after";
    hopRows[1].querySelector(".link-hop-dir").dispatchEvent(new w.Event("change"));
    const row = d.querySelector("#linkOrderEnforceRow");
    const checkbox = d.querySelector("#linkOrderEnforceInput");
    assert(row.classList.contains("hidden"), "two hops, same direction (after/after): row stays hidden");

    // Switching one hop to a different direction (after/before) -> row shown.
    hopRows[1].querySelector(".link-hop-dir").value = "before";
    hopRows[1].querySelector(".link-hop-dir").dispatchEvent(new w.Event("change"));
    assert(!row.classList.contains("hidden"), "two hops, mixed direction (after/before): row is shown");

    // Check it, then switch back to a single (same) direction -> auto
    // hidden AND unchecked, no stale checked-but-hidden state.
    setPill(checkbox, true);
    hopRows[1].querySelector(".link-hop-dir").value = "after";
    hopRows[1].querySelector(".link-hop-dir").dispatchEvent(new w.Event("change"));
    assert(row.classList.contains("hidden"), "reverting to same direction while checked: row becomes hidden again");
    assert(pillChecked(checkbox) === false, "reverting to same direction while on: toggle is auto-cleared, not left stale");
  });
}
