# Homepage (`site/`, GitHub Pages)

The product homepage is one static file, `site/index.html` (inline CSS and
vanilla JS, system fonts, no CDN, no analytics), deployed to GitHub Pages
together with the **hosted app** and the **guided tour**. Everything is linked
relatively, so it works at `https://<user>.github.io/PhiLogg/` and at a custom
domain root alike.

## What is on the page

- **Nav**: Tour, Features, Typical tasks, Cheatsheet, Download, License (GitHub `LICENSE.md`), GitHub.
- **Hero**: headline, lead and four links, all deep links into the hosted app
  (`app/`, served from `app/index.html`):
  - Open PhiLogg: `app/`
  - Open with a demo log: `app/?url=tour/demo/app.log`
  - Take the tour: `app/?session=tour/welcome.session.json`
  - "Will it read my logs?": `app/?session=tour/welcome.session.json&open=format` — hidden below 600px (the app's phone layout has no format dialog)
    (the tour session plus the Add-log-format dialog)

  See `docs/persistence-and-sync.md` → "Session deep link" for the app side;
  the tour data comes from the simulator (`tools/log-sim/README.md` → "The tour").
- **Hero terminal** (`welcome.log · tail -f`): at runtime the page fetches
  `app/tour/welcome.log`, takes the header lines of the first six non-DEEP
  entries (indented continuation lines are skipped) and replays them once as a
  tail with level colors; long messages wrap inside their column (time and level stay on one line, tighter columns at phone width) instead of being cut (all at once under `prefers-reduced-motion`). All rows are laid out from the first tick (`.tl.pending`, `visibility:hidden`) and only revealed one by one, the caret moving after the last shown row, so the panel has its final height at once and the page never shifts during the tail. When the
  fetch fails (e.g. opened from `file://`) the panel stays hidden. No log line
  is written by hand in the page.
- **Facts row**, **Features** (four cards, screenshots from
  `docs/screenshots/`, shot with the Entry detail panel collapsed so only the card's point shows; each card's screenshot and "Try this →" link open the hosted app in the state the screenshot shows (the filters/link/plot sessions carry `detailCollapsed: true`, and a `?session=` load with no skipped files, bookmarks or notes shows no toast): `app/?session=tour/cards/<filters|link|patterns|plot>.session.json&view=<filtered|filtered|patterns|plot>`; the session files come from the simulator, see `tools/log-sim/README.md` → "The tour"), **Three ways to run it**.
- **Typical tasks** (`#tasks`, between the cards and "Three ways to run it"): six "I want to ..." cards, each a deep link into the hosted app using only the existing tour sessions: find the error and what led to it (`cards/filters` + `view=context`), narrow step by step (`cards/filters`, filtered), compare a request with its response (`cards/link`), spot recurring messages (`cards/patterns`), plot a value over time (`cards/plot`), teach it your own format (`welcome` + `open=format`, hidden below 600px like the hero link). No new session files.
- **Download** (`#download`): fetches
  `https://api.github.com/repos/Sarrdai/PhiLogg/releases?per_page=20` in the
  visitor's browser, ignores drafts, shows the latest stable release and, when
  it is newer than that, the latest pre-release labelled "Beta". Per release:
  version (tag without `v`), date, a link to the release notes, and the assets
  grouped by variant from the file name (`philogg-*.html` Single HTML file,
  `PhiLogg-*_portable.zip` Windows portable, `PhiLogg-*.exe` Windows installer,
  `*.dmg` macOS, `*.AppImage` Linux; anything else by name) with size. While
  loading a status line shows; on any error, rate limit or empty list a link
  to the Releases page replaces it. API data only ever reaches the DOM through
  `textContent` (and `https://` URLs). New releases and betas therefore appear
  **without redeploying**.
- **Footer**: "Source-available, free for personal use (PolyForm
  Noncommercial 1.0.0)", links to Cheatsheet, Impressum, the shipped `app/LICENSE.md` and GitHub.
