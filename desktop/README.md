# PhiLogg desktop wrapper

A thin Electron shell around the unmodified `../philogg.html` — adds `.log`
file associations and CLI-argument file opening on Windows/Linux/macOS.
Separate, optional deliverable: doesn't touch `philogg.html` or its own
release path (`.github/workflows/release.yml`) at all. See `PROJECT.md`
→ "Deep-link loading (`?url=`)" and the plan this was built from for the
full design rationale.

## Status

**Scaffolded, not built or run anywhere yet.** This container has no
display server (a real `BrowserWindow` needs one) and no way to test
platform-specific installers/file-association behavior across all three
OSes, so `npm install` was deliberately not run here. Before relying on
this:

1. `cd desktop && npm install` on a real machine.
2. `npm start` — confirms the window opens and loads `philogg.html`
   (via the `philogg://app/philogg.html` URL, not `file://` — see
   `main.js`'s top comment for why).
3. Open a `.log` file via a command-line argument
   (`electron . /path/to/some.log` in dev, or the packaged binary once
   built) and confirm it loads through the `philogg://local/<id>` route.
4. `npm run build` (electron-builder) — produces an installer for
   whatever platform you're building on. Cross-compiling a signed
   Windows/macOS installer from Linux CI needs extra setup (signing
   certs, `electron-builder`'s own cross-build docs) not covered here.
5. Add real icons (`build/icons/README.md`) before a release build —
   electron-builder uses its own default icon until then.

## Why no `preload.js` / IPC bridge

The renderer never needs Node access. `main.js` reads a local file via
Node `fs` (bypassing the browser's gesture requirement) and serves it back
over a custom `philogg://` scheme instead — `philogg.html`'s existing
`?url=` deep-link loader (`loadFromUrlParam()`) just `fetch()`es it, the
exact same code path a remote CI log link uses. One loading mechanism,
not two.

## Why a custom scheme instead of `file://`

`loadFromUrlParam()` deliberately refuses to even attempt a fetch when
`location.protocol === "file:"` (that guard exists because a real
`file://` page genuinely cannot `fetch()` anything in a browser). Loading
`philogg.html` itself through the privileged custom `philogg://` scheme
instead of `loadFile()` keeps that guard intact — this wrapper isn't a
special case carved out of it, it just isn't a `file://` page.
