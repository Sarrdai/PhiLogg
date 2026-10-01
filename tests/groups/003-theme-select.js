// GROUP 3 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 3 — Theme select
   Origin: 765d68a9 (design improvements session, test.js, 28 checks).
   Updated 2026-08-21: the single #btnTheme toggle button moved into
   Settings -> Appearance as an explicit Light/Dark control pair.
   Updated this session (2026-08-22, "configurable themes + Catppuccin"):
   the Light/Dark button pair was replaced by a #settingsThemeSelect
   dropdown (built-in themes now include the four Catppuccin flavors, plus
   any user-imported custom ones) — see GROUP 85.
   Updated 2026-09-30 (theme mode + light/dark slots, see GROUP 341): the
   single dropdown became a System/Light/Dark mode control plus a "Light
   theme" and a "Dark theme" dropdown; the stubbed OS preference is "not
   light", so the Dark theme slot is the effective one and its dropdown is
   what switches data-theme here.
   ============================================================ */
group(3);
await withApp(async (w, d, T) => {
  section("3. Theme select (now in Settings -> Appearance: the Dark theme slot is the effective one under the stubbed OS preference)");
  const html = d.documentElement;
  const before = html.dataset.theme;
  assert(before === "catppuccin-mocha", "sanity: a fresh profile (OS not light) starts on Catppuccin Mocha, got " + before);
  fireClick(d.querySelector("#btnSettings"), w);
  const select = d.querySelector("#settingsThemeDarkSelect");
  const other = "light";
  select.value = other;
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(html.dataset.theme !== before, "picking another theme flips data-theme, was " + before + " now " + html.dataset.theme);
  assert(html.dataset.theme === other, "data-theme matches the selected option, got " + html.dataset.theme);
  assert(w.localStorage.getItem("philogg-theme-dark") === html.dataset.theme, "theme choice persisted to localStorage (the Dark theme slot)");
});
