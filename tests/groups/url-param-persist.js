// GROUP url-param-persist — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP url-param-persist — a ?url= file survives a reload
   Origin: 2026-10-04 (phone usability test). loadUrlIntoTreeImpl never
   persisted its node, so a reload found the cacheKey in meta.fileOrder but no
   files record and came back empty. Now persisted; the boot runs the ?url=
   load after the session restore and drops its fresh byte-identical copy in
   favour of the restored file (filters kept), while a changed log is kept as
   a second file. A reload is simulated like GROUP 267: one shared IDBFactory.
   ============================================================ */
group("url-param-persist");
{
  const URL_Q = "http://localhost/philogg.html?url=" + encodeURIComponent("http://logs.example/tour/app.log");
  const fakeFetch = text => w => { w.fetch = async () => { w.__fetched = true; return ({ ok: true, status: 200, arrayBuffer: async () => new w.TextEncoder().encode(text).buffer }); }; };
  const logA = makeLog(0, 6);
  const factory = new IDBFactory();
  let cacheKey = null;

  await withApp(async (w, d, T) => {
    section("url-param-persist a. The loaded file gets a files record");
    await T.bootRestore;
    await waitFor(() => T.state.rootIds.length === 1 && T.state.nodes[T.state.rootIds[0]].sourceUrl);
    const f = T.state.nodes[T.state.rootIds[0]];
    assert(f && f.sourceUrl === "http://logs.example/tour/app.log", "file loaded from ?url=");
    w.createFilterNode(f.id, "text", "message 1");
    cacheKey = f.cacheKey;
    assert(!!cacheKey, "node got a cacheKey");
    const rec = await waitFor(() => w.cacheStoreOp("files", "readonly", st => st.get(cacheKey)));
    assert(rec && (rec.text || rec.blob), "a files record exists for the ?url= file");
    await w.persistFileNode(f, true);
    await w.persistMetaNow();
  }, { indexedDB: factory, url: URL_Q, beforeParse: fakeFetch(logA) });

  await withApp(async (w, d, T) => {
    section("url-param-persist b. Reload with the same content: restored once, with its filter");
    await T.bootRestore;
    await waitFor(() => w.__fetched && T.foregroundLoads === 0); // the chained ?url= load ran and finished
    await new Promise(r => setTimeout(r, 0)); // its dedupe runs right after the tracked load settles
    assert(T.state.rootIds.length === 1, "exactly one root file after reload, got " + T.state.rootIds.length);
    const f = T.state.nodes[T.state.rootIds[0]];
    assert(f.cacheKey === cacheKey, "the restored node (not the fresh one) is kept");
    assert((f.children || []).some(id => T.state.nodes[id] && T.state.nodes[id].value === "message 1"), "its filter survived");
    assert(T.state.activeId === f.id, "the restored file is active");
  }, { indexedDB: factory, url: URL_Q, beforeParse: fakeFetch(logA) });

  await withApp(async (w, d, T) => {
    section("url-param-persist c. Reload with changed content: kept as a second file");
    await T.bootRestore;
    await waitFor(() => w.__fetched && T.foregroundLoads === 0);
    await new Promise(r => setTimeout(r, 0));
    assert(T.state.rootIds.length === 2, "restored file plus the changed one, got " + T.state.rootIds.length);
  }, { indexedDB: factory, url: URL_Q, beforeParse: fakeFetch(makeLog(0, 9)) });
}
