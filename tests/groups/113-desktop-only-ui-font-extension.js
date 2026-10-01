// GROUP 113 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 113 — Desktop-only UI font extension: window.philogg.listSystemFonts
   Origin: this session (person-requested follow-up to GROUP 111f). The
   plain HTML build can't enumerate installed fonts (no permission-prompt
   UI for the Local Font Access API), but the desktop wrapper can shell out
   to the OS via the wrapper's listSystemFonts bridge with no permission
   dialog needed, since it's a native process. On
   the desktop build the picker appends every reported name as an extra
   <option> (deduped against the curated list); selecting one stores a
   "sys:<name>" id and applies '"<name>",<default fallback stack>' as
   --font-ui. Outside the desktop build (no window.philogg) nothing changes
   from GROUP 111f's plain curated-list behavior.
   ============================================================ */
group(113);
await withApp(async (w, d, T) => {
  section("113a. No window.philogg (plain HTML build): font list stays curated-only");

  const select = d.querySelector("#settingsUiFontSelect");
  const before = select.options.length;
  assert(!select.querySelector("optgroup"), "no system-fonts optgroup without window.philogg");
  assert(select.options.length === before, "option count unchanged from the curated list");
});

await withApp(async (w, d, T) => {
  section("113b. window.philogg.listSystemFonts (desktop build): extra fonts appended and selectable");

  const select = d.querySelector("#settingsUiFontSelect");
  const curatedCount = select.options.length;

  // initUiFont() already ran during JSDOM's synchronous script execution and
  // kicked off the listSystemFonts().then(...) microtask; await it directly.
  await w.philogg.listSystemFonts().then(() => Promise.resolve());
  // Let the microtask queue (the real .then() chain inside initUiFont) flush.
  await new Promise(r => setTimeout(r, 0));

  const group = select.querySelector("optgroup");
  assert(group, "a system-fonts optgroup is appended once listSystemFonts resolves");
  assert(select.options.length > curatedCount, "extra options beyond the curated list are present");
  const firaOption = [...select.options].find(o => o.textContent === "Fira Code");
  assert(firaOption, "\"Fira Code\" (reported by the stub) is offered as an option");
  assert(firaOption.value === "sys:Fira Code", "its option value carries the sys: prefix + exact reported name");
  assert(![...select.options].some(o => o.textContent === "Arial"), "a name duplicating the curated list (\"Arial\") is not appended twice");

  select.value = firaOption.value;
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(w.document.documentElement.style.getPropertyValue("--font-ui").startsWith('"Fira Code",'),
    "selecting a system font sets --font-ui to the quoted name plus the default fallback stack");
  assert(w.localStorage.getItem("philogg-ui-font") === "sys:Fira Code", "the sys:-prefixed id persists to localStorage like any other font choice");
}, { philogg: { getPathForFile: () => null, revealPath: () => {}, revealLocalUrl: () => {}, listSystemFonts: () => Promise.resolve(["Fira Code", "Iosevka", "Arial"]) } });
