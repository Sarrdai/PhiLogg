// Injected into every webview before philogg.html's own scripts run, and
// again after every navigation/reload. Built by inject.rs, which substitutes
// the __PHILOGG_*__ placeholders below. See that file for why the
// before-script and needs-the-DOM halves are one script here.
(function () {
  "use strict";

  var SETTINGS = __PHILOGG_SETTINGS__;
  var NONCE = "__PHILOGG_NONCE__";
  var BASE = "__PHILOGG_BASE__";
  var IS_MAC = __PHILOGG_IS_MAC__;
  // IDE Integration (Visual Studio jump-to-source) is Windows-only — VS
  // itself doesn't exist elsewhere. Baked in at generation time, like
  // IS_MAC, so philogg.html can decide at boot, synchronously, whether to
  // show that Settings section/context-menu item at all.
  var IS_WINDOWS = __PHILOGG_IS_WINDOWS__;
  var LOCAL_PREFIX = "philogg://local/";

  function invoke(cmd, args) {
    try {
      return window.__TAURI_INTERNALS__.invoke(cmd, args || {});
    } catch (err) {
      return Promise.reject(err);
    }
  }

  // A Tauri IPC channel (what @tauri-apps/api's `Channel` does, without the
  // package): Rust sends `{ message, index }`, large messages arrive through
  // a separate fetch and so can overtake each other, hence the reordering;
  // `{ end: true, index }` follows once Rust dropped its side. `done`
  // resolves after the last message was handed to onMessage.
  function channel(onMessage) {
    var next = 0;
    var endIndex = -1;
    var pending = {};
    var finish;
    var done = new Promise(function (resolve) {
      finish = resolve;
    });
    var id = window.__TAURI_INTERNALS__.transformCallback(function (raw) {
      if ("end" in raw) endIndex = raw.index;
      else pending[raw.index] = raw.message;
      while (next in pending) {
        var msg = pending[next];
        delete pending[next];
        next += 1;
        onMessage(msg);
      }
      if (next === endIndex) {
        window.__TAURI_INTERNALS__.unregisterCallback(id);
        finish();
      }
    });
    return { arg: "__CHANNEL__:" + id, done: done };
  }

  // ---------------------------------------------------------------- settings
  // FEATURE_BACKLOG.md #33, read half. Hydrates once per process: the values
  // baked in above are a snapshot taken at startup, so re-applying them after
  // a later reload would revert anything changed since. NONCE changes every
  // process start, and sessionStorage survives reloads within one webview
  // session — so the first load of each run hydrates and every reload after
  // it leaves the page's own (newer) values alone.
  try {
    if (sessionStorage.getItem("philogg-desktop-hydrated") !== NONCE) {
      sessionStorage.setItem("philogg-desktop-hydrated", NONCE);
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
  // own comment on that call: it relies on the *host* intercepting the
  // page's own window.close() and turning it into a real window close, which
  // a Tauri webview does not do. Here
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
  // The narrow surface philogg.html feature-detects on, so its
  // `window.philogg` check (-> desktop build) and its three context-menu
  // outcomes all work.
  //
  // getPathForFile stays permanently null: no system webview resolves a
  // File object back to its OS path. Rather than leave picked/dropped files
  // locationless, the wrapper opens them itself — pickFiles runs the OS
  // dialog, the native drag-drop handler (windows.rs) catches drops, and
  // listFolder lists a watched folder — so the path is known before
  // philogg.html ever sees the file, and travels with the philogg://local/…
  // URL it is served under. philogg.html still treats a null
  // getPathForFile as "no path known"; under this wrapper no route reaches
  // that case any more. See desktop/README.md -> "Known limitations".
  window.philogg = {
    getPathForFile: function () {
      return null;
    },
    pickFiles: function () {
      return invoke("pick_files");
    },
    // Folder watch, the two halves philogg.html's own showDirectoryPicker
    // route can't provide here: the OS folder dialog, and the directory
    // listing. Chromium's sensitive-directory blocklist (Desktop, Downloads,
    // …) applies to showDirectoryPicker and cannot be switched off by an
    // embedder, and WKWebView/WebKitGTK don't implement it at all — so the
    // page uses these instead wherever they exist. See commands.rs.
    pickFolder: function () {
      return invoke("pick_folder");
    },
    listFolder: function (path, extensions) {
      return invoke("list_folder", { path: path, extensions: extensions || [] });
    },
    // The subfolder half of listFolder, for the "Include subfolders" setting
    // — see commands.rs::list_subfolders.
    listSubfolders: function (path) {
      return invoke("list_subfolders", { path: path });
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
    // ZIP sources, item 3 (this session): a non-log entry extracted from an
    // opened ZIP has only its bytes in hand (see philogg.html's
    // openZipEntryExternally) — this writes them to a temp file and opens it
    // with the OS's default app for its type. See commands.rs::open_extracted_entry.
    openExtractedEntry: function (name, bytes) {
      return invoke("open_extracted_entry", { name: name, bytes: Array.from(bytes) });
    },
    // Every save the page makes (its saveFileWithFeedback): the OS save
    // dialog plus the write, in Rust — WKWebView/WebKitGTK have no
    // showSaveFilePicker, and their <a download> fallback is cancelled
    // (macOS) or lands unasked in ~/Downloads (Linux). `bytes` is a
    // Uint8Array sent as the raw IPC body. Resolves with the saved file's
    // name, or null when cancelled. See commands.rs::save_file.
    saveFile: function (name, bytes, opts) {
      try {
        return window.__TAURI_INTERNALS__.invoke("save_file", bytes, {
          headers: {
            "x-philogg-name": encodeURIComponent(name),
            "x-philogg-description": encodeURIComponent((opts && opts.description) || ""),
            "x-philogg-ext": encodeURIComponent((opts && opts.ext) || ""),
          },
        });
      } catch (err) {
        return Promise.reject(err);
      }
    },
    // Clickable-local-path feature: pathExists gates the hover popup,
    // openPath is its "Open file" action (revealPath above already covers
    // "Open containing folder"). See commands.rs. A network (UNC) path
    // answers false unless the caller passes `{ allowRemote: true }`, so a
    // path taken from log text never makes the OS contact a remote host.
    pathExists: function (path, opts) {
      return invoke("path_exists", { path: path, allowRemote: !!(opts && opts.allowRemote) });
    },
    openPath: function (path) {
      return invoke("open_path", { path: path });
    },
    // "Open here": registers the path as a local file (same route
    // pickFiles/listFolder use) so philogg.html can load it straight into
    // the tree via its own loadDesktopLocalFiles. See commands.rs::open_local_path.
    openLocalPath: function (path) {
      return invoke("open_local_path", { path: path });
    },
    // Native parsing: Rust reads the philogg://local/… file behind `url` and
    // parses it in parallel under `format` (philogg.html's nativeFormatSpec),
    // handing onMessage, in order, `{ type: "progress", fraction }` notes and
    // the entries as binary batches (ArrayBuffers — philogg.html's
    // decodeNativeBatch reads them).
    // Resolves with `{ size }` once the last batch was delivered; rejects —
    // before any batch — for a format the native engine can't run exactly
    // like JS, and philogg.html falls back to its own parser.
    // See commands.rs::parse_log_file.
    parseLogFile: function (url, format, onMessage) {
      var ch = channel(onMessage);
      return invoke("parse_log_file", { url: url, format: format, onEvent: ch.arg }).then(function (summary) {
        return ch.done.then(function () {
          return summary;
        });
      });
    },
    listSystemFonts: function () {
      return invoke("list_system_fonts").catch(function () {
        return [];
      });
    },
    isWindows: IS_WINDOWS,
    // IDE Integration: vsListInstances populates the Settings dialog's
    // Connect picker (each running Visual Studio instance + whichever
    // solution it has open); vsOpenFile is the "Open in Visual Studio"
    // action, given the moniker of a previously-listed instance. Both are
    // Windows-only — see vs_integration.rs.
    vsListInstances: function () {
      return invoke("vs_list_instances").catch(function (err) {
        return { instances: [], error: String(err) };
      });
    },
    vsOpenFile: function (moniker, path, line) {
      return invoke("vs_open_file", { moniker: moniker, path: path, line: line });
    },
    // PiP exit half: philogg.html's jumpAfterPip awaits this before running
    // a "jump to another view", so the reveal lands on the restored
    // (full-size) viewport. Resolves only after the Rust side has applied the
    // geometry restore (see commands.rs's pip_exit).
    exitPip: function () {
      return invoke("pip_exit");
    },
    // Focus Mode (FEATURE_BACKLOG.md #66): real OS fullscreen, a Tauri-only
    // capability. philogg.html's toggleFocusMode() calls this when entering/
    // leaving its distraction-free mode; the plain browser build has no
    // window.philogg at all, so it never fullscreens (and never binds F11).
    setFullscreen: function (enabled) {
      return invoke("window_set_fullscreen", { enabled: enabled });
    },
    // LLM assistant (docs/llm-assistant.md). philogg.html feature-detects
    // the whole feature on llmChat. HTTP runs in Rust, loopback only
    // (philogg-llm). llmChat hands onEvent `{ type: "chunk", data }` per SSE
    // chunk (or one `{ type: "message", data }` for a non-streamed answer)
    // and resolves after the last one; llmCancel(requestId) is Stop.
    llmModels: function (baseUrl) {
      return invoke("llm_models", { baseUrl: baseUrl });
    },
    // LM Studio's native model list (context lengths for the chat's
    // context bar); rejects on servers without it.
    llmModelDetails: function (baseUrl) {
      return invoke("llm_model_details", { baseUrl: baseUrl });
    },
    llmChat: function (requestId, baseUrl, request, onEvent) {
      var ch = channel(onEvent);
      return invoke("llm_chat", { requestId: requestId, baseUrl: baseUrl, request: request, onEvent: ch.arg }).then(function () {
        return ch.done;
      });
    },
    llmCancel: function (requestId) {
      return invoke("llm_cancel", { requestId: requestId });
    },
    // The chat window (desktop/chat.html, a thin view): llmChatWindow(action,
    // on) — "show" | "hide" | "alwaysOnTop" | "focusMain"; llmViewNotify(msg)
    // relays a message to it (Rust evals window.philoggChatReceive there).
    // Its commands come back through window.philoggLlmViewMessage.
    llmChatWindow: function (action, on) {
      return invoke("llm_chat_window", { action: action, on: !!on });
    },
    llmViewNotify: function (msg) {
      return invoke("llm_main_to_view", { msg: msg }).catch(function () {});
    },
  };

  // ------------------------------------------------------------ frameless
  // philogg.html's own #toolbar is the only header a frameless window has
  // left, so it doubles as the drag handle and (off macOS) as the place the
  // window controls live. Tauri offers neither an inherited drag region nor
  // a native window-controls overlay, so the drag region is an attribute
  // walk and the controls are real DOM styled from philogg.html's own theme
  // variables — which is also why they follow a theme/accent change with no
  // polling or backend involvement at all.
  var CSS = [
    IS_MAC
      ? /* native traffic lights sit top-left; left there rather than moved
           to the right, which is where a Mac user expects them */
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
    // The picture-in-picture title strip: a slim, always-on-top bar holding
    // the mini window's two controls (back-to-full and minimize). Hidden
    // until philogg.html flips `html.pip-mode` on, at which point the normal
    // #toolbar is hidden and this becomes the window's only chrome + drag
    // handle. It floats out of flow, so #app gets a matching top padding to
    // keep the content view from sitting underneath it.
    // Height is 40px (not the full-toolbar's 36px #tauri-wc row): #fhTabs
    // (the View-Selector, surfaced into this strip by philogg.html's
    // html.pip-mode #fhTabs rule) is a fixed 28px-tall control, and 40px
    // gives it 6px of clearance above and below instead of sitting flush
    // against the strip's edges. See that rule's `top` for the matching
    // vertical centering math.
    "#tauri-pip { display: none; position: fixed; top: 0; left: 0; right: 0; height: 40px; z-index: 100;",
    "  align-items: center; justify-content: flex-end; gap: 2px; padding: 0 4px;",
    "  background: var(--bg-panel); border-bottom: 1px solid var(--border); }",
    "html.pip-mode #tauri-pip { display: flex; }",
    "html.pip-mode #app { padding-top: 40px; }",
    "#tauri-pip button {",
    "  width: 26px; height: 26px; padding: 0; border: 0; border-radius: 6px;",
    "  display: flex; align-items: center; justify-content: center;",
    "  background: transparent; color: var(--text-secondary); cursor: pointer;",
    "}",
    "#tauri-pip button:hover { background: var(--bg-elevated-2); color: var(--accent); }",
    "#tauri-pip button[data-act=\"minimize\"]:hover { background: var(--level-error); color: #fff; }",
    "[data-tauri-drag-region] { cursor: default; }",
  ].join("\n");

  var CONTROLS =
    '<button type="button" data-act="pip" title="Picture-in-picture">' +
    '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" aria-hidden="true"><path d="M7 3 3 7M7 3H5.2M7 3V4.8M3 7h1.8M3 7v-1.8"/></svg>' +
    "</button>" +
    '<button type="button" data-act="minimize" title="Minimize">' +
    '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><rect x="0" y="4.5" width="10" height="1" fill="currentColor"/></svg>' +
    "</button>" +
    '<button type="button" data-act="maximize" title="Maximize / Restore">' +
    '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" aria-hidden="true"><rect x="0.5" y="0.5" width="9" height="9"/></svg>' +
    "</button>" +
    '<button type="button" data-act="close" title="Close">' +
    '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M0.5 0.5l9 9M9.5 0.5l-9 9"/></svg>' +
    "</button>";

  // The picture-in-picture strip's own controls. Its X is NOT a close — it
  // ends PiP and minimizes the (full) window, the inverse of the `<->` that
  // entered PiP from the full window's toolbar. See commands.rs's pip_exit /
  // pip_minimize.
  var PIP_CONTROLS =
    '<button type="button" data-act="expand" title="Back to full window">' +
    '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" aria-hidden="true"><path d="M3 3 7 7M3 3h1.8M3 3v1.8M7 7H5.2M7 7V5.2"/></svg>' +
    "</button>" +
    '<button type="button" data-act="minimize" title="Minimize">' +
    '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M0.5 0.5l9 9M9.5 0.5l-9 9"/></svg>' +
    "</button>";

  // Tauri's drag handling fires only when the clicked element *itself*
  // carries the attribute — it is not inherited by children — so it has to
  // be stamped on each non-interactive
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

  // Tauri's own drag script turns a double-click on a data-tauri-drag-region
  // into `internal_toggle_maximize` (see tauri's src/window/scripts/drag.js).
  // The PiP strip should double-click back into the full window's WINDOWED
  // state instead (never maximize) — so intercept the second mousedown
  // (detail === 2), which fires on this element before Tauri's document-level
  // listener, and route it to `action`. The full-mode toolbar deliberately
  // keeps Tauri's native behavior (drag + double-click-to-maximize), which is
  // exactly what the person wants F11/double-click to share with the maximize
  // button.
  function interceptDragDoubleClick(el, action) {
    el.addEventListener("mousedown", function (event) {
      if (event.button !== 0) return;
      if (event.detail !== 2) return;
      if (event.target.closest(NO_DRAG)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      action();
    });
  }

  function setUpChrome() {
    var style = document.createElement("style");
    style.id = "tauri-frameless";
    style.textContent = CSS;
    document.head.appendChild(style);

    var toolbar = document.getElementById("toolbar");
    if (!toolbar) return; // not philogg.html — nothing to dress
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
          else if (btn.dataset.act === "pip") invoke("pip_enter");
          else invoke("window_close");
        });
        right.appendChild(wc);
      }
    }

    // The PiP strip is added on every platform: PiP hides #toolbar, so the
    // native traffic lights (macOS) aren't enough to offer the two PiP
    // controls. markDragRegion makes the strip the mini window's drag handle.
    var pipBar = document.createElement("div");
    pipBar.id = "tauri-pip";
    pipBar.innerHTML = PIP_CONTROLS;
    pipBar.addEventListener("click", function (event) {
      var btn = event.target.closest("button[data-act]");
      if (!btn) return;
      if (btn.dataset.act === "expand") invoke("pip_exit");
      else invoke("pip_minimize");
    });
    // Double-click on an empty spot of the strip = expand back to the full
    // window's windowed state (interceptDragDoubleClick suppresses Tauri's
    // default maximize-on-double-click; see its comment).
    interceptDragDoubleClick(pipBar, function () {
      invoke("pip_exit");
    });
    document.body.appendChild(pipBar);
    markDragRegion(pipBar);
  }

  // FEATURE_BACKLOG.md #66: F11 no longer toggles plain OS maximize here.
  // It now toggles philogg.html's Focus Mode, which is owned by the page so
  // the shortcut stays rebindable in its Shortcut Manager. The page handles
  // the key itself (its keydown handler, gated on window.philogg) and calls
  // window.philogg.setFullscreen() to enter/leave real OS fullscreen — so
  // there is deliberately no key listener injected here any more. The window
  // controls' maximize button (window_toggle_maximize) is unchanged.

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

  // The native window's background shows wherever the webview hasn't
  // painted yet — most visibly in the strip a resize uncovers (the mini
  // window's included) — so it follows the page's theme instead of staying
  // the dark default. Persisted under a wrapper-owned key so the next launch
  // creates the window in the right color from the start (windows.rs's
  // window_background). Themes switch via <html data-theme>, custom ones and
  // accents via inline style on <html>, hence the observer on both.
  function setUpWindowBackground() {
    var KEY = "philogg-desktop-window-bg";
    var last = null;
    function sync() {
      var m = /(\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(document.body).backgroundColor);
      if (!m) return;
      var rgb = [+m[1], +m[2], +m[3]];
      var hex = "#" + rgb.map(function (v) { return (v < 16 ? "0" : "") + v.toString(16); }).join("");
      if (hex === last) return;
      last = hex;
      try {
        localStorage.setItem(KEY, hex);
      } catch (err) {}
      invoke("set_window_background", { rgb: rgb }).catch(function () {});
    }
    new MutationObserver(sync).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "style"],
    });
    sync();
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
    setUpWindowBackground();
    setUpSettingsMirror();
    // Tells the wrapper the page is up, so a cold-launch .zip/folder open
    // waiting in pending_local_load can be handed over (windows.rs's
    // open_local). Deliberately two nested frames after DOMContentLoaded
    // rather than on the event itself — the point is that the page has
    // actually been painted, which DOMContentLoaded alone does not
    // guarantee.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        invoke("app_ready").catch(function () {});
      });
    });
  });
})();
