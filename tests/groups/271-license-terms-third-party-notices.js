// GROUP 271 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 271 — License terms + third-party notices, in the app and in
   every distribution
   Origin: 2026-09-25, person-requested: the German proprietary test-phase
   license is replaced by the PolyForm Noncommercial License 1.0.0 plus a
   30-day commercial-evaluation permission (LICENSE.md), in English, without
   the street address; third-party notices (Catppuccin in the page, the
   Rust crates of the desktop build in desktop/THIRD_PARTY_NOTICES.md) are
   added; LICENSE.md ships with every build.
   ============================================================ */
group(271);
{
  const root = path.join(__dirname, "..");
  const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
  const licenseMd = read("LICENSE.md");

  await withApp(async (w, d) => {
    section("271a. Settings -> License shows the LICENSE.md terms verbatim, in English, contact by mail only");
    w.openSettingsDialog();
    const content = d.querySelector("#licenseContent");
    const text = content.textContent;
    assert(d.querySelector("#licenseFullText pre").textContent === licenseMd.replace(/\n+$/, ""),
      "the collapsible full text equals LICENSE.md (the single-file HTML build carries its own terms)");
    assert(text.includes("PolyForm Noncommercial License 1.0.0") && text.includes("30 days") && text.includes("commercial license"),
      "the summary names the license, the evaluation period and the commercial license");
    assert(!/Rendsburger|20359|Alle Rechte|Nutzungsrecht/.test(text), "no street address and no German text left");
    assert(text.includes("philogg@kleinphilipp.de"), "contact by mail");

    section("271b. Third-party components are credited below the license");
    const tp = d.querySelector("#licenseThirdParty").textContent;
    assert(/Catppuccin/.test(tp) && /MIT License/.test(tp), "Catppuccin palettes credited with their license");
    assert(/Tauri/.test(tp) && tp.includes("THIRD_PARTY_NOTICES.md"), "the desktop build's crates point to THIRD_PARTY_NOTICES.md");
    const cat = d.querySelector("#licenseCatppuccinText pre").textContent;
    assert(cat.includes("Copyright (c) 2021 Catppuccin") && cat.includes("Permission is hereby granted"),
      "the Catppuccin MIT text is included in full (MIT requires it in every copy)");
    assert(content.lastElementChild.id === "licenseBuild", "version/build lines stay at the bottom");
  });

  if (groupSelected()) {
    section("271c. LICENSE.md: required notice, evaluation permission, full PolyForm text");
    assert(/^Required Notice: Copyright © Philipp Klein \(philogg@kleinphilipp\.de\)$/m.test(licenseMd), "PolyForm Required Notice line");
    assert(/## Additional Permission: Commercial Evaluation[\s\S]*30 consecutive\s+calendar days/.test(licenseMd), "30-day evaluation permission");
    assert(licenseMd.includes("# PolyForm Noncommercial License 1.0.0") && licenseMd.includes("## Noncommercial Organizations") && licenseMd.includes("**Use** means anything you do"),
      "the complete PolyForm Noncommercial 1.0.0 text");

    section("271d. The stripped release build keeps both license texts intact");
    const strip = require("../scripts/strip-comments.js");
    const stripped = strip.stripDocument(html);
    const pre = /<details class="license-details" id="licenseFullText">[\s\S]*?<pre class="license-text">([\s\S]*?)<\/pre>/.exec(stripped);
    const unescape = t => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    assert(pre && unescape(pre[1]) === licenseMd.replace(/\n+$/, ""), "license text survives comment stripping unchanged");

    section("271e. Every distribution carries LICENSE.md (and the desktop ones THIRD_PARTY_NOTICES.md)");
    const conf = JSON.parse(read("desktop/src-tauri/tauri.conf.json")).bundle;
    assert(conf.licenseFile === "../../LICENSE.md", "installer license page (bundle.licenseFile)");
    assert(conf.resources["../../LICENSE.md"] === "LICENSE.md" && conf.resources["../THIRD_PARTY_NOTICES.md"] === "THIRD_PARTY_NOTICES.md",
      "both files bundled next to philogg.html");
    // Stable and beta releases share one build (build-release-assets.yml).
    const wf = read(".github/workflows/build-release-assets.yml");
    assert(/cp LICENSE\.md desktop\/THIRD_PARTY_NOTICES\.md "\$STAGE\/"/.test(wf), "portable zip gets both files");
    assert(/cargo about generate -m src-tauri\/Cargo\.toml about\.hbs -o THIRD_PARTY_NOTICES\.md/.test(wf), "notices regenerated before bundling");
    assert(/cp LICENSE\.md dist\//.test(wf), "HTML release assets include LICENSE.md");

    section("271f. THIRD_PARTY_NOTICES.md matches Cargo.lock (regenerate it when dependencies change)");
    const lock = read("desktop/src-tauri/Cargo.lock");
    const locked = new Set([...lock.matchAll(/name = "([^"]+)"\nversion = "([^"]+)"/g)].map(m => m[1] + " " + m[2]));
    const listed = [...read("desktop/THIRD_PARTY_NOTICES.md").matchAll(/^- ([A-Za-z0-9_.-]+ [0-9]\S*)$/gm)].map(m => m[1]);
    const stale = listed.filter(c => !locked.has(c));
    assert(listed.length > 100, "notices list the bundled crates (" + listed.length + ")");
    assert(stale.length === 0, "every listed crate version is in Cargo.lock — stale: " + stale.slice(0, 5).join(", "));
    assert(listed.includes("tauri " + [...locked].find(c => c.startsWith("tauri ")).split(" ")[1]), "tauri itself is listed");
  }
}
