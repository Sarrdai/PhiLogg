// GROUP button-icon-alignment — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP button-icon-alignment — shared icon-button centering (#135) and Bursts chip spacing (#132)
   jsdom has no layout, so structure is asserted: one shared CSS rule centers every icon-button box,
   stepper -/+ buttons hold sprite icons (no text glyphs), and the chip carries its spacing rule.
   ============================================================ */
group("button-icon-alignment");

if (groupSelected()) {
  await withApp(async (w, d, T) => {
    section("button-icon-alignment a. one shared centering rule");
    const css = d.querySelector("style").textContent;
    const m = css.match(/\n\s*\.icon-btn, \.toolbar-icon-btn, \.stepper-btn, \.row-action-hit, \.tb-hit\{([^}]*)\}/);
    assert(m, "the shared icon-button rule exists");
    assert(m && /display:flex/.test(m[1]) && /align-items:center/.test(m[1]) && /justify-content:center/.test(m[1]), "it centers on both axes");
    assert(/\.icon-btn\{gap:var\(--icon-btn-gap\);\}/.test(css) && /--icon-btn-gap:4px/.test(css), "icon-label gap is a token");
    assert(/\.icon-btn \.icon, [^{]*\.stepper-btn \.icon[^{]*\{display:block;\}/.test(css), "svg icons are blocks inside those boxes");
    const stepRule = (css.match(/\.stepper \.stepper-btn\{[^}]*\}/) || [""])[0];
    assert(stepRule && !/display:|align-items|justify-content|font-size|line-height/.test(stepRule), "stepper-btn has no own alignment/glyph rules: " + stepRule);
    const hitRules = css.match(/\n\s*\.(row-action-hit|tb-hit)\{[^}]*\}/g) || [];
    assert(hitRules.length === 2 && hitRules.every(r => !/display:|align-items|justify-content/.test(r)), "hit boxes dropped their own centering");

    section("button-icon-alignment b. no text glyph buttons, steppers use sprite icons");
    const steppers = [...d.querySelectorAll(".stepper-btn")];
    assert(steppers.length >= 14, "static steppers found: " + steppers.length);
    assert(steppers.every(b => b.textContent.trim() === "" && b.querySelector("svg.icon use")), "every stepper button holds an icon and no text");
    assert(steppers.every(b => /#i-(plus|minus)$/.test(b.querySelector("use").getAttribute("href"))), "only i-plus / i-minus");
    assert(d.querySelector("#i-plus") && d.querySelector("#i-minus"), "sprite has both symbols");
    const textPlus = [...d.querySelectorAll("button")].filter(b => /^[+−-]$/.test(b.textContent.trim()));
    assert(textPlus.length === 0, "no button shows a bare +/- glyph: " + textPlus.map(b => b.id).join(","));

    section("button-icon-alignment c. icon buttons built by JS share the markup");
    assert(d.querySelector("#btnApplyLevelToTree .row-action-hit .add-badge-wrap"), "Add level filter: hit box + shared add badge");
    const addBadges = [...d.querySelectorAll(".add-badge-wrap")];
    assert(addBadges.length >= 1 && addBadges.every(x => x.querySelector(".add-badge svg path")), "add badges use the shared markup");

    assert(/\.add-badge\{[^}]*right:-5px; bottom:-5px; width:12px; height:12px/.test(css), "one shared add-badge rule (12px disc, same offset)");
    assert(/\.add-badge svg\{display:block; width:8px; height:8px/.test(css), "badge plus is an even 8px svg in the 12px disc");

    section("button-icon-alignment d. Bursts chip spacing");
    const chip = (css.match(/\.minimap-burst-chip\{[^}]*\}/) || [""])[0];
    assert(/top:1px/.test(chip) && /padding:2px 9px/.test(chip), "chip keeps clear of the strip below: " + chip);
  });
}
