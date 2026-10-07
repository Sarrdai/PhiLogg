// GROUP 354 — loaded by philogg.regression.test.js (see tests/README.md →
// "Group files"); runs inside its main async function, so every helper
// defined there (withApp, assert, section, waitFor, fs, path, ...) is in scope.

/* ============================================================
   GROUP 354 — homepage: scripts/build-site.js + site/index.html
   Origin: 2026-10-01 (person-requested, first version of the product
   homepage, docs/homepage.md). The build assembles one static directory
   (landing page, comment-stripped app, license, simulator tour, screenshots,
   .nojekyll); every relative link of the landing page must resolve inside
   it (it is served at a project path AND a domain root); the page's two
   runtime parts run in jsdom with a stubbed fetch: the Download section
   (stable + newer beta, older beta dropped, drafts ignored, fallback on any
   failure) and the hero terminal (header lines of the real simulator tour
   only, hidden when the log can't be fetched).
   No app window needed, like GROUP 146.
   ============================================================ */
group(354);
if (groupSelected()) {
  const os = require("os");
  const { buildSite } = require("../scripts/build-site.js");
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "philogg-site-"));
  buildSite(out);
  const rd = p => fs.readFileSync(path.join(out, p), "utf8");
  const siteHtml = rd("index.html");

  section("354a. The build output");
  for (const f of ["index.html", "app/index.html", "app/LICENSE.md", "app/tour/welcome.session.json", "app/tour/welcome.log", "app/tour/demo/app.log", ".nojekyll"])
    assert(fs.existsSync(path.join(out, f)), "built: " + f);
  const fmtIndex = JSON.parse(rd("app/formats/index.json"));
  assert(fmtIndex.includes("welcome.logformat.json") && fmtIndex.includes("app-syslog-meta.logformat.json") && fmtIndex.every(f => fs.existsSync(path.join(out, "app", "formats", f))),
    "app/formats/index.json lists the welcome and example formats, all built: " + fmtIndex);
  assert(rd("app/formats/welcome.logformat.json") === rd("app/tour/welcome.logformat.json"), "the provided welcome format is the tour's own export");
  const app = rd("app/index.html");
  assert(/const PHILOGG_VERSION = "[^"]+"/.test(app), "the hosted app still carries PHILOGG_VERSION");
  assert(!/\/\* Short commit-hash build tag under the product name/.test(app) && /Short commit-hash build tag under the product name/.test(fs.readFileSync(path.join(__dirname, "..", "philogg.html"), "utf8")),
    "a known block comment is stripped from app/index.html but present in the repo's philogg.html");
  const imgs = [...siteHtml.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map(m => m[1]);
  assert(imgs.length === 4 && imgs.every(i => /^img\//.test(i) && fs.existsSync(path.join(out, i))), "the four screenshots referenced by index.html are in img/: " + imgs);
  assert(imgs.every(i => new RegExp('<img[^>]*src="' + i + '"[^>]*width="\\d+" height="\\d+" loading="lazy"').test(siteHtml)), "images have width/height and lazy loading");
  fs.writeFileSync(path.join(out, "stale.txt"), "x");
  buildSite(out);
  assert(!fs.existsSync(path.join(out, "stale.txt")), "a second build wipes the output directory first");

  section("354b. Every relative link of the landing page resolves to a built file");
  const refs = [...siteHtml.matchAll(/\s(?:href|src)="([^"]*)"/g)].map(m => m[1].replace(/&amp;/g, "&"));
  const rel = refs.filter(u => u && !/^(https?:|#|mailto:)/.test(u));
  assert(rel.length >= 8, "found the relative links: " + rel.length);
  assert(!refs.some(u => /^\//.test(u)), "no root-absolute link (breaks the project-path hosting)");
  const exists = p => fs.existsSync(path.join(out, p)) && fs.statSync(path.join(out, p)).isFile();
  for (const u of rel) {
    const [base, query = ""] = u.split("#")[0].split("?");
    const file = base === "" || base === "./" ? "index.html" : base.endsWith("/") ? base + "index.html" : base;
    assert(exists(file), u + " -> " + file);
    const params = new URLSearchParams(query);
    for (const k of ["session", "url"]) if (params.get(k)) assert(exists(path.posix.join(path.posix.dirname(file), params.get(k))), u + ": ?" + k + "=" + params.get(k) + " exists relative to " + file);
  }
  assert(rel.includes("app/?session=tour/welcome.session.json&open=format") && rel.includes("app/?url=tour/demo/app.log"), "the format and demo deep links are on the page");

  {
    const cardLinks = [["01-log-view", "filters", "filtered"], ["04-link-view", "link", "filtered"], ["09-patterns", "patterns", "patterns"], ["03-plot", "plot", "plot"]];
    for (const [img, card, view] of cardLinks) {
      const article = siteHtml.slice(siteHtml.lastIndexOf("<article", siteHtml.indexOf("img/" + img + ".png")), siteHtml.indexOf("</article>", siteHtml.indexOf("img/" + img + ".png")));
      const want = "app/?session=tour/cards/" + card + ".session.json&amp;view=" + view;
      assert(article.includes('class="shot" href="' + want + '"') && article.includes('class="try" href="' + want + '"'), card + " card: image and Try link open its own session on the " + view + " view");
    }
    assert(!siteHtml.slice(siteHtml.indexOf('class="features"'), siteHtml.indexOf('id="run"')).includes("Take the tour"), "the cards no longer say 'Take the tour'");
  }

  section("354c. Download section");
  const tourLog = rd("app/tour/welcome.log");
  const asset = (name, size) => ({ name, size, browser_download_url: "https://github.com/Sarrdai/PhiLogg/releases/download/x/" + name });
  const stableRel = { tag_name: "v0.3.0", prerelease: false, draft: false, published_at: "2026-09-20T10:00:00Z", html_url: "https://github.com/Sarrdai/PhiLogg/releases/tag/v0.3.0", assets: [
    asset("PhiLogg-0.3.0.AppImage", 7340032), asset("philogg-0.3.0.html", 2411724), asset("PhiLogg-0.3.0_portable.zip", 9437184),
    asset("PhiLogg-0.3.0.exe", 4194304), asset("PhiLogg-0.3.0.dmg", 5242880), asset("LICENSE.md", 1024)] };
  const betaNew = { tag_name: "v0.4.0-beta.2", prerelease: true, draft: false, published_at: "2026-10-01T10:00:00Z", html_url: "https://github.com/Sarrdai/PhiLogg/releases/tag/v0.4.0-beta.2", assets: [asset("philogg-0.4.0-beta.2.html", 2500000)] };
  const betaOld = Object.assign({}, betaNew, { tag_name: "v0.3.0-beta.1", published_at: "2026-09-10T10:00:00Z" });
  const draft = Object.assign({}, betaNew, { tag_name: "v9.9.9", prerelease: false, draft: true });
  const resp = (ok, body) => ({ ok, status: ok ? 200 : 403, json: async () => body, text: async () => body });
  const loadSite = async stub => {
    const dom = new JSDOM(siteHtml, { runScripts: "dangerously", beforeParse: w => { w.fetch = stub; } });
    await dom.window.PhiloggSite.ready;
    return dom.window;
  };
  const api = list => async u => /api\.github\.com/.test(u) ? resp(true, list) : resp(true, tourLog);
  const cards = w => [...w.document.querySelectorAll("#releases .rel")];
  const fallbackLink = w => w.document.querySelector('#dl-status a[href="https://github.com/Sarrdai/PhiLogg/releases"]');

  {
    const w = await loadSite(api([betaOld, betaNew, draft, stableRel]));
    const c = cards(w);
    assert(c.length === 2, "stable + newer beta, the draft is ignored: " + c.length);
    assert(c[0].querySelector("h3").textContent === "0.3.0" && !c[0].querySelector(".tag.beta") && c[0].querySelector(".date").textContent === "2026-09-20", "stable card: version without v, date, no beta tag");
    assert(c[0].querySelector(".rel-notes").href === stableRel.html_url, "release notes link");
    const variants = [...c[0].querySelectorAll(".variant")].map(e => e.textContent);
    assert(variants.join("|") === "Single HTML file|Windows portable|Windows installer|macOS|Linux|LICENSE.md", "assets grouped by variant in display order, unknown asset by name: " + variants);
    assert([...c[0].querySelectorAll(".size")].map(e => e.textContent).join("|") === "2.3 MB|9.0 MB|4.0 MB|5.0 MB|7.0 MB|1 KB", "sizes shown");
    assert(c[0].querySelector(".assets a").getAttribute("href").endsWith("/philogg-0.3.0.html"), "download link is the asset URL");
    assert(c[1].querySelector("h3").textContent === "0.4.0-beta.2" && c[1].querySelector(".tag.beta").textContent === "Beta", "the beta card is labelled Beta");
    assert(fallbackLink(w), "a link to all releases stays below");
  }
  {
    const w = await loadSite(api([betaOld, stableRel]));
    assert(cards(w).length === 1 && cards(w)[0].querySelector("h3").textContent === "0.3.0", "a beta older than the stable release is not shown");
  }
  {
    const w = await loadSite(api([{ tag_name: "v1", prerelease: false, draft: false, published_at: "2026-01-01T00:00:00Z", html_url: "javascript:alert(1)", assets: [Object.assign(asset("<img src=x onerror=1>", 5), { browser_download_url: "javascript:alert(2)" })] }]));
    assert(!w.document.querySelector("#releases img") && w.document.querySelector("#releases .assets a").textContent === "<img src=x onerror=1>", "API data is rendered as text, not markup");
    assert([...w.document.querySelectorAll("#releases a")].every(a => a.href.startsWith("https://")), "non-https URLs from the API are replaced by the releases page");
  }
  for (const [what, stub] of [["fetch rejects", async () => { throw new Error("offline"); }], ["rate limit (not ok)", async () => resp(false, {})], ["empty list", api([])], ["only drafts", api([draft])]]) {
    const w = await loadSite(stub);
    assert(cards(w).length === 0 && fallbackLink(w), what + " -> no cards, fallback link to the Releases page");
  }

  section("354d. Hero terminal shows only header lines of the simulator tour");
  {
    const w = await loadSite(api([stableRel]));
    const rows = [...w.document.querySelectorAll("#term-body .tl")];
    assert(rows.length === 6 && !w.document.getElementById("term").hidden, "six rows, panel visible: " + rows.length);
    const expected = tourLog.split("\n").filter(l => /^\d\d:\d\d:\d\d\.\d{3} (?!DEEP)/.test(l)).slice(0, 6);
    assert(rows.every((r, i) => r.querySelector(".ts").textContent === expected[i].slice(0, 12) && r.querySelector(".lv").textContent === expected[i].slice(13).trim().split(/\s/)[0]), "timestamp and level of each row come from the tour log, in order");
    assert(rows.every(r => /^l-\w+$/.test(r.className.split(" ")[1])) && rows[0].classList.contains("l-WHAT"), "rows carry the level class (colors)");
    const text = w.document.getElementById("term-body").textContent;
    assert(!/what something is/.test(text) && !/^\s/m.test(text), "indented continuation lines are not rendered");
    assert(/Welcome to PhiLogg/.test(text), "the first entry's header text is there");
    assert(!w.document.querySelector("#term-body .tl.l-DEEP"), "DEEP entries (hidden in the tour's reading view) are skipped");
  }
  {
    // Animated tail (person-reported 2026-10-07: the terminal grew with every
    // tick and shifted the page): all rows are laid out from the first tick,
    // the not-yet-shown ones invisible, so the height never changes.
    const dom = new JSDOM(siteHtml, { runScripts: "dangerously", beforeParse: w => { w.fetch = api([stableRel]); w.matchMedia = () => ({ matches: false }); } });
    const w = dom.window;
    await waitFor(() => w.document.querySelectorAll("#term-body .tl").length > 0);
    const early = [...w.document.querySelectorAll("#term-body .tl")];
    assert(early.length === 6 && early.filter(r => !r.classList.contains("pending")).length === 1, "first tick: all six rows laid out, only the first shown: " + early.length);
    assert(w.getComputedStyle(early[5]).visibility === "hidden", "a pending row is invisible but keeps its space");
    await w.PhiloggSite.ready;
    const body = w.document.getElementById("term-body");
    assert(!body.querySelector(".tl.pending") && body.lastElementChild.classList.contains("caret"), "after the tail: every row shown, caret after the last one");
  }
  {
    const w = await loadSite(async u => /api\.github/.test(u) ? resp(true, []) : resp(false, ""));
    assert(w.document.getElementById("term").hidden === true, "welcome.log not fetchable -> terminal panel hidden");
    const w2 = await loadSite(async u => /api\.github/.test(u) ? resp(true, []) : { ok: true, text: async () => "no tour lines here\n" });
    assert(w2.document.getElementById("term").hidden === true, "no parsable line -> hidden");
  }
  fs.rmSync(out, { recursive: true, force: true });
}
