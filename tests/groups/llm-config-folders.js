// GROUP llm-config-folders — LLM/MCP configuration tools, step 3: watch_folder
// (desktop-native only; the person approves in a dialog of the main window),
// configure_folder, open_folder_file, list_config(folders), the folders list in
// get_overview and the pending/denied request log of this run.
// Origin: 2026-10-11 (person-requested, plan-llm-config-tools step 3).
// Folder contents from the log simulator (default format files), listed through
// the stubbed native bridge (nativeFolderBridge, GROUP 145's pattern).
group("llm-config-folders");
if (groupSelected()) {
  const sim = (n, seed) => LOGSIM.generateToStrings({ entries: n, seed })[0].text;
  const dirs = () => ({
    "/srv/logs": { "app-1.log": sim(30, 1), "app-2.log": sim(20, 2), "other.log": sim(10, 3) },
    "/srv/logs/sub": { "deep.log": sim(10, 4) },
    "/srv/other": { "x.log": sim(5, 5) },
  });
  const dlgOpen = (d, w) => isVisible(d.querySelector("#folderRequestDialog"), w);

  await withApp(async (w, d, T) => {
    section("llm-config-folders a. browser build: watch_folder is refused, list_config(folders) works");
    let r = llmRun(w, "watch_folder", { path: "/srv/logs" });
    assert(r.error && /desktop app/.test(r.error), "no native bridge -> error, got " + r.error);
    assert(!dlgOpen(d, w), "no dialog");
    r = llmRun(w, "list_config", { kind: "folders" });
    assert(!r.error && r.result.folders.length === 0 && /desktop app/.test(r.result.note), "empty listing with a note, got " + JSON.stringify(r.error || r.result));
    assert(llmRun(w, "get_overview", {}).result.folders === undefined, "no folders key in get_overview without folders");
  });

  const bridge1 = nativeFolderBridge(dirs());
  await withApp(async (w, d, T) => {
    section("llm-config-folders b. watch_folder: pending + dialog; Allow adds the folder with the given settings; same path = one request");
    bridge1.installFetch(w);
    let r = llmRun(w, "watch_folder", { path: "relative/dir" });
    assert(r.error && /absolute/.test(r.error), "relative path refused, got " + r.error);
    r = llmRun(w, "watch_folder", {});
    assert(r.error && /path is required/.test(r.error), "path required");
    r = llmRun(w, "watch_folder", { path: "/srv/logs", settings: { patterns: [{ pattern: "app-*.log", autoCloseKeep: 0 }] } });
    assert(r.error && /whole number/.test(r.error) && !dlgOpen(d, w), "invalid settings are refused before the dialog, got " + r.error);

    r = llmRun(w, "watch_folder", { path: "/srv/logs/", settings: { includeSubfolders: true, patterns: [{ pattern: "app-*.log", showNewest: 5 }] } });
    assert(!r.error && r.result.pending === true && r.result.requestId && /list_config/.test(r.result.hint), "pending answer, got " + JSON.stringify(r));
    assert(T.state.folders.length === 0, "nothing is watched before the person answers");
    assert(dlgOpen(d, w), "the confirmation dialog is shown in the main window");
    assert(d.querySelector("#folderRequestPath").textContent === "/srv/logs", "path shown (trailing slash normalized), got " + d.querySelector("#folderRequestPath").textContent);
    assert(d.querySelector("#folderRequestBy").textContent === "Asked by: in-app assistant", "who asked, got " + d.querySelector("#folderRequestBy").textContent);
    assert(d.querySelector("#folderRequestDialog .link-dialog-title").textContent === "Watch folder?", "title");
    assert(d.activeElement === d.querySelector("#folderRequestDeny"), "Deny has the focus (Enter does not grant)");
    const again = llmRun(w, "watch_folder", { path: "/srv/logs" }).result;
    assert(again.pending === true && again.requestId === r.result.requestId, "same path again: the same request, no second one");
    const lst = llmRun(w, "list_config", { kind: "folders" }).result;
    assert(lst.requests.length === 1 && lst.requests[0].status === "pending" && lst.requests[0].by === "in-app assistant", "pending request listed");

    fireClick(d.querySelector("#folderRequestAllow"), w);
    assert(!dlgOpen(d, w), "dialog closed");
    assert(T.state.folders.length === 1 && T.state.folders[0].name === "logs", "folder added");
    const folder = T.state.folders[0];
    assert(folder.settings.includeSubfolders === true && folder.settings.patterns.length === 1 && folder.settings.patterns[0].pattern === "app-*.log" && folder.settings.patterns[0].showNewest === 5, "settings from the request applied");
    await waitFor(() => folder.files.length === 2);
    assert(folder.files.map(f => f.name).sort().join() === "app-1.log,app-2.log", "scan used the pattern + subfolders: " + folder.files.map(f => f.name));
    const l2 = llmRun(w, "list_config", { kind: "folders" }).result;
    assert(l2.requests[0].status === "allowed" && l2.folders[0].id === folder.id && l2.folders[0].path === "/srv/logs" && l2.folders[0].files.length === 2, "list_config shows the folder and the allowed request");
    assert(l2.folders[0].settings.patterns[0].showNewest === 5 && l2.folders[0].state === "ok", "settings + state in the listing");
    const w2 = llmRun(w, "watch_folder", { path: "/srv/logs" });
    assert(w2.result.watched === true && w2.result.folder.id === folder.id && !dlgOpen(d, w), "an already watched folder is returned, no dialog");
    const ov = llmRun(w, "get_overview", {}).result;
    assert(ov.folders && ov.folders[0].id === folder.id && ov.folders[0].files === 2 && ov.folders[0].open === 0, "get_overview lists the folder, got " + JSON.stringify(ov.folders));
    const stored = await (async () => { let v; await waitFor(async () => (v = await w.cacheStoreOp("folders", "readonly", s => s.get(folder.id)))); return v; })();
    assert(stored && stored.path === "/srv/logs" && stored.settings.patterns[0].pattern === "app-*.log", "persisted with the given settings");
  }, { philogg: bridge1, indexedDB: new IDBFactory() });

  const bridge2 = nativeFolderBridge(dirs());
  await withApp(async (w, d, T) => {
    section("llm-config-folders c. Deny / Escape / backdrop deny; a denied path is not asked again; requests queue");
    bridge2.installFetch(w);
    llmRun(w, "watch_folder", { path: "/srv/logs" });
    fireClick(d.querySelector("#folderRequestDeny"), w);
    assert(!dlgOpen(d, w) && T.state.folders.length === 0, "Deny adds nothing");
    let r = llmRun(w, "watch_folder", { path: "/srv/logs" });
    assert(r.result.denied === true && !dlgOpen(d, w), "denied path: answered denied, no new dialog, got " + JSON.stringify(r.result));
    assert(llmRun(w, "list_config", { kind: "folders" }).result.requests[0].status === "denied", "listed as denied");

    llmRun(w, "watch_folder", { path: "/srv/other" });
    assert(dlgOpen(d, w), "a different path asks again");
    d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert(!dlgOpen(d, w) && T.state.folders.length === 0, "Escape denies");
    assert(llmRun(w, "list_config", { kind: "folders" }).result.requests.find(x => x.path === "/srv/other").status === "denied", "Escape recorded as denied");

    llmRun(w, "watch_folder", { path: "/srv/logs/sub" });
    assert(dlgOpen(d, w), "dialog for a third path");
    fireClick(d.querySelector("#folderRequestDialog"), w);
    assert(!dlgOpen(d, w) && T.state.folders.length === 0, "a backdrop click denies");

    // two requests at once: shown one after the other
    llmRun(w, "watch_folder", { path: "/srv/a1" });
    llmRun(w, "watch_folder", { path: "/srv/a2" });
    assert(d.querySelector("#folderRequestPath").textContent === "/srv/a1", "first request shown");
    fireClick(d.querySelector("#folderRequestDeny"), w);
    assert(dlgOpen(d, w) && d.querySelector("#folderRequestPath").textContent === "/srv/a2", "the second one follows");
    fireClick(d.querySelector("#folderRequestDeny"), w);
    assert(!dlgOpen(d, w), "queue drained");
  }, { philogg: bridge2 });

  const bridge3 = nativeFolderBridge(dirs());
  await withApp(async (w, d, T) => {
    section("llm-config-folders d. configure_folder: validation, persisted settings, start filters, rescan");
    bridge3.installFetch(w);
    await w.addWatchedFolder(w.nativeDirHandle("/srv/logs", "logs"));
    const folder = T.state.folders[0];
    await waitFor(() => folder.files.length === 3);
    w.eval("filterLibraryCache.push({ key: 'k-err', name: 'Errors only' }, { key: 'k-warn', name: 'Warnings' })");

    let r = llmRun(w, "configure_folder", { folderId: "nope", includeSubfolders: true });
    assert(r.error && /Unknown folderId/.test(r.error), "unknown folder, got " + r.error);
    r = llmRun(w, "configure_folder", { folderId: folder.id });
    assert(r.error && /Nothing to change/.test(r.error), "nothing to change");
    r = llmRun(w, "configure_folder", { folderId: folder.id, patterns: [{ pattern: "*.log", autoCloseKeep: 0 }] });
    assert(r.error && /whole number >= 1/.test(r.error), "number >= 1, got " + r.error);
    r = llmRun(w, "configure_folder", { folderId: folder.id, patterns: [{ pattern: "*.log", showNewest: 1.5 }] });
    assert(r.error && /whole number/.test(r.error), "integer, got " + r.error);
    r = llmRun(w, "configure_folder", { folderId: folder.id, patterns: [{ pattern: "*.log", startFilters: ["Nope"] }] });
    assert(r.error && /Unknown saved filter "Nope"/.test(r.error) && /Errors only, Warnings/.test(r.error), "unknown start filter lists the names, got " + r.error);
    r = llmRun(w, "configure_folder", { folderId: folder.id, patterns: [] });
    assert(r.error, "empty patterns refused");
    assert(folder.settings.patterns.length === 1 && folder.settings.patterns[0].pattern === "*", "failed calls change nothing");

    r = llmRun(w, "configure_folder", { folderId: folder.id, includeSubfolders: true, patterns: [
      { pattern: "app-*.log", autoOpenNewest: true, autoCloseKeep: 2, showNewest: 4, startFilters: ["warnings", "Errors only"] },
      { pattern: "deep.log" }] });
    assert(!r.error && r.result.saved, "configured: " + r.error);
    assert(folder.settings.includeSubfolders === true && folder.settings.patterns.length === 2, "settings replaced synchronously");
    const p0 = folder.settings.patterns[0];
    assert(p0.autoOpenNewest === true && p0.autoCloseKeep === 2 && p0.showNewest === 4 && p0.startFilterKeys.join() === "k-warn,k-err" && p0.startPrimaryFilterKey === "k-warn", "pattern fields + start filter keys (first = primary)");
    assert(folder.settings.patterns[1].autoOpenNewest === false && folder.settings.patterns[1].autoCloseKeep === null, "omitted fields take the defaults");
    assert(r.result.settings.patterns[0].startFilters.join() === "Warnings,Errors only", "result shows the stored settings with names");
    await waitFor(() => folder.files.some(f => f.name === "deep.log"));
    assert(folder.files.map(f => f.name).sort().join() === "app-1.log,app-2.log,deep.log", "rescan picked up the subfolder and the second pattern: " + folder.files.map(f => f.name));
    const rec = await (async () => { let v; await waitFor(async () => (v = await w.cacheStoreOp("folders", "readonly", s => s.get(folder.id))) && v.settings.patterns.length === 2); return v; })();
    assert(rec.settings.includeSubfolders === true && rec.settings.patterns[0].pattern === "app-*.log", "persisted in IndexedDB");
    r = llmRun(w, "configure_folder", { folderId: folder.id, includeSubfolders: false });
    assert(!r.error && folder.settings.includeSubfolders === false && folder.settings.patterns.length === 2, "includeSubfolders alone keeps the patterns");
  }, { philogg: bridge3, indexedDB: new IDBFactory() });

  const bridge4 = nativeFolderBridge(dirs());
  await withApp(async (w, d, T) => {
    section("llm-config-folders e. open_folder_file: loads in the background; already open returns the node; errors");
    bridge4.installFetch(w);
    await w.addWatchedFolder(w.nativeDirHandle("/srv/logs", "logs"));
    const folder = T.state.folders[0];
    await waitFor(() => folder.files.length === 3);
    let r = llmRun(w, "open_folder_file", { folderId: folder.id, file: "nope.log" });
    assert(r.error && /No file "nope.log"/.test(r.error) && /app-1.log/.test(r.error), "unknown file lists some, got " + r.error);
    assert(llmRun(w, "open_folder_file", { folderId: "x", file: "a" }).error, "unknown folder");
    assert(llmRun(w, "open_folder_file", { folderId: folder.id }).error, "file required");
    r = llmRun(w, "open_folder_file", { folderId: folder.id, file: "APP-1.LOG" });
    assert(!r.error && r.result.loading === true && /get_overview/.test(r.result.hint), "case-insensitive match, loading, got " + JSON.stringify(r));
    const rec = folder.files.find(f => f.name === "app-1.log");
    await waitFor(() => rec.nodeId && T.state.nodes[rec.nodeId] && T.state.nodes[rec.nodeId].entries.length === 30);
    const node = T.state.nodes[rec.nodeId];
    assert(node.folderId === folder.id && T.state.rootIds.includes(node.id), "a normal file node tagged with the folder");
    r = llmRun(w, "open_folder_file", { folderId: folder.id, file: "app-1.log" });
    assert(r.result.open === true && r.result.nodeId === node.id, "already open: its node id, got " + JSON.stringify(r.result));
    const ov = llmRun(w, "get_overview", {}).result;
    assert(ov.files.some(f => f.id === node.id) && ov.folders[0].open === 1, "get_overview shows the file and one open file in the folder");
    const l = llmRun(w, "list_config", { kind: "folders" }).result.folders[0];
    assert(l.open === 1 && l.files.find(f => f.name === "app-1.log").nodeId === node.id && l.files.find(f => f.name === "app-2.log").nodeId === null, "listing: opened node id or null");
  }, { philogg: bridge4 });

  const bridge5 = nativeFolderBridge(dirs());
  await withApp(async (w, d, T) => {
    section("llm-config-folders f. MCP path: the dialog names the client; the answer flows through mcpToolResult");
    bridge5.installFetch(w);
    const answers = [];
    w.philogg.mcpToolResult = (id, text, isError) => { answers.push({ id, text, isError }); return Promise.resolve(); };
    w.eval("mcp.status = { listening: true, lastClient: 'claude-code' }");
    w.philoggMcpCall(1, "watch_folder", { path: "/srv/other" });
    await waitFor(() => answers.length === 1);
    assert(!answers[0].isError && JSON.parse(answers[0].text).pending === true, "pending via MCP: " + answers[0].text);
    assert(dlgOpen(d, w) && d.querySelector("#folderRequestBy").textContent === "Asked by: MCP: claude-code", "dialog names the MCP client, got " + d.querySelector("#folderRequestBy").textContent);
    fireClick(d.querySelector("#folderRequestAllow"), w);
    assert(T.state.folders.length === 1 && T.state.folders[0].name === "other", "allowed via MCP");
    w.philoggMcpCall(2, "list_config", { kind: "folders" });
    await waitFor(() => answers.length === 2);
    const l = JSON.parse(answers[1].text);
    assert(l.folders.length === 1 && l.requests[0].by === "MCP: claude-code" && l.requests[0].status === "allowed", "list_config over MCP");
    w.eval("mcp.status = null");
    w.philoggMcpCall(3, "watch_folder", { path: "/srv/logs" });
    await waitFor(() => answers.length === 3);
    assert(d.querySelector("#folderRequestBy").textContent === "Asked by: an external agent (MCP)", "no client name known -> generic wording, got " + d.querySelector("#folderRequestBy").textContent);
    fireClick(d.querySelector("#folderRequestDeny"), w);
    w.philoggMcpCall(4, "watch_folder", { path: "/srv/x" });
    await waitFor(() => answers.length === 4);
    fireClick(d.querySelector("#folderRequestDeny"), w);
    const req = await (async () => { w.philoggMcpCall(5, "list_config", { kind: "folders" }); await waitFor(() => answers.length === 5); return JSON.parse(answers[4].text).requests; })();
    assert(req.length === 3 && req.filter(x => x.status === "denied").length === 2, "denied requests are listed");
    const sp = w.eval("LLM_SYSTEM_PROMPT");
    assert(/Folder paths for watch_folder come only from the person/.test(sp), "system prompt carries the folder-path rule");
  }, { philogg: bridge5 });
}