- **Cheatsheet** (`site/cheatsheet.html`, English, print-friendly): First 5 minutes, Where is what (id `where-is-what`; a marked placeholder comment awaits a labelled screenshot), Best practices, Keyboard shortcuts (the defaults of `SHORTCUT_ACTIONS` and the fixed ones in `philogg.html`; update it when those change).
- **Impressum** (`site/impressum.html`, German, § 5 DDG): same static style, linked from every footer. The owner's data is masked against scrapers like the owner's Rainbow-Timer site: address and contact lines sit in `.reverse-block` (`flex-direction:column-reverse`) in reversed source order, the e-mail reads `philogg [at] kleinphilipp [.de]`, the phone number is spelled out in words, no `mailto:`/`tel:`. A short privacy note states that the Download list is fetched from the GitHub API in the visitor's browser. Do not "fix" the masking.
- The three subpages repeat the base CSS inline (no shared stylesheet, so each file stays self-contained).

The page's script exposes its functions as `window.PhiloggSite`
(`parseTourLines`, `renderTerminal`, `pickReleases`, `renderReleases`,
`loadReleases`, ...) and a `ready` promise; GROUP 354 drives them in jsdom (354e checks the Impressum masking, page cross-links and the task deep links).

## Build: `scripts/build-site.js`

`node scripts/build-site.js --out <dir>` (Node >= 18, no dependencies; also
`require`-able: `{ buildSite }`) wipes `<dir>` and writes:

| Path | Source |
|---|---|
| `index.html`, `cheatsheet.html`, `impressum.html`, other `site/**` | `site/` as is (the build needed no change for the new pages) |
| `img/*.png` | `docs/screenshots/` (the four the page shows) |
| `app/index.html` | `philogg.html` through `scripts/strip-comments.js` |
| `app/LICENSE.md` | `LICENSE.md` |
| `app/tour/` | `node tools/log-sim/cli.js -f tour` (welcome.log, welcome.logformat.json, welcome.session.json, demo/app.log, cards/app.log, cards/*.session.json) |
| `app/formats/` | provided formats the hosted app fetches at boot: `index.json`, `welcome.logformat.json` (copied from the tour output) and `examples/formats/*.logformat.json` |
| `.nojekyll` | empty |

Version stamping is not part of it: the workflow stamps its throwaway checkout
first (`scripts/release-version.js stamp`). To look at it locally:
`node scripts/build-site.js --out /tmp/site && cd /tmp/site && python3 -m http.server`.

## Workflow: `.github/workflows/pages.yml` ("Deploy Homepage")

- Triggers: `workflow_dispatch` (input `ref`, default `main`) and
  `workflow_call` (input `ref`, required).
- **build**: checkout `ref`, stamp (version = tag without `v` for a `v*` ref,
  else the committed `PHILOGG_VERSION`; build = short SHA), `build-site.js
  --out _site`, `actions/upload-pages-artifact`.
- **deploy**: `actions/deploy-pages`, `environment: github-pages`, concurrency
  group `pages`.
- `release-please.yml` has a `pages` job (`needs: [cut-release, publish]`,
  only when a release was cut) that calls it with the new tag, so the hosted
  app is the stable release's build and the site redeploys on every stable
  release. Betas never redeploy it. Run it by hand after changing `site/` or
  the tour on `main`.

## One-time setup on GitHub

1. Settings → Pages → Source: **GitHub Actions**.
2. First deploy: Actions → **Deploy Homepage** → Run workflow on `main`.
3. Custom domain (optional): Settings → Pages → Custom domain, add the DNS
   records at the domain provider (CNAME to `<user>.github.io` for a
   subdomain, or the A/AAAA records GitHub lists for an apex domain), wait for
   the check, then enable **Enforce HTTPS**.

## Not in v1

Dropping a file on the page, a `changelog.log` entry, `curl` text version.
