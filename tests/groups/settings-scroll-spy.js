// GROUP settings-scroll-spy — Settings nav highlight follows the section being read.
// Origin: 2026-10-06 usability round E3.
group("settings-scroll-spy");

if (groupSelected()) {
  await withApp(async (w, d, T) => {
    section("settings-scroll-spy a. settingsActiveSectionId with the reproduction geometry");
    const secs = [
      { id: "Appearance", top: 0, height: 1049 }, { id: "Behavior", top: 1049, height: 2040 },
      { id: "Ide", top: 0, height: 0 }, { id: "Formats", top: 3089, height: 528 },
      { id: "Shortcuts", top: 3617, height: 2763 }, { id: "License", top: 6380, height: 461 },
    ];
    const pick = st => w.settingsActiveSectionId(secs, st, 767, 6872);
    assert(pick(3600) === "Shortcuts", "scrollTop 3600 (17px of Formats left at the top): Shortcuts, got " + pick(3600));
    assert(pick(3000) === "Formats", "scrollTop 3000: Formats, got " + pick(3000));
    assert(pick(0) === "Appearance", "top: Appearance, got " + pick(0));
    assert(pick(6872 - 767) === "License", "bottom: License, got " + pick(6872 - 767));
    assert(pick(1100) === "Behavior", "middle: Behavior, got " + pick(1100));
    for (let st = 0; st <= 6105; st += 50) assert(pick(st) !== "Ide", "hidden zero-height section never chosen at " + st);
    assert(w.settingsActiveSectionId([{ id: "x", top: 0, height: 0 }], 0, 100, 100) === null, "nothing visible: null");

    section("settings-scroll-spy b. a click pins the item until the user scrolls by hand");
    const body = d.querySelector(".settings-page-body");
    const items = [...d.querySelectorAll(".settings-nav-item")];
    const lic = items.find(b => b.dataset.navTarget === "settingsSectionLicense");
    lic.click();
    assert(lic.classList.contains("active"), "click sets .active at once");
    body.dispatchEvent(new w.Event("wheel", { bubbles: true }));
    w.settingsUpdateActiveNav();
    assert(items.filter(b => b.classList.contains("active")).length === 1, "exactly one active item after a hand scroll");
  });
}
