// GROUP content-security-policy — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP content-security-policy — strict CSP <meta> (backlog #75)
   Origin: 2026-10-11 (person-requested, backlog #75). Defense in depth: if
   injected script ever ran it must not be able to send data to another
   server. jsdom does not ENFORCE a CSP, so this group pins the policy text
   (meta first in <head>, no wildcard connect-src, object/base/form locked)
   and the up-front cross-origin guard for ?url= / ?session=. Real
   enforcement was checked in Chromium (see the changelog fragment).
   ============================================================ */
group("content-security-policy");
{
  const parseCsp = html => {
    const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/);
    if (!m) return null;
    const out = {};
    m[1].split(";").map(s => s.trim()).filter(Boolean).forEach(p => { const [k, ...v] = p.split(/\s+/); out[k] = v; });
    return { map: out, index: m.index };
  };
  const checkPolicy = (label, file, { frames }) => {
    const html = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    const head = html.slice(0, html.indexOf("</head>"));
    const csp = parseCsp(head);
    assert(csp, label + ": CSP meta tag present in <head>");
    const firstActive = Math.min(...["<script", "<style", "<link"].map(t => { const i = head.indexOf(t); return i < 0 ? Infinity : i; }));
    assert(csp.index < firstActive, label + ": CSP meta comes before every script/style/link");
    const c = csp.map;
    section(label + ": directives");
    assert(c["default-src"] && c["default-src"].join() === "'self'", label + ": default-src 'self'");
    assert(c["object-src"].join() === "'none'", label + ": object-src 'none'");
    assert(c["base-uri"].join() === "'none'", label + ": base-uri 'none'");
    assert(c["form-action"].join() === "'none'", label + ": form-action 'none'");
    const conn = c["connect-src"] || [];
    assert(conn.includes("'self'") && conn.length >= 1, label + ": connect-src has 'self'");
    assert(!conn.some(s => s === "*" || /^https?:?$/.test(s) || /^wss?:?$/.test(s) || /^https?:\/\/\*/.test(s)), label + ": connect-src has no wildcard / scheme-wide source, got " + conn.join(" "));
    assert(conn.every(s => ["'self'", "ipc:", "http://ipc.localhost"].includes(s)), label + ": connect-src is only self + Tauri IPC, got " + conn.join(" "));
    for (const k of ["script-src", "style-src", "img-src", "font-src", "media-src", "worker-src", "frame-src"]) {
      const v = c[k] || [];
      assert(!v.includes("*") && !v.includes("https:") && !v.includes("http:"), label + ": " + k + " has no remote wildcard, got " + v.join(" "));
    }
    if (frames) assert(c["frame-src"].join() === "'self'", label + ": frame-src is only the chat iframe (self)");
    else assert(c["frame-src"].join() === "'none'" && c["worker-src"].join() === "'none'", label + ": chat page allows no frames/workers");
  };
  section("content-security-policy a. philogg.html");
  checkPolicy("philogg.html", "philogg.html", { frames: true });
  section("content-security-policy b. desktop/chat.html");
  checkPolicy("chat.html", "desktop/chat.html", { frames: false });

  await withApp(async (w, d, T) => {
    section("content-security-policy c. cross-origin ?url= is refused up front with a CSP toast");
    let fetched = false;
    w.fetch = async () => { fetched = true; return { ok: true, status: 200, arrayBuffer: async () => new w.ArrayBuffer(0) }; };
    const r = await w.loadUrlIntoTree("http://evil.example/x.log");
    assert(r === null && !fetched, "no fetch was made for a cross-origin URL");
    assert(d.querySelector("#copyToast").textContent.includes("Only URLs from this site"), "toast says only same-site URLs open, got " + d.querySelector("#copyToast").textContent);
    assert(T.state.rootIds.length === 0, "no file added");
  });
  await withApp(async (w, d, T) => {
    section("content-security-policy d. cross-origin ?session= is refused up front; same-origin still fetches");
    let seen = [];
    w.fetch = async u => { seen.push(u); return { ok: false, status: 404, text: async () => "" }; };
    const ok = await w.loadSessionFromUrl("https://evil.example/t.session.json");
    assert(ok === false && seen.length === 0, "no fetch for a cross-origin session URL");
    assert(d.querySelector("#copyToast").textContent.includes("Only URLs from this site"), "session toast names the same-site rule");
    await w.loadSessionFromUrl("/tours/t.session.json");
    assert(seen.length === 1 && seen[0] === "http://localhost/tours/t.session.json", "a same-origin session URL is fetched, got " + seen.join());
    assert(w.isSameOriginUrl("philogg://local/abc/x.log"), "desktop philogg://local/ file URLs count as same-origin");
    assert(!w.isSameOriginUrl("http://localhost.evil.example/x.log"), "a look-alike host is cross-origin");
  });
}
