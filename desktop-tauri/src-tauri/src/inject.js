// Injected into every webview before philogg.html's own scripts run, and
// again after every navigation/reload. Built by inject.rs, which substitutes
// the __PHILOGG_*__ placeholders below. See that file for why this is one
// script rather than Electron's preload + dom-ready split.
(function () {
  "use strict";

  var SETTINGS = __PHILOGG_SETTINGS__;
  var NONCE = "__PHILOGG_NONCE__";
  var BASE = "__PHILOGG_BASE__";
  var IS_MAC = __PHILOGG_IS_MAC__;
  var LOCAL_PREFIX = "philogg://local/";

  function invoke(cmd, args) {
    try {
      return window.__TAURI_INTERNALS__.invoke(cmd, args || {});
    } catch (err) {
      return Promise.reject(err);
    }
  }

  // ---------------------------------------------------------------- settings
  // FEATURE_BACKLOG.md #33, read half. Hydrates once per process: the values
  // baked in above are a snapshot taken at startup, so re-applying them after
  // a later reload would revert anything changed since. NONCE changes every
  // process start, and sessionStorage survives reloads within one webview
  // session — so the first load of each run hydrates and every reload after
  // it leaves the page's own (newer) values alone.
  try {
    if (sessionStorage.getItem("philogg-tauri-hydrated") !== NONCE) {
      sessionStorage.setItem("philogg-tauri-hydrated", NONCE);
      for (var key in SETTINGS) {
        if (Object.prototype.hasOwnProperty.call(SETTINGS, key)) {
          localStorage.setItem(key, SETTINGS[key]);
        }
      }
    }
  } catch (err) {
    // storage unavailable/corrupt — philogg.html falls back to its own
    // defaults, same as a first run
  }

  // ------------------------------------------------------------- fetch shim
  // Tauri doesn't hand the webview a real custom scheme everywhere: what it
  // registers as `philogg` is served as `philogg://localhost/…` on
  // macOS/Linux and as `http://philogg.localhost/…` on Windows. Neither is
  // the `philogg://local/…` shape philogg.html's own isDesktopLocalUrl()
  // looks for to decide a URL is a tail-able local file. So the page is
  // handed that canonical URL (keeping the tail-follow behaviour, the
  // filename derivation and "Open File Location" all working unmodified) and
  // the actual network call is rewritten here to whatever this platform
  // really serves. See protocol.rs.
  function rewrite(url) {
    return url.indexOf(LOCAL_PREFIX) === 0
      ? BASE + "local/" + url.slice(LOCAL_PREFIX.length)
      : url;
  }
  var nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    if (typeof input === "string") {
      input = rewrite(input);
    } else if (input && typeof input.url === "string" && input.url.indexOf(LOCAL_PREFIX) === 0) {
      input = new Request(rewrite(input.url), input);
    }
    return nativeFetch(input, init);
  };

  // -------------------------------------------------------------- close()
  // FEATURE_BACKLOG.md's quitOnLastFileClose calls the plain, standard
  // `window.close()` when the last open file is closed (see philogg.html's
  // own comment on that call: it relies on the *host* intercepting a
  // renderer's own window.close() and turning it into a real window close —
  // true for Electron's BrowserWindow, but not for a Tauri webview. Here
  // `window.close()` is a bare DOM/webview API with no Tauri involvement at
  // all: the webview engine tears down the *page* (which is why the person
  // who found this bug saw the app "close" — the content actually vanished)
  // without ever telling the Rust side a close was requested, so
  // WindowEvent::CloseRequested never fires and windows.rs's close-to-tray
  // decision never runs — leaving an empty window with nothing left to
  // close it but the tray. Routing the call through the window_close command
  // instead makes it go through window.close() on the Rust side, which DOES
  // raise CloseRequested and reaches the exact same close-to-tray decision
  // the injected title-bar close button uses.
  window.close = function () {
    invoke("window_close");
  };

  // ---------------------------------------------------------------- bridge
  // The same narrow surface desktop/preload.js exposes, so philogg.html's
  // feature detection (`window.philogg` exists -> desktop build) and its
  // three context-menu outcomes work identically.
  //
  // getPathForFile stays permanently null here: Electron resolves a File
  // object back to its OS path via webUtils, and no system webview offers
  // an equivalent. Rather than leave picked/dropped files locationless, the
  // wrapper opens them itself — pickFiles runs the OS dialog, and the
  // native drag-drop handler (windows.rs) catches drops — so the path is
  // known before philogg.html ever sees the file, and travels with the
  // philogg://local/… URL it is served under. philogg.html still treats a
  // null getPathForFile as "no path known", which is now only reached by
  // its folder watch. See desktop-tauri/README.md -> "Differences from the
  // Electron wrapper".
  window.philogg = {
    getPathForFile: function () {
      return null;
    },
    pickFiles: function () {
      return invoke("pick_files");
    },
    pathForLocalUrl: function (url) {
      return invoke("path_for_local_url", { url: url });
    },
    revealPath: function (path) {
      return invoke("reveal_path", { path: path });
    },
    revealLocalUrl: function (url) {
      return invoke("reveal_local_url", { url: url });
    },
    listSystemFonts: function () {
      return invoke("list_system_fonts").catch(function () {
        return [];
      });
    },
  };

  // ------------------------------------------------------------ frameless
  // philogg.html's own #toolbar is the only header a frameless window has
  // left, so it doubles as the drag handle and (off macOS) as the place the
  // window controls live. Electron gets both for free from
  // `-webkit-app-region: drag` plus a native Window Controls Overlay; Tauri
  // has neither, so the drag region is an attribute walk and the controls
  // are real DOM styled from philogg.html's own theme variables — which is
  // also why they follow a theme/accent change with no polling at all,
  // unlike Electron's watchTheme().
  var CSS = [
    IS_MAC
      ? /* native traffic lights sit top-left; matching desktop/main.js, they
           are left there rather than moved to the right */
        ".brand { padding-left: 72px; }"
      : "",
    "#tauri-wc { display: flex; align-items: center; gap: 2px; margin-left: 4px; margin-right: -8px; }",
    "#tauri-wc button {",
    "  width: 30px; height: 30px; padding: 0; border: 0; border-radius: 7px;",
    "  display: flex; align-items: center; justify-content: center;",
    "  background: transparent; color: var(--text-secondary); cursor: pointer;",
    "}",
    "#tauri-wc button:hover { background: var(--bg-elevated-2); color: var(--accent); }",
    "#tauri-wc button[data-act=\"close\"]:hover { background: var(--level-error); color: #fff; }",
    "[data-tauri-drag-region] { cursor: default; }",
  ].join("\n");

  var CONTROLS =
    '<button type="button" data-act="minimize" title="Minimize">' +
    '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><rect x="0" y="4.5" width="10" height="1" fill="currentColor"/></svg>' +
    "</button>" +
    '<button type="button" data-act="maximize" title="Maximize / Restore">' +
    '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" aria-hidden="true"><rect x="0.5" y="0.5" width="9" height="9"/></svg>' +
    "</button>" +
    '<button type="button" data-act="close" title="Close">' +
    '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M0.5 0.5l9 9M9.5 0.5l-9 9"/></svg>' +
    "</button>";

  // Tauri's drag handling fires only when the clicked element *itself*
  // carries the attribute (Electron's app-region, by contrast, is inherited
  // by every child), so it has to be stamped on each non-interactive
  // descendant of #toolbar. Anything inside a control — the control, its
  // label, the <svg>/<path> that is the real event target on an icon button
  // — is skipped, or clicking a toolbar button would drag the window
  // instead. Re-run on mutations because #toolbar's contents change while
  // the app runs (status text, enabled/disabled controls).
  var NO_DRAG = "button, input, select, textarea, a, label, .ctx-item, #tauri-wc";
  function markDragRegion(toolbar) {
    toolbar.setAttribute("data-tauri-drag-region", "");
    var nodes = toolbar.querySelectorAll("*");
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].closest(NO_DRAG)) continue;
      nodes[i].setAttribute("data-tauri-drag-region", "");
    }
  }

  function setUpChrome() {
    var style = document.createElement("style");
    style.id = "tauri-frameless";
    style.textContent = CSS;
    document.head.appendChild(style);

    var toolbar = document.getElementById("toolbar");
    if (!toolbar) return; // not philogg.html (splash window) — nothing to dress
    markDragRegion(toolbar);
    new MutationObserver(function () {
      markDragRegion(toolbar);
    }).observe(toolbar, { childList: true, subtree: true });

    if (!IS_MAC) {
      var right = toolbar.querySelector(".toolbar-right");
      if (right) {
        var wc = document.createElement("div");
        wc.id = "tauri-wc";
        wc.innerHTML = CONTROLS;
        wc.addEventListener("click", function (event) {
          var btn = event.target.closest("button[data-act]");
          if (!btn) return;
          if (btn.dataset.act === "minimize") invoke("window_minimize");
          else if (btn.dataset.act === "maximize") invoke("window_toggle_maximize");
          else invoke("window_close");
        });
        right.appendChild(wc);
      }
    }
  }

  // FEATURE_BACKLOG.md #31: F11 toggles the same native fullscreen state the
  // maximize control uses. Electron catches this in the main process
  // (`before-input-event`); a Tauri webview has no such hook, so it is a
  // capture-phase listener here, routed to the toggle_fullscreen command.
  function setUpShortcuts() {
    window.addEventListener(
      "keydown",
      function (event) {
        if (event.key === "F11") {
          event.preventDefault();
          invoke("toggle_fullscreen");
        }
      },
      true
    );
  }

  // FEATURE_BACKLOG.md #33, write half. Same shape as desktop/main.js's
  // watchSettings(): ~1x/second, diffed before crossing the process boundary,
  // cheap for values that only ever change on an explicit user action.
  function setUpSettingsMirror() {
    var last = null;
    function flush() {
      var values = {};
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var key = localStorage.key(i);
          if (key && key.indexOf("philogg-") === 0) values[key] = localStorage.getItem(key);
        }
      } catch (err) {
        return;
      }
      var json = JSON.stringify(values);
      if (json === last) return;
      last = json;
      invoke("save_settings", { values: values }).catch(function () {});
    }
    setInterval(flush, 1000);
    // Best-effort final flush so a change made right before quitting isn't
    // lost — same intent as watchSettings()'s "close" handler.
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    flush();
  }

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  ready(function () {
    setUpChrome();
    setUpShortcuts();
    setUpSettingsMirror();
    // FEATURE_BACKLOG.md #51: dismisses the splash. Deliberately two nested
    // frames after DOMContentLoaded rather than on the event itself — the
    // point is that something has actually been painted, which is what
    // Electron's "ready-to-show" guarantees and DOMContentLoaded does not.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        invoke("app_ready").catch(function () {});
      });
    });
  });
})();
