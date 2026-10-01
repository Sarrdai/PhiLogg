// GROUP 336 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 336 — folder-watch header: calm static status dot instead of the
   endless scanning ping, a one-shot ping only when a rescan finds a NEW
   file, the app's cog for the folder settings button; plus the find-bar hit
   badge fitting into the 16px .tree-row content height (28px rows).
   ============================================================ */
group(336);
await withApp(async (w, d, T) => {
  section("336a. live folder: static dot, no ping class; failed: error dot; permission: lock, no dot");
  const mkFile = (name, text) => ({ kind: "file", name, async getFile() {
    const blob = new w.Blob([text]);
    Object.defineProperty(blob, "name", { value: name, configurable: true });
    Object.defineProperty(blob, "size", { get: () => text.length, configurable: true });
    blob.text = async () => text;
    return blob;
  } });
  const fileMap = { "a.log": LOGSIM.generateToStrings({ format: "default", entries: 5, seed: 3 })[0].text };
  const dir = { kind: "directory", name: "logs", async *values() { for (const n of Object.keys(fileMap)) yield mkFile(n, fileMap[n]); } };
  await w.addWatchedFolder(dir);
  const folder = T.state.folders[0];
  let icon = d.querySelector(".folder-watch-icon");
  assert(icon.classList.contains("live") && !!icon.querySelector(".folder-watch-dot"), "live folder shows the dot");
  assert(!icon.classList.contains("ping-once") && !icon.classList.contains("scanning"), "no ping / scanning class on a quiet live folder");
  assert(!icon.classList.contains("failed"), "live dot is not the error variant");
  assert(d.querySelector(".folder-watch-settings use").getAttribute("href") === "#i-cog", "settings button uses #i-cog");
  assert(!!d.querySelector("symbol#i-gear"), "i-gear symbol still present (Manage library menu item)");

  section("336b. one-shot ping: a new file stamps _pingAt, a stable poll does not");
  await w.folderScanTick();
  assert(!folder._pingAt, "a stable poll does not stamp the ping");
  fileMap["b.log"] = fileMap["a.log"];
  await w.folderScanTick();
  assert(folder._pingAt > 0, "a newly appeared file stamps _pingAt");
  icon = d.querySelector(".folder-watch-icon");
  assert(icon.classList.contains("ping-once"), "fresh stamp renders the ping-once class");
  assert(/^-\d+ms$/.test(icon.style.getPropertyValue("--ping-delay")), "rebuild resumes with a negative animation delay, got " + icon.style.getPropertyValue("--ping-delay"));
  folder._pingAt = Date.now() - 5000;
  w.render();
  assert(!d.querySelector(".folder-watch-icon").classList.contains("ping-once"), "an expired stamp no longer renders the ping");
  delete fileMap["b.log"];
  folder._pingAt = 0;
  await w.folderScanTick();
  assert(!folder._pingAt, "a removal alone does not ping");

  section("336c. failed / needsPermission variants");
  folder.failed = true; w.render();
  icon = d.querySelector(".folder-watch-icon");
  assert(icon.classList.contains("failed") && !icon.classList.contains("live") && !!icon.querySelector(".folder-watch-dot"), "failed folder: grey icon + error dot");
  folder.failed = false; folder.needsPermission = true; w.render();
  icon = d.querySelector(".folder-watch-icon");
  assert(!icon.querySelector(".folder-watch-dot") && !icon.classList.contains("live"), "needsPermission: lock, no dot");
  folder.needsPermission = false; w.render();

  section("336d. hit badge fits the 16px row content height");
  const css = [...d.querySelectorAll("style")].map(s => s.textContent).join("\n");
  const rule = css.match(/\.tree-hit-badge\{([^}]*)\}/)[1];
  const lh = parseFloat(rule.match(/line-height:\s*([\d.]+)px/)[1]);
  const bw = parseFloat(rule.match(/border:\s*([\d.]+)px/)[1]);
  assert(lh + 2 * bw <= 16, ".tree-hit-badge line-height + borders (" + (lh + 2 * bw) + "px) fits the 16px .tree-row content height");
  assert(!/\.folder-watch-icon\.scanning/.test(css), "no .scanning rule left");
});
