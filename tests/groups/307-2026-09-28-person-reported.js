// GROUP 307 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 307 — 2026-09-28 (person-reported after the first desktop start):
   the chat window looks like the main app — frameless with its own title
   bar (drag region, the main window's window-control buttons, which act
   through the transport), .toolbar-icon-btn SVG buttons instead of emoji,
   the main window's primary/secondary button and theme variables
   (accent-on, border-hover), and (same day, person-reported) rename /
   confirm in an in-page dialog styled like the app's dialogs instead of
   the webview's native prompt()/confirm(). macOS keeps the native traffic
   lights.
   ============================================================ */
group(307);
{
  if (groupSelected()) {
    section("307a. Chat window chrome: title bar, window controls, app-style buttons");
    const acts = [];
    const open = (search, transport) => {
      const dom = new JSDOM(CHAT_HTML, {
        runScripts: "dangerously", pretendToBeVisual: true, url: "http://localhost/app/chat.html" + search,
        beforeParse(cw) { cw.philoggChatTransport = transport; },
      });
      return dom;
    };
    const dom = open("", { mode: "window", send() {}, onMessage() {}, windowAction: a => acts.push(a) });
    const cd = dom.window.document;
    const bar = cd.getElementById("chatTitlebar");
    assert(bar.hasAttribute("data-tauri-drag-region") && cd.getElementById("chatTitle").hasAttribute("data-tauri-drag-region"), "the title bar is the drag region");
    assert(cd.getElementById("chatWc").style.display === "" && cd.querySelectorAll("#chatWc button").length === 3, "own window: minimize / maximize / close");
    ["minimize", "maximize", "close"].forEach(a => cd.querySelector('#chatWc [data-act="' + a + '"]').click());
    assert(acts.join() === "minimize,maximize,close", "they act through the transport (window_minimize / window_toggle_maximize / window_close)");
    const btns = [...cd.querySelectorAll("#chatTitlebar button, #chatToolbar button")].filter(b => !b.closest("#chatWc"));
    assert(btns.length === 6 && btns.every(b => b.classList.contains("toolbar-icon-btn") && b.querySelector("svg") && b.textContent.trim() === ""), "header buttons are the main window's icon buttons (SVG, no emoji)");
    assert(!/[📌🗑⚙✎⇥⇤＋]/u.test(cd.body.innerHTML), "no emoji glyphs left");
    dom.window.close();
    const mac = open("?mac=1", { mode: "window", send() {}, onMessage() {}, windowAction() {} });
    assert(mac.window.document.documentElement.classList.contains("mac") && mac.window.document.getElementById("chatWc").style.display === "none", "macOS: room for the traffic lights, no own controls");
    mac.window.close();
    const plain = open("", { mode: "window", send() {}, onMessage() {} });
    assert(plain.window.document.getElementById("chatWc").style.display === "none", "a transport without window actions shows none");
    plain.window.close();
  }
}
{
  if (groupSelected()) {
    section("307c. In-page dialog instead of the webview's prompt()/confirm()");
    const dom = new JSDOM(CHAT_HTML, { runScripts: "dangerously", pretendToBeVisual: true,
      beforeParse(cw) { cw.philoggChatTransport = { mode: "window", send() {}, onMessage() {} }; cw.prompt = cw.confirm = () => { throw new Error("native"); }; } });
    const cw = dom.window, cd = cw.document, dlg = cd.getElementById("chatDialog");
    assert(dlg.classList.contains("hidden") && cw.getComputedStyle(dlg).display === "none", "hidden until needed");
    let p = cw.philoggChatView.dialog({ title: "Rename this chat", value: "Alt", ok: "Rename" });
    assert(cw.getComputedStyle(dlg).display !== "none" && cd.querySelector("#chatDialog .link-dialog-card") && cd.getElementById("chatDialogOk").className === "btn-mini" && cd.getElementById("chatDialogCancel").className === "btn-mini-secondary", "the main app's dialog card and buttons");
    assert(cd.activeElement === cd.getElementById("chatDialogInput") && cd.getElementById("chatDialogOk").textContent === "Rename", "input focused, OK labelled");
    cd.getElementById("chatDialogInput").value = "  Neu  ";
    cd.getElementById("chatDialogInput").dispatchEvent(new cw.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    assert(await p === "Neu" && dlg.classList.contains("hidden"), "Enter confirms, trimmed");
    p = cw.philoggChatView.dialog({ title: "x", value: "y" });
    cd.getElementById("chatDialogInput").dispatchEvent(new cw.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert(await p === null, "Escape cancels");
    p = cw.philoggChatView.dialog({ title: "x", value: "y" });
    cd.getElementById("chatDialogInput").value = "   ";
    cd.getElementById("chatDialogOk").click();
    assert(await p === null, "an empty name is no rename");
    p = cw.philoggChatView.dialog({ title: "Delete?", text: "sure", ok: "Delete", danger: true });
    assert(cd.getElementById("chatDialogInput").classList.contains("hidden") && cd.getElementById("chatDialogOk").classList.contains("danger") && cd.getElementById("chatDialogText").textContent === "sure", "a confirm: no input, red OK, the text shown");
    dlg.dispatchEvent(new cw.MouseEvent("click", { bubbles: true }));
    assert(await p === null, "a click on the backdrop cancels");
    p = cw.philoggChatView.dialog({ title: "Delete?", ok: "Delete" });
    cd.getElementById("chatDialogOk").click();
    assert(await p === true, "OK on a confirm → true");
    dom.window.close();
  }
}
await withApp(async (w, d, T) => {
  section("307b. The snapshot carries the variables the app-style buttons need");
  const theme = w.llmSnapshot().theme;
  assert(theme["--accent-on"] && theme["--border-hover"] && theme["--accent-strong"] && theme["--bg-panel"], "accent-on, border-hover, accent-strong, bg-panel");
}, { philogg: llmDesktopStub(), beforeParse: llmOn });
