// GROUP 352 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 352 — ?session=<url> / ?open=format deep links, session-file
   fields url / logFormat / banner, the tour banner, time-only timestamps
   Origin: 2026-10-01 (person-requested, homepage prerequisites Step 1).
   ?session= fetches a philogg-session-export file and loads its records
   FRESH (rec.url resolved against the session file's URL, else embedded
   text; a record with neither goes through tiers 1-2 only), applies filters /
   notes / bookmarks / settings, adds a record's logFormat as a persisted
   format (or reuses an identical one) and shows the banner. ?open=format
   opens "Add log format", after the session load when combined. A timestamp
   on 1970-01-01 local (tsFormat without date tokens) displays without the
   date. fetch is faked (jsdom has none), as in GROUP 66.
   ============================================================ */
group(352);
if (groupSelected()) {
  const simText = (format, entries, seed) => LOGSIM.generateToStrings({ format, entries, seed })[0].text;
  const SESSION_URL = "http://host.example/tours/t.session.json";
  const enc = (w, text) => new w.TextEncoder().encode(text).buffer;
  // Fake fetch over { url: text | { status } | Error }.
  const fakeFetch = (w, map, seen) => async u => {
    seen.push(u);
    const v = map[u];
    if (v instanceof Error) throw v;
    if (v === undefined) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0), text: async () => "" };
    return { ok: true, status: 200, arrayBuffer: async () => enc(w, v), text: async () => v };
  };
  const toast = d => d.querySelector("#copyToast").textContent;
  const bannerText = d => d.querySelector("#tourBanner .tour-banner-text").innerHTML;

  // Producer window: two files with a filter tree, a bookmark, a note, an active node.
  let sessionDoc = null, wantFilterValue = null, wantBookmarkOrdinal = 3, wantNoteOrdinal = 5, textA = simText("default", 60, 11), textB = simText("default", 40, 12);
  await withApp(async (w, d, T) => {
    const a = await w.addFile("a.log", textA, () => {});
    const b = await w.addFile("b.log", textB, () => {});
    wantFilterValue = a.entries[0].message.split(/\s+/)[0];
    const f = w.createFilterNode(a.id, "text", wantFilterValue);
    T.state.activeId = f.id;
    T.state.bookmarks.set(a.entries[wantBookmarkOrdinal].id, { bookmarkedAt: 1 });
    T.state.notes.set(a.entries[wantNoteOrdinal].id, "look here");
    T.state.levelFilter.clear(); T.state.levelFilter.add("ERROR");
    sessionDoc = JSON.parse(JSON.stringify(w.buildSessionExport([a.id, b.id], new Set())));
  });
  assert(sessionDoc && sessionDoc.files.length === 2, "352 setup: the producer exported two files");
  const makeSession = patch => {
    const doc = JSON.parse(JSON.stringify(sessionDoc));
    doc.files[0].url = "logs/a.log";
    doc.files[1].url = "http://other.example/b.log";
    return Object.assign(doc, patch || {});
  };

  await withApp(async (w, d, T) => {
    section("352a. ?session=: url records (relative + absolute) load fresh, filters/notes/bookmarks/settings/active/banner applied");
    await T.bootRestore;
    const seen = [];
    const doc = makeSession({ banner: "Read **this** first <b>x</b>" });
    w.fetch = fakeFetch(w, { [SESSION_URL]: JSON.stringify(doc), "http://host.example/tours/logs/a.log": textA, "http://other.example/b.log": textB }, seen);
    // The two exported hashes would tier-1 match an open copy — ?session= must not look at open files.
    await w.loadSessionFromUrl(SESSION_URL);
    assert(seen[0] === SESSION_URL && seen.includes("http://host.example/tours/logs/a.log") && seen.includes("http://other.example/b.log"),
      "the relative url resolves against the session file's URL, the absolute one is used as is: " + seen.join(" "));
    assert(T.state.rootIds.length === 2, "two files loaded, got " + T.state.rootIds.length);
    const a = T.state.nodes[T.state.rootIds[0]], b = T.state.nodes[T.state.rootIds[1]];
    assert(a.name === "a.log" && b.name === "b.log" && a.entries.length === 60 && b.entries.length === 40, "names from the records, entries parsed");
    assert(a.sourceUrl === "http://host.example/tours/logs/a.log", "the file remembers its resolved source URL (Copy URL)");
    const textFilter = a.children.map(id => T.state.nodes[id]).find(n => n.filterType === "text" && n.value === wantFilterValue);
    assert(textFilter, "the filter tree was rebuilt under the file");
    assert(T.state.activeId === textFilter.id, "the active node is the exported one");
    assert(T.state.bookmarks.has(a.entries[wantBookmarkOrdinal].id), "the bookmark landed on its ordinal");
    assert(T.state.notes.get(a.entries[wantNoteOrdinal].id) === "look here", "the note landed on its ordinal");
    assert(T.state.levelFilter.size === 0, "the level-chip view filter is not part of a session file");
    assert(isVisible(d.querySelector("#tourBanner"), w), "the banner is shown");
    assert(bannerText(d) === "Read <b>this</b> first &lt;b&gt;x&lt;/b&gt;", "**x** renders bold, everything else is escaped, got " + bannerText(d));
    assert(!/Session:/.test(toast(d)), "a clean ?session= load shows no summary toast, got " + toast(d));
    const closeBtn = d.querySelector("#tourBannerClose");
    assert(closeBtn.tagName === "BUTTON" && closeBtn.getAttribute("aria-label") && closeBtn.textContent.includes("close tour"), "the close control is a labelled button");
    fireClick(closeBtn, w);
    assert(!isVisible(d.querySelector("#tourBanner"), w), "close hides the banner");
    // Loading the same link again replaces the banner; a session without a banner clears it.
    await w.loadSessionFromUrl(SESSION_URL);
    assert(isVisible(d.querySelector("#tourBanner"), w), "a new ?session= with a banner shows it again");
    w.fetch = fakeFetch(w, { [SESSION_URL]: JSON.stringify(makeSession()), "http://host.example/tours/logs/a.log": textA, "http://other.example/b.log": textB }, seen);
    await w.loadSessionFromUrl(SESSION_URL);
    assert(!isVisible(d.querySelector("#tourBanner"), w), "a session without banner clears it");
    w.setSessionBanner("x");
    assert(isVisible(d.querySelector("#tourBanner"), w), "sanity: the banner is showing before the import");
    w.importSessionJson(JSON.stringify(makeSession())); // fire-and-forget: wait for its effect, not a fixed time
    assert(await waitFor(() => !isVisible(d.querySelector("#tourBanner"), w)), "a plain session import without a banner clears it too");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("352b. A record's logFormat: added silently + persisted + pinned; reused when identical; changed one is added again; invalid one ignored");
    await T.bootRestore;
    await waitForFormatConfig(T);
    const text = simText("bracket", 40, 3);
    const lf = LOGSIM.formatExport("bracket").logFormat;
    const rec = (name, logFormat) => ({ exportId: "x-" + name, name, text, logFormat, filters: [], bookmarks: [], notes: [] });
    const session = recs => JSON.stringify({ format: "philogg-session-export", version: 1, files: recs, settings: { active: { exportId: "x-" + recs[0].name, ref: null } } });
    const seen = [];
    const formatsBefore = T.state.logFormats.length, rulesBefore = T.state.formatRules.length;
    w.fetch = fakeFetch(w, { [SESSION_URL]: session([rec("one.log", lf)]) }, seen);
    await w.loadSessionFromUrl(SESSION_URL);
    const one = T.state.nodes[T.state.rootIds[0]];
    assert(T.state.logFormats.length === formatsBefore + 1, "the format was added");
    const added = T.state.logFormats.find(f => f.id === one.formatId);
    assert(added && added.name === lf.name && !added.builtin && added.regex === lf.regex, "the file is pinned to the new format");
    assert(one.entries.length === 40 && one.entries.every(e => e.level), "parsed with it (40 entries)");
    assert(T.state.formatRules.length === rulesBefore, "no filename rule was added");
    assert(!isVisible(d.querySelector("#formatDialog"), w), "no dialog");
    const stored = await w.listLogFormats();
    assert(stored.some(f => f.id === added.id), "persisted in the logFormats store");
    await w.loadSessionFromUrl(SESSION_URL);
    assert(T.state.logFormats.length === formatsBefore + 1, "an identical format is reused, not added again");
    assert(T.state.rootIds.every(id => T.state.nodes[id].formatId === added.id), "...and the second file is pinned to it too");
    const changed = Object.assign({}, lf, { levels: lf.levels.slice(1) });
    w.fetch = fakeFetch(w, { [SESSION_URL]: session([rec("two.log", changed)]) }, seen);
    await w.loadSessionFromUrl(SESSION_URL);
    assert(T.state.logFormats.length === formatsBefore + 2, "same name but different fields: added as a new format");
    w.fetch = fakeFetch(w, { [SESSION_URL]: session([rec("three.log", Object.assign({}, lf, { mode: "bogus" }))]) }, seen);
    await w.loadSessionFromUrl(SESSION_URL);
    const three = Object.values(T.state.nodes).find(n => n.type === "file" && n.name === "three.log");
    assert(three && three.formatId === "fmt-default" && T.state.logFormats.length === formatsBefore + 2, "an invalid logFormat is ignored, the file loads by its filename");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("352c. Embedded text loads; a record with neither url nor text matches an open file (tier 1) or is skipped, never a dialog");
    await T.bootRestore;
    const open = await w.addFile("open.log", textA, () => {});
    const embedded = { exportId: "e1", name: "emb.log", text: textB, filters: [], bookmarks: [], notes: [] };
    const matching = Object.assign({}, sessionDoc.files[0], { exportId: "m1", filters: [], bookmarks: [], notes: [] }); // carries fullHash of textA, no text/url
    const orphan = { exportId: "o1", name: "gone.log", entryCount: 5, fullHash: "0000000000000000", timeSpan: null, filters: [], bookmarks: [], notes: [] };
    const doc = { format: "philogg-session-export", version: 1, files: [embedded, matching, orphan], settings: {} };
    w.fetch = fakeFetch(w, { [SESSION_URL]: JSON.stringify(doc) }, []);
    await w.loadSessionFromUrl(SESSION_URL);
    const names = T.state.rootIds.map(id => T.state.nodes[id].name);
    assert(names.join(",") === "open.log,emb.log", "embedded text opened as a new file, the matched record reused the open one, the orphan opened nothing: " + names);
    assert(d.querySelector("#sessionMatchDialog").classList.contains("hidden"), "no tier-3 dialog");
    assert(/1 file loaded/.test(toast(d)) && /1 file matched automatically/.test(toast(d)) && /1 skipped/.test(toast(d)), "summary counts loaded / matched / skipped, got " + toast(d));
    // A failing url record is skipped, the rest still loads.
    const seen = [];
    w.fetch = fakeFetch(w, { [SESSION_URL]: JSON.stringify(makeSession()), "http://other.example/b.log": textB }, seen);
    await w.loadSessionFromUrl(SESSION_URL);
    assert(/1 skipped/.test(toast(d)), "a url that 404s counts as skipped, got " + toast(d));
  }, { indexedDB: new IDBFactory() });

  {
    section("352d. Reload of a ?session= link: restored copies are replaced, the session shows once");
    const factory = new IDBFactory();
    const docText = JSON.stringify(makeSession({ banner: "Tour" }));
    const urls = { [SESSION_URL]: docText, "http://host.example/tours/logs/a.log": textA, "http://other.example/b.log": textB };
    const query = "?session=" + encodeURIComponent(SESSION_URL);
    await withApp(async (w, d, T) => {
      await T.bootRestore;
      await waitFor(() => /Session: /.test(toast(d)));
      assert(T.state.rootIds.length === 2, "first visit: two files, got " + T.state.rootIds.length);
      await w.persistMetaNow();
      await waitFor(async () => (await w.cacheStoreOp("files", "readonly", s => s.getAll())).length === 2);
    }, { indexedDB: factory, url: "http://localhost/philogg.html" + query, beforeParse: win => { win.fetch = fakeFetch(win, urls, []); } });
    await withApp(async (w, d, T) => {
      await T.bootRestore;
      await waitFor(() => /Session: /.test(toast(d)));
      const files = T.state.rootIds.map(id => T.state.nodes[id]);
      assert(files.length === 2, "reload: still two files (not four), got " + files.map(f => f.name));
      assert(files.every(f => f.sourceUrl), "...and they are the freshly loaded ones");
      assert(isVisible(d.querySelector("#tourBanner"), w), "the banner is shown again after the reload");
    }, { indexedDB: factory, url: "http://localhost/philogg.html" + query, beforeParse: win => { win.fetch = fakeFetch(win, urls, []); } });
  }

  await withApp(async (w, d, T) => {
    section("352e. Error paths: network, HTTP status, not a session, newer version, bad JSON — toast, nothing loaded");
    await T.bootRestore;
    const cases = [
      [new Error("boom"), "network or CORS"],
      [undefined, "HTTP 404"],
      ["not json", "Not a valid JSON"],
      [JSON.stringify({ hello: 1 }), "Not a PhiLogg session file"],
      [JSON.stringify({ format: "philogg-session-export", version: 99, files: [] }), "newer version"],
    ];
    for (const [resp, expect] of cases) {
      w.fetch = fakeFetch(w, resp === undefined ? {} : { [SESSION_URL]: resp }, []);
      const ok = await w.loadSessionFromUrl(SESSION_URL);
      assert(ok === false && toast(d).includes(expect), "toast mentions '" + expect + "', got " + toast(d));
      assert(T.state.rootIds.length === 0 && !isVisible(d.querySelector("#tourBanner"), w), "nothing loaded, no banner (" + expect + ")");
    }
  }, { indexedDB: new IDBFactory() });

  {
    section("352f. ?open=format opens the Add-format dialog; with ?session= only after the session finished loading");
    await withApp(async (w, d, T) => {
      await T.bootRestore;
      await waitFor(() => isVisible(d.querySelector("#formatDialog"), w));
      assert(isVisible(d.querySelector("#formatDialog"), w) && d.querySelector("#formatEditTitle").textContent === "Add log format", "?open=format opens the empty Add log format dialog");
    }, { indexedDB: new IDBFactory(), url: "http://localhost/philogg.html?open=format" });

    let release;
    const gate = new Promise(r => { release = r; });
    let dialogWhileLoading = null, requested = false;
    await withApp(async (w, d, T) => {
      await T.bootRestore;
      await waitFor(() => requested);
      await sleep(30);
      dialogWhileLoading = isVisible(d.querySelector("#formatDialog"), w);
      release();
      await waitFor(() => isVisible(d.querySelector("#formatDialog"), w));
      assert(dialogWhileLoading === false, "the dialog is not open while the session is still loading");
      assert(isVisible(d.querySelector("#formatDialog"), w) && T.state.rootIds.length === 2, "it opens once the session (two files) is loaded");
    }, { indexedDB: new IDBFactory(), url: "http://localhost/philogg.html?open=format&session=" + encodeURIComponent(SESSION_URL), beforeParse: win => {
      const inner = fakeFetch(win, { [SESSION_URL]: JSON.stringify(makeSession()), "http://host.example/tours/logs/a.log": textA, "http://other.example/b.log": textB }, []);
      win.fetch = async u => { if (u.endsWith("a.log")) { requested = true; await gate; } return inner(u); };
    } });
  }

  await withApp(async (w, d, T) => {
    section("352g. Time-only timestamps (tsFormat HH:mm:ss.SSS): parse to 1970-01-01 local in order, display without the date");
    await T.bootRestore;
    await waitForFormatConfig(T);
    const g = LOGSIM.createGenerator({ format: "bracket", seed: 3 });
    const gen = [];
    while (gen.length < 30) { const e = g.next(); if (!e.msg.includes("\n")) gen.push(e); }
    const p2 = n => String(n).padStart(2, "0"), p3 = n => String(n).padStart(3, "0");
    const clock = ts => { const x = new Date(ts); return p2(x.getUTCHours()) + ":" + p2(x.getUTCMinutes()) + ":" + p2(x.getUTCSeconds()) + "." + p3(x.getUTCMilliseconds()); };
    const text = gen.map(e => clock(e.ts) + " " + e.level + " [" + e.thread + "] " + e.msg).join("\n") + "\n";
    const lf = Object.assign({}, LOGSIM.formatExport("bracket").logFormat, {
      name: "Time only", regex: "^(?<ts>\\d{2}:\\d{2}:\\d{2}\\.\\d{3}) (?<level>[A-Z]+) \\[(?<thread>[^\\]]*)\\] (?<message>.*)$", tsFormat: "HH:mm:ss.SSS",
    });
    T.state.logFormats.push(Object.assign({ id: "fmt-time-only", builtin: false, edited: false, createdAt: 0 }, lf));
    const f = await w.addFile("t.log", text, () => {}, "fmt-time-only");
    assert(f.entries.length === 30, "30 entries parsed, got " + f.entries.length);
    const first = new Date(gen[0].ts);
    assert(f.entries[0].ts === new Date(1970, 0, 1, first.getUTCHours(), first.getUTCMinutes(), first.getUTCSeconds(), first.getUTCMilliseconds()).getTime(), "the first timestamp is that clock time on 1970-01-01 local");
    assert(f.entries.every((e, i) => i === 0 || e.ts - f.entries[i - 1].ts === gen[i].ts - gen[i - 1].ts), "timestamps are in order and the deltas equal the generated ones");
    assert(w.formatTime(f.entries[0].ts) === clock(gen[0].ts), "formatTime shows the time only: " + w.formatTime(f.entries[0].ts));
    assert(w.formatTime(new Date(2024, 0, 15, 10, 0, 0, 5).getTime()) === "2024-01-15 10:00:00.005", "a real date still shows in full");
    assert(w.formatTime(new Date(1970, 0, 2, 3, 4, 5, 6).getTime()) === "1970-01-02 03:04:05.006", "only 1970-01-01 itself drops the date");
    w.render();
    const cell = d.querySelector("#tableRows .log-row .col-time");
    assert(cell && cell.textContent === clock(gen[0].ts), "the log table's time column shows the time only, got " + (cell && cell.textContent));
    assert(w.tsToLocalInputValue(f.entries[0].ts).startsWith("1970-01-01T"), "datetime-local inputs keep the full value");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("352h. The format dialog proposes HH:mm:ss.SSS for time-only example lines");
    await waitForFormatConfig(T);
    const g = LOGSIM.createGenerator({ format: "bracket", seed: 3 });
    const p2 = n => String(n).padStart(2, "0"), p3 = n => String(n).padStart(3, "0");
    const lines = Array.from({ length: 4 }, () => { const e = g.next(); const x = new Date(e.ts); return p2(x.getUTCHours()) + ":" + p2(x.getUTCMinutes()) + ":" + p2(x.getUTCSeconds()) + "." + p3(x.getUTCMilliseconds()) + " " + e.level + " [" + e.thread + "] " + e.msg.split("\n")[0]; });
    w.openFormatEditDialog(null);
    fwzPaste(w, d, lines.join("\n"));
    assert(d.querySelector("#formatEditTsFormat").value === "HH:mm:ss.SSS", "the suggested tsFormat is HH:mm:ss.SSS, got " + d.querySelector("#formatEditTsFormat").value);
  }, { indexedDB: new IDBFactory() });
}
