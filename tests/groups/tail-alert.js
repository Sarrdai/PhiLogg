// GROUP tail-alert - loaded by philogg.html's regression harness
// (tests/README.md -> "Group files"): runs inside its main async function, so
// every harness helper (withApp, waitFor, assert, section, ...) is in scope.

/* ============================================================
   GROUP tail-alert - "Alert on new matches" for a filter node while its file
   is tailed (FEATURE_BACKLOG.md #87, variant A)
   Origin: 2026-10-07. Context-menu toggle (+ undo), bell + "+N" badge on the
   tree row, rate-limited toast (one per 5 s, pending counts accumulate),
   "Show" activates the node. Only tail growth raises an alert: the first
   load, a rotation, a definition edit and the active+follow node stay silent.
   Same fake-handle pattern as GROUP 12; Date.now/setTimeout are faked on the
   page window for the rate limit so the group stays fast.
   ============================================================ */
group("tail-alert");
await withApp(async (w, d, T) => {
  section("tail-alert. alert flag, badge, toast, rate limit");

  function fakeHandle(initialText) {
    let text = initialText;
    return {
      _setText(t) { text = t; },
      async getFile() {
        const blob = new w.Blob([text]);
        Object.defineProperty(blob, "size", { get: () => text.length, configurable: true });
        blob.text = async () => text;
        blob.slice = start => { const s = text.slice(start); const b = new w.Blob([s]); b.text = async () => s; return b; };
        return blob;
      },
    };
  }
  let lineNo = 0;
  const line = msg => `2024-01-15 10:00:${String(lineNo++ % 60).padStart(2, "0")},000\tINFO\t"main"\tFoo.cs\tline ${lineNo}\t[DoWork]\t"${msg}"\n`;
  async function tailedFile(name, firstMsgs) {
    const text = firstMsgs.map(line).join("");
    const handle = fakeHandle(text);
    const f = await w.addFile(name, text, () => {});
    f.tail = { handle, offset: text.length, pending: "", failed: false, busy: false };
    return { f, handle, text };
  }
  const toastText = () => { const t = d.querySelector("#copyToast .toast-text"); return t ? t.textContent : ""; };
  const toastShown = () => { const t = d.querySelector("#copyToast"); return !t.classList.contains("hidden") && t.dataset.kind === "alert"; };
  const resetToast = () => w.showCopyToast("reset"); // plain toast: replaces an alert toast's kind
  const rowOf = id => d.querySelector('.tree-row[data-node-id="' + id + '"]');
  const badgeOf = id => { const r = rowOf(id); const b = r && r.querySelector(".tree-alert-badge"); return b ? b.textContent : null; };
  const menuAlert = id => {
    T.state.multiSelect = new Set();
    w.openTreeContextMenu({ clientX: 10, clientY: 10, preventDefault() {} }, id);
    const item = d.querySelector('#treeContextMenu [data-action="alert"]');
    if (!item) return null;
    const label = item.textContent.trim();
    fireClick(item, w);
    return label;
  };

  // Faked clock + capture of the long timers the rate limit schedules.
  let now = 1e12;
  const realNow = w.Date.now, realSetTimeout = w.setTimeout;
  const timers = [];
  w.Date.now = () => now;
  w.setTimeout = (fn, ms, ...a) => { if (ms >= 1000 && ms <= 5000) { timers.push({ fn, ms }); return -1; } return realSetTimeout(fn, ms, ...a); };
  try {
    const live = await tailedFile("live.log", ["ok 1", "ok 2", "timeout 0"]);
    const f = live.f;
    w.render();
    T.state.activeId = f.id;
    const a = w.createFilterNode(f.id, "text", "timeout");
    T.state.activeId = f.id;
    w.render();
    assert(!toastShown() && badgeOf(a.id) === null, "no alert on initial load");
    assert(!a.alert && !rowOf(a.id).querySelector(".tree-alert-bell"), "an ordinary node has no bell");

    // ---- toggle via context menu + undo ----
    assert(menuAlert(a.id) === "Alert on new matches", "the menu offers 'Alert on new matches'");
    assert(a.alert === true && rowOf(a.id).querySelector(".tree-alert-bell"), "the toggle sets node.alert and draws a bell");
    assert(!toastShown(), "switching the alert on raises nothing");
    w.undo();
    assert(!T.state.nodes[a.id].alert && !rowOf(a.id).querySelector(".tree-alert-bell"), "undo clears the flag and the bell");
    w.redo();
    assert(T.state.nodes[a.id].alert === true, "redo restores it");
    T.state.activeId = f.id; w.render();
    { const lb = menuAlert(a.id); assert(lb === "Stop alerting" && !T.state.nodes[a.id].alert, "once on, the menu offers Stop alerting and clicking it switches it off, got " + lb); }
    assert(menuAlert(a.id) === "Alert on new matches" && T.state.nodes[a.id].alert === true, "and back on again");
    T.state.activeId = f.id; w.render();
    assert(T.state.nodes[a.id].alert === true, "alert on for the tail tests");

    // ---- growth: badge + toast ----
    live.text += line("timeout 1") + line("ok 3") + line("timeout 2");
    live.handle._setText(live.text);
    await w.tailTick();
    assert(badgeOf(a.id) === "+2", "two new matches -> badge +2, got " + badgeOf(a.id));
    assert(toastShown() && toastText() === "\u201ctimeout\u201d: 2 new matches", "single-node toast text, got " + JSON.stringify(toastText()));
    assert(d.querySelector("#copyToast .toast-action").textContent === "Show", "the toast offers Show");

    // ---- rate limit: second tick inside 5 s only accumulates ----
    now += 1000;
    live.text += line("timeout 3");
    live.handle._setText(live.text);
    await w.tailTick();
    assert(badgeOf(a.id) === "+3", "badge keeps counting, got " + badgeOf(a.id));
    assert(toastText() === "\u201ctimeout\u201d: 2 new matches", "no new toast inside the 5 s window, got " + JSON.stringify(toastText()));
    assert(timers.length >= 1, "a timer was scheduled for the summary");
    now += 5000;
    timers.splice(0).forEach(t => t.fn());
    assert(toastText() === "\u201ctimeout\u201d: 1 new match", "the summary toast follows once the window opens, got " + JSON.stringify(toastText()));

    // ---- several alerts -> one summary, sorted desc ----
    const b = w.createFilterNode(f.id, "text", "boom");
    T.state.nodes[b.id].alert = true;
    T.state.activeId = f.id; w.render();
    now += 6000;
    live.text += line("boom 1") + line("boom 2") + line("boom 3") + line("timeout 4");
    live.handle._setText(live.text);
    await w.tailTick();
    assert(toastText() === "2 alerts: \u201cboom\u201d +3, \u201ctimeout\u201d +1", "multi-alert toast, got " + JSON.stringify(toastText()));
    assert(badgeOf(b.id) === "+3" && badgeOf(a.id) === "+4", "badges per node, got " + badgeOf(b.id) + " / " + badgeOf(a.id));

    // ---- Show activates the node and clears its badge ----
    fireClick(d.querySelector("#copyToast .toast-action"), w);
    assert(T.state.activeId === b.id && T.state.tailFollow === true, "Show activates the node with most new matches, follow on");
    assert(badgeOf(b.id) === null && !T.state.nodes[b.id]._alertUnseen, "the active node carries no badge");
    assert(badgeOf(a.id) === "+4", "other nodes keep theirs");

    // ---- active node + follow on: silent ----
    now += 6000;
    resetToast();
    live.text += line("boom 4");
    live.handle._setText(live.text);
    await w.tailTick();
    assert(!toastShown() && badgeOf(b.id) === null, "active node with follow on raises neither badge nor toast");

    // ---- rotation: silent ----
    T.state.activeId = f.id; w.render();
    now += 6000;
    resetToast();
    const rotated = ["timeout r1", "timeout r2", "boom r3"].map(line).join("");
    live.text = rotated;
    live.handle._setText(rotated);
    await w.tailTick();
    assert(!toastShown(), "a rotation raises no alert");
    assert(!T.state.nodes[a.id]._alertUnseen || badgeOf(a.id) === "+4", "a rotation adds nothing to the badge");

    // ---- definition edit / undo: silent ----
    const before = T.state.nodes[a.id]._alertUnseen;
    w.updateFilterNodeWithUndo(a.id, "text", "ok", false, undefined, false, undefined, false, false);
    now += 6000;
    resetToast();
    live.text += line("ok 9");
    live.handle._setText(live.text);
    await w.tailTick();
    assert(!toastShown() && T.state.nodes[a.id]._alertUnseen === before, "an edited node's first tick after the edit is silent");
    w.undo();
    now += 6000;
    resetToast();
    live.text += line("ok 10");
    live.handle._setText(live.text);
    await w.tailTick();
    assert(!toastShown() && !(T.state.nodes[a.id]._alertUnseen > 0), "undo of an edit raises no alert (activating the node marks it seen)");

    // ---- muted alert node: silent ----
    T.state.activeId = f.id; w.render();
    const unseenBeforeMute = T.state.nodes[a.id]._alertUnseen || 0;
    w.toggleMuteWithUndo([a.id]);
    w.render();
    now += 6000;
    resetToast();
    live.text += line("timeout 11");
    live.handle._setText(live.text);
    await w.tailTick();
    assert(!toastShown() && (T.state.nodes[a.id]._alertUnseen || 0) === unseenBeforeMute, "a muted alert node stays silent");
    w.toggleMuteWithUndo([a.id]);
    w.render();

    // ---- a file in the background: the row updates in place, no render ----
    const bg = await tailedFile("bg.log", ["ok 1"]);
    T.state.activeId = f.id;
    const c = w.createFilterNode(bg.f.id, "text", "fatal");
    T.state.nodes[c.id].alert = true;
    T.state.activeId = f.id;
    w.render();
    const rowBefore = rowOf(c.id);
    assert(rowBefore, "sanity: the alert node's row is in the tree");
    now += 6000;
    resetToast();
    bg.text += line("fatal 1") + line("fatal 2");
    bg.handle._setText(bg.text);
    await w.tailTick();
    assert(rowOf(c.id) === rowBefore, "the background tick did not rebuild the tree row");
    assert(badgeOf(c.id) === "+2", "the badge was updated in place, got " + badgeOf(c.id));
    assert(toastShown() && toastText() === "\u201cfatal\u201d: 2 new matches", "toast for the background node, got " + JSON.stringify(toastText()));
  } finally {
    w.Date.now = realNow;
    w.setTimeout = realSetTimeout;
  }
});
