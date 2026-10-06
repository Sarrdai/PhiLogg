# Device test checklist

Manual checks for behavior the cloud container cannot verify: real touch
input, a real browser's history handling, and the macOS/Linux desktop
builds. The regression suite covers the logic of each item (jsdom, partly
CDP-simulated touch); this list is for a person with the device in hand.
Run it after a change to one of these areas, and note device, OS, browser
and PhiLogg version with the result.

Test data: the simulator tour (`node tools/log-sim/cli.js -f tour -o <dir>`)
— open `demo/app.log`, or serve the directory and open
`philogg.html?session=welcome.session.json`.

## 1. Pinch zoom on the touch minimap

Device: tablet or phone (real touch screen). Only CDP-simulated so far
(GROUP minimap-pinch-adopt, docs/filters.md → minimap).

Steps:
1. Open `demo/app.log`; the minimap strip shows above the log.
2. Put two fingers on the strip and spread them.
3. Pinch them together again, past the whole file.
4. Drag one finger to make a draft window, then add a second finger while
   dragging.

Expected:
- Spreading zooms in around the midpoint of the fingers; breadcrumbs
  appear and the page itself does not zoom.
- Pinching out past the whole file returns to the full-file view.
- Lifting the fingers creates no draft, jump or long-press menu.
- In step 4 the second finger cancels the drag; the previous draft (or
  none) comes back.

## 2. Double-tap on a Link-view row

Device: tablet (compact tier, real touch).

Steps:
1. Open `demo/app.log`, row menu (long-press) → **Pair with…**, tap an end
   row, then **Pair all like these…** → the Link view opens.
2. Double-tap one row of a pair.
3. Tap once on a different row, wait, tap once again.

Expected:
- The double-tap jumps to that entry in the log view (same as a mouse
  double-click), selected and scrolled into view.
- Two slow single taps only select; they never count as a double-tap.
- A tap that only closes an open menu is not counted as the first tap of a
  double-tap.

## 3. Browser Back guard (real Chrome)

Device: Android phone with Chrome, and desktop Chrome (Alt+Left / mouse
Back button). Session state is saved, so a test can safely end by leaving.

Steps:
1. Open PhiLogg with `demo/app.log`, tap a row, add two filters (so the
   in-app nav history has steps).
2. Open a popup (e.g. the filter popup), press Back once.
3. On the phone, open the bottom sheet (tap a card), press Back once.
4. Press Back repeatedly, one at a time, until the toast "Press Back again
   to leave PhiLogg" appears; then press Back once more.
5. Reopen PhiLogg, repeat step 1, then press Back twice very quickly.
6. Reload the page.

Expected:
- Step 2 closes the popup only; step 3 closes the sheet only.
- Each Back in step 4 steps the in-app history; the toast appears only when
  nothing is left, and the following Back leaves the page.
- Step 5: the fast double Back steps twice in the app (or leaves only after
  the toast) — it never leaves PhiLogg silently.
- Step 6: the session (file, filters) comes back.

## 4. Saving in the macOS/Linux desktop builds (backlog #102)

Device: the macOS and the Linux desktop build (WKWebView / WebKitGTK have
no `showSaveFilePicker`, so saves fall back to an `<a download>`).

Steps:
1. Open `demo/app.log` in the desktop app, add a filter.
2. Save the session; save a filter; Export / Share → save a file; export a
   CSV from the Table view; save a plot image.
3. Look for each file (Downloads folder, the app's working directory).

Expected:
- Each save writes a file and the app's "Saved/Downloaded …" toast names
  where. Record per save type: written yes/no, location, file name.
- If nothing is written, note it on backlog #102 (candidate fix: a
  wrapper-side save dialog via the `window.philogg` contract).
