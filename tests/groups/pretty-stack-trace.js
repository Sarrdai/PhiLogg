// GROUP pretty-stack-trace — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness helper is in scope.

/* ============================================================
   GROUP pretty-stack-trace — entry detail: Pretty highlights stack traces
   Origin: 2026-10-05 (usability polish p1-b). Java, .NET and Python traces
   in a message get header/frame/framework/file classes in Pretty (one
   syn-block); Parsed and Raw stay plain; a trace-free message is unchanged.
   Data: tools/log-sim (stacktrace + opt-in pytrace scenarios).
   ============================================================ */
group("pretty-stack-trace");
{
  await withApp(async (w, d, T) => {
    const [st] = LOGSIM.generateToStrings({ scenarios: ["stacktrace"], entries: 200, seed: 7 });
    const [py] = LOGSIM.generateToStrings({ scenarios: ["pytrace", "basic"], entries: 60, seed: 7 });
    const f = await w.addFile(st.name, st.text, () => {});
    const fp = await w.addFile("py-" + py.name, py.text, () => {});
    T.state.activeId = f.id; w.render();
    const msgEl = d.querySelector("#detailMessage");
    const show = (file, entry) => { T.state.activeId = file.id; w.render(); w.selectEntry(entry.id); };
    const tab = v => d.querySelector('#detailViewTabs [data-detail-view="' + v + '"]');
    const net = f.entries.find(e => e.message.includes("System.InvalidOperationException") && e.message.includes("--->"));
    const java = f.entries.find(e => e.message.includes("java.lang.IllegalStateException"));
    const pye = fp.entries.find(e => e.message.includes("Traceback (most recent call last):"));
    const plain = fp.entries.find(e => !e.message.includes("\n"));
    assert(net && java && pye && plain, "simulator gives .NET, Java and Python traces plus a plain entry");

    section("pretty-stack-trace a. Java");
    tab("pretty").click();
    show(f, java);
    assert(msgEl.querySelectorAll(".syn-block.syn-trace").length === 1, "one trace block");
    const exc = [...msgEl.querySelectorAll(".syn-trace-exc")].map(n => n.textContent);
    assert(exc.includes("java.lang.IllegalStateException") && exc.includes("java.net.SocketException"), "header and Caused by types are bold exception spans, got " + exc);
    assert(msgEl.textContent.includes(": Connection reset") && ![...msgEl.querySelectorAll(".syn-trace-exc")].some(n => n.textContent.includes("Connection")), "the exception message stays outside the span");
    const frames = [...msgEl.querySelectorAll(".syn-trace-frame")];
    const app = frames.find(n => n.textContent.includes("com.example.db.Pool.borrow"));
    const fw = frames.find(n => n.textContent.includes("sun.nio.ch.NioSocketImpl"));
    assert(app && !app.classList.contains("syn-trace-fw") && /^    at /.test(app.textContent), "application frame: normal colour, uniformly indented");
    assert(fw && fw.classList.contains("syn-trace-fw"), "java.base/sun.* frame is dimmed");
    assert(/^Pool\.java:\d+$/.test(app.querySelector(".syn-trace-loc").textContent), "file:line is emphasised, got " + app.querySelector(".syn-trace-loc").textContent);
    assert(msgEl.textContent.includes("... ") && msgEl.querySelector(".syn-trace-note"), "'... N more' is a note line");
    assert(msgEl.textContent.startsWith(java.message.split("\n")[0]), "text before the trace stays first");

    section("pretty-stack-trace b. .NET");
    show(f, net);
    const locs = [...msgEl.querySelectorAll(".syn-trace-loc")].map(n => n.textContent);
    assert(locs.some(t => /\.cs:line \d+$/.test(t)), "path:line N emphasised, got " + locs);
    const nexc = [...msgEl.querySelectorAll(".syn-trace-exc")].map(n => n.textContent);
    assert(nexc.includes("System.InvalidOperationException") && nexc.includes("System.Data.SqlClient.SqlException"), "header and ---> types, got " + nexc);
    assert(msgEl.textContent.includes("(0x80131904): Timeout expired."), "hex code and message kept as plain text");
    const nf = [...msgEl.querySelectorAll(".syn-trace-frame")];
    assert(nf.find(n => n.textContent.includes("Microsoft.AspNetCore")).classList.contains("syn-trace-fw"), "Microsoft.* frame dimmed");
    assert(nf.find(n => n.textContent.includes("System.Data.SqlClient.SqlCommand")).classList.contains("syn-trace-fw"), "System.* frame dimmed");
    assert(!nf.find(n => /OrderService\.Submit/.test(n.textContent)).classList.contains("syn-trace-fw"), "application frame not dimmed");
    assert(msgEl.textContent.includes("--- End of inner exception stack trace ---"), "end-of-inner line shown");
    assert(!msgEl.innerHTML.includes("<script"), "everything escaped");

    section("pretty-stack-trace c. Python");
    show(fp, pye);
    assert(msgEl.querySelectorAll(".syn-block.syn-trace").length === 1, "python trace block");
    const pf = [...msgEl.querySelectorAll(".syn-trace-frame")];
    assert(pf.some(n => n.textContent.includes("worker.py") && !n.classList.contains("syn-trace-fw") && /^line \d+$/.test(n.querySelector(".syn-trace-loc").textContent)), "app frame: 'line N' emphasised, not dimmed");
    assert(pf.some(n => n.textContent.includes("site-packages") && n.classList.contains("syn-trace-fw")), "site-packages frame dimmed");
    assert([...msgEl.querySelectorAll(".syn-trace-exc")].some(n => n.textContent === "requests.exceptions.ConnectionError"), "final error line type is the exception span");

    section("pretty-stack-trace d. Parsed/Raw unchanged, trace-free message unchanged, thresholds");
    tab("parsed").click();
    assert(!msgEl.querySelector(".syn-block") && msgEl.textContent === pye.message, "Parsed stays plain");
    tab("raw").click();
    assert(!msgEl.querySelector(".syn-block") && msgEl.textContent === pye.raw, "Raw stays plain");
    tab("pretty").click();
    show(fp, plain);
    assert(!msgEl.querySelector(".syn-block") && msgEl.textContent === plain.message, "a message without a trace is unchanged");
    assert(w.formatStackTraceHtml("Value at the end\nsecond line") === null, "prose with 'at' is no trace");
    assert(w.formatStackTraceHtml("boom\n   at A.B.c(x)") === null, "a single frame without header is no trace");
    assert(w.formatStackTraceHtml("boom\n   at A.B.c(x)\n   at A.B.d(y)") !== null, "two frames are a trace");
    assert(w.formatStackTraceHtml("java.lang.RuntimeException: x\n\tat a.B.c(B.java:1)") !== null, "header plus one frame is a trace");
    assert(w.formatStackTraceHtml("<b>&\n   at A.B.c(<i>)\n   at A.B.d(y)").includes("&lt;i&gt;"), "html in frames is escaped");
  });
}
