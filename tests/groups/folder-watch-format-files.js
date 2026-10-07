// GROUP folder-watch-format-files — loaded by philogg.regression.test.js
// (tests/README.md → "Group files"): helpers (withApp, assert, section, ...) in scope.

/* ============================================================
   GROUP folder-watch-format-files — Backlog #95
   Origin: 2026-10-07 (round 3, package C): a watched folder listed only
   .log/.log.gz plus txt/xml/json/images, so a .jsonl file or a log whose
   name a stored format's filename rule matches never appeared and the
   auto rules couldn't reach it. Decided: isCompatibleFolderFile ("is a
   log") = .log | .jsonl | any format filename rule (base name), .gz of
   those; a rule match wins over the txt/xml/json viewers. Every caller
   (folder scan, ZIP entries, "Open here" path menu) uses the same rule;
   the native listing is asked for every file once any format rule exists.
   ============================================================ */
group("folder-watch-format-files");
if (groupSelected()) {
  const sim = (format, seed) => LOGSIM.generateToStrings({ format, entries: 5, seed })[0];
  const jsonl = sim("jsonl", 1);
  const syslog = sim("syslog", 2);
  const rule = (glob, order = 0) => ({ id: "r-" + glob, glob, formatId: "fmt-default", order });
  const watch = async (w, T) => { await w.openFolderPickerFlow(); return T.state.folders[0]; };

  section("format-files a. isCompatibleFolderFile: .jsonl and format rules (base name), .gz of them, nothing else");
  await withApp(async (w, d, T) => {
    await waitForFormatConfig(T);
    const ok = n => w.isCompatibleFolderFile(n);
    assert(ok("a.log") && ok("a.jsonl") && ok("A.JSONL") && ok("a.jsonl.gz") && ok("a.log.1.gz"), ".log/.jsonl (and gz) are logs as before");
    assert(!ok("app-1.out") && !ok("notes.txt") && !ok("data.gz"), "unrelated names are not logs without a rule");
    T.state.formatRules.push(rule("app-*.out"), rule("*.txt", 1));
    assert(ok("app-1.out") && ok("sub/dir/app-2.out") && ok("C:\\x\\app-3.out"), "a format filename rule matches, on the base name of a path too");
    assert(ok("app-1.out.gz"), "...and its .gz");
    assert(!ok("other.out"), "a name matching no rule stays out");
    assert(ok("notes.txt"), "a rule on *.txt claims the name as a log (wins over the text viewer)");
    assert(w.folderListingExtensions().length === 0, "with rules, the native listing is asked for every file");
  });

  section("format-files b. browser handle listing: .jsonl + rule-matched file listed and auto-opened, unrelated file not");
  await withApp(async (w, d, T) => {
    await waitForFormatConfig(T);
    const mk = (name, text, mtime) => ({ kind: "file", name, getFile: async () => new w.File([text], name, { lastModified: mtime }) });
    const entries = [mk("sim.jsonl", jsonl.text, 3000), mk("app-1.out", syslog.text, 2000), mk("other.bin", "x", 5000), mk("sim-old.log", syslog.text, 1000)];
    const dir = { kind: "directory", name: "logs", async *values() { for (const e of entries) yield e; }, queryPermission: async () => "granted", requestPermission: async () => "granted" };
    T.state.formatRules.push(rule("app-*.out"));
    await w.addWatchedFolder(dir);
    const folder = T.state.folders[0];
    folder.settings.patterns = [{ pattern: "*", autoOpenNewest: true, autoCloseKeep: null, showNewest: null, startFilterKeys: [], startPrimaryFilterKey: null }];
    await w.rescanFolder(folder);
    assert(folder.files.map(f => f.name).sort().join(",") === "app-1.out,sim-old.log,sim.jsonl", "listed: .log, .jsonl and the rule match; not other.bin, got " + folder.files.map(f => f.name).sort().join(","));
    const open = folder.files.filter(f => f.nodeId).map(f => f.name);
    assert(open.join(",") === "sim.jsonl", "auto-open newest reached the .jsonl (mtime 3000), got " + open.join(","));
  });

  section("format-files c. desktop native listing: asked for every file once a rule exists; the page refines");
  {
    const dirs = { "/data": { "sim.jsonl": jsonl.text, "app-1.out": syslog.text, "junk.bin": "x" } };
    const mtimes = { "/data/sim.jsonl": 1, "/data/app-1.out": 2, "/data/junk.bin": 3 };
    const bridge = nativeFolderBridge(dirs, 1, mtimes);
    bridge.picked = { path: "/data", name: "data" };
    const real = bridge.listFolder; let asked = null;
    // Mirrors commands.rs::list_folder: an empty extension list lists every file.
    bridge.listFolder = async (p, exts) => { asked = exts; return real(p, exts.length ? exts : [""]); };
    await withApp(async (w, d, T) => {
      bridge.installFetch(w);
      await waitForFormatConfig(T);
      let folder = await watch(w, T);
      assert(asked.includes(".jsonl") && asked.length > 0 && folder.files.map(f => f.name).join(",") === "sim.jsonl",
        "no rules: the suffix list contains .jsonl, only the .jsonl is listed, got " + folder.files.map(f => f.name).join(","));
      T.state.formatRules.push(rule("app-*.out"));
      folder.settings.patterns = [{ pattern: "*", autoOpenNewest: true, autoCloseKeep: null, showNewest: null, startFilterKeys: [], startPrimaryFilterKey: null }];
      await w.rescanFolder(folder); // a poll re-evaluates the listing the same way
      assert(Array.isArray(asked) && asked.length === 0, "with a rule the native call gets an empty list");
      assert(folder.files.map(f => f.name).sort().join(",") === "app-1.out,sim.jsonl", "the rule match joins the listing, junk.bin stays out, got " + folder.files.map(f => f.name).sort().join(","));
      assert(folder.files.find(f => f.name === "app-1.out").nodeId, "auto-open newest opened the rule-matched (newest) file");
    }, { philogg: bridge });
  }

  section("format-files d. other callers: ZIP entries and the 'Open here' path check follow the same rule");
  await withApp(async (w, d, T) => {
    await waitForFormatConfig(T);
    T.state.formatRules.push(rule("app-*.out"));
    assert(w.isLogZipEntry({ name: "sub/app-1.out" }) && w.isLogZipEntry({ name: "sim.jsonl" }), "ZIP entries matching a rule or .jsonl are log entries");
    assert(!w.isLogZipEntry({ name: "sub/readme.md" }), "...an unrelated one is not");
    w.openFpPathMenu(d.body, "/var/log/app-1.out");
    assert(d.querySelector('#fpPathMenu [data-fp-action="open-here"]'), "'Open here' is offered for a rule-matched path");
    w.openFpPathMenu(d.body, "/var/log/readme.md");
    assert(!d.querySelector('#fpPathMenu [data-fp-action="open-here"]'), "...not for an unrelated path");
  });
}
