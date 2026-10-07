//! Window creation and the file-opening routes into it.
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;

use tauri::{AppHandle, DragDropEvent, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

use crate::state::AppState;
use crate::{commands, formats, inject, protocol, settings};

pub const MAIN: &str = "main";
/// The LLM assistant's chat window (`desktop/chat.html`).
pub const CHAT: &str = "chat";
/// `philogg.html`'s localStorage keys for the chat window, mirrored into
/// `settings.json` by the page's settings poll like every `philogg-*` key.
const CHAT_GEOMETRY_KEY: &str = "philogg-llm-chat-geometry";
const CHAT_ON_TOP_KEY: &str = "philogg-llm-chat-on-top";

/// The small fixed size the window takes on while in picture-in-picture. In
/// logical pixels, same as the popout's content window was; tune later.
pub const PIP_W: f64 = 420.0;
pub const PIP_H: f64 = 320.0;

/// Windows/Linux: a `.log`/`.gz`/`.zip` file association or Explorer context-menu
/// verb (see `desktop/src-tauri/windows/installer.nsi`) relaunches the app
/// with the path as a plain argv entry — a folder-watch launch the same way,
/// with a directory path instead of a file. macOS never does this — it
/// delivers a path through `RunEvent::Opened` instead, even on a cold
/// launch, and has none of the new verbs to begin with (they're
/// Windows-only).
///
/// `.log` keeps going through the existing single-URL route (`LogFile`):
/// both the file association and the new "Open in PhiLogg" verb invoke this
/// app the exact same way (`"<exe>" "%1"`), so there is nothing new to
/// distinguish. A `.zip` or a directory needs `LocalTarget` instead —
/// `loadUrlIntoTree` (`LogFile`'s route, see `open_file`) has no ZIP
/// awareness at all, that lives only in `loadDesktopLocalFiles`
/// (`philogg.html`), and there is no single-URL equivalent of a folder
/// watch to begin with.
pub enum LaunchArg {
    LogFile(PathBuf),
    LocalTarget(PathBuf),
}

pub fn classify_launch<I: IntoIterator<Item = String>>(argv: I) -> Option<LaunchArg> {
    for arg in argv.into_iter().skip(1) {
        let lower = arg.to_lowercase();
        // A gzip-compressed (rotated) log, e.g. `app.log.1.gz`, takes the
        // same single-URL route: the wrapper only serves its raw bytes, and
        // `loadUrlIntoTree` inflates them page-side (DecompressionStream).
        if lower.ends_with(".log") || lower.ends_with(".gz") {
            return Some(LaunchArg::LogFile(PathBuf::from(arg)));
        }
        if lower.ends_with(".zip") {
            return Some(LaunchArg::LocalTarget(PathBuf::from(arg)));
        }
        let path = PathBuf::from(&arg);
        if path.is_dir() {
            return Some(LaunchArg::LocalTarget(path));
        }
    }
    None
}

/// Wrapper-owned `localStorage` key (mirrored into `settings.json` like the
/// page's own `philogg-*` keys): the page's background color as `#rrggbb`,
/// written by `inject.js` whenever the theme changes.
const WINDOW_BG_KEY: &str = "philogg-desktop-window-bg";

/// The stored page background, falling back to the dark theme's `--bg-panel`
/// on a first run.
fn window_background(stored: &std::collections::BTreeMap<String, String>) -> tauri::window::Color {
    let rgb = stored
        .get(WINDOW_BG_KEY)
        .and_then(|hex| hex.strip_prefix('#'))
        .filter(|hex| hex.len() == 6)
        .and_then(|hex| u32::from_str_radix(hex, 16).ok());
    match rgb {
        Some(v) => tauri::window::Color((v >> 16) as u8, (v >> 8) as u8, v as u8, 0xff),
        None => tauri::window::Color(0x15, 0x19, 0x24, 0xff),
    }
}

pub fn create_main(app: &AppHandle, file: Option<PathBuf>) {
    let state = app.state::<AppState>();
    let query = file
        .as_deref()
        .map(|path| format!("url={}", urlencoding::encode(&state.register_local_file(path))));
    let Ok(url) = tauri::Url::parse(&protocol::app_url(query.as_deref())) else {
        return;
    };

    let stored = settings::read(&state.settings_path);
    let provided = formats::read_all(&settings::config_dir(app), settings::portable_dir().is_some());
    let script = inject::script(&stored, &state.nonce, protocol::base_url(), &provided);

    let mut builder = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::CustomProtocol(url))
        .title("PhiLogg")
        .inner_size(1400.0, 900.0)
        // The page's own background as of the last run (see
        // `window_background`), so there is no flash of another color
        // before the page paints — nor in the strip a resize uncovers.
        .background_color(window_background(&stored))
        // Tauri's native drag-drop handler is left ON, which suppresses the
        // HTML drop events philogg.html would otherwise use. That is the
        // deliberate trade: the native event is the only one carrying real
        // OS paths, and without a path a dropped file can never offer
        // "Open File Location"/"Copy Path" (no webview resolves a File back
        // to a path — see inject.js's getPathForFile). So the drop is
        // handled here and handed to the page as paths + philogg://local
        // URLs, exactly like a file-association open, which also buys those
        // files tailing for free.
        //
        // A dropped FOLDER travels in the same call, as a path. It used to
        // be a dead end — a folder watch needed a live
        // FileSystemDirectoryHandle to list and rescan, which a path can't
        // produce — but the watch is now listed from Rust (commands.rs's
        // list_folder), so a path is exactly what it wants and a dropped
        // folder starts watching like a picked one.
        //
        // The events themselves arrive as WindowEvent::DragDrop — there is
        // no builder-level hook for them — so they are picked up in
        // watch_window_events below, alongside the close handling.
        .initialization_script(&script);

    // Portable build: WebView2's own storage (including the IndexedDB
    // session cache) moves alongside settings.json into data/ next to the
    // exe, same reasoning as settings::config_dir — see desktop/README.md
    // "Portable build".
    if let Some(dir) = settings::portable_dir() {
        builder = builder.data_directory(dir.join("data").join("webview"));
    }

    // FEATURE_BACKLOG.md #31/#34: no OS frame, and rounded corners where the
    // platform provides them for an undecorated window (macOS always,
    // Windows 11 via DWM, Linux compositor-dependent) — the same
    // "except when fullscreen" behaviour falls out for free there too, since
    // a window filling the screen has no floating edge left to round.
    #[cfg(target_os = "macos")]
    {
        builder = builder
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true);
    }
    #[cfg(not(target_os = "macos"))]
    {
        builder = builder.decorations(false);
    }

    let Ok(window) = builder.build() else { return };
    #[cfg(target_os = "windows")]
    disable_alt_accelerator_keys(&window);
    watch_window_events(&window);
}

/// Windows only: WebView2 treats Alt as a browser "accelerator key" by
/// default, the same way Chrome/Edge use it to focus the menu bar. This
/// window has no menu bar (`decorations(false)` above), so releasing Alt
/// instead pops the native window's system menu in the top-left corner —
/// most visibly right after Alt+Enter's "Filter for this ___" extraction
/// (philogg.html's own `preventDefault()` on that chord only stops the
/// page from reacting, not WebView2's accelerator handling). Turning this
/// setting off leaves Alt+Enter etc. to reach philogg.html as plain
/// keyboard events, same as every other key.
#[cfg(target_os = "windows")]
fn disable_alt_accelerator_keys(window: &WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
    use windows::core::Interface;

    let _ = window.with_webview(|webview| {
        let settings3 = (|| unsafe {
            let core = webview.controller().CoreWebView2()?;
            core.Settings()?.cast::<ICoreWebView2Settings3>()
        })();
        if let Ok(settings3) = settings3 {
            let _ = unsafe { settings3.SetAreBrowserAcceleratorKeysEnabled(false) };
        }
    });
}

/// The two OS-level events this window has to answer for itself: the close
/// request (`FEATURE_BACKLOG.md` #51's "close to system tray" half) and the
/// native drag-drop.
///
/// Close: the setting lives in `philogg.html`'s own `localStorage`; unlike
/// `desktop/main.js` — which has to `executeJavaScript()` it back out of the
/// renderer at close time — the value is already mirrored into `AppState` by
/// the settings poll, so this can decide synchronously.
fn watch_window_events(window: &WebviewWindow) {
    let window_ref = window.clone();
    // The native drag-drop handler fires for every drag the webview sees,
    // including an in-app one (e.g. reparenting a filter tree row via HTML5
    // drag) — Tauri can't tell those apart from an OS file drag at the
    // `Over`/`Leave` stage, only `Enter` carries `paths`. So `Enter` decides
    // whether this drag is a real file drop, and that verdict is remembered
    // here for the `Over`/`Leave`/`Drop` events that follow it.
    let is_file_drag = std::cell::Cell::new(false);
    window.on_window_event(move |event| match event {
        WindowEvent::CloseRequested { api, .. } => {
            let app = window_ref.app_handle();
            let state = app.state::<AppState>();
            if state.is_quitting.load(Ordering::Relaxed) {
                return;
            }
            if state.close_to_tray.load(Ordering::Relaxed) {
                api.prevent_close();
                let _ = window_ref.hide();
            } else {
                state.is_quitting.store(true, Ordering::Relaxed);
                app.exit(0);
            }
        }
        WindowEvent::DragDrop(drag) => handle_drag_drop(&window_ref, drag, &is_file_drag),
        _ => {}
    });
}

/// Enter picture-in-picture: shrink the one real window to a small,
/// always-on-top, content-only view. Only existing-window operations here —
/// nothing is ever constructed, so there is no second copy of the app state
/// to fall out of sync. Remembers the full window's windowed position + size
/// and whether it was maximized (for `exit_pip`), and restores the mini
/// window's own remembered position + size.
pub fn enter_pip(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN) else {
        return;
    };
    let state = app.state::<AppState>();
    if state.pip_active.load(Ordering::Relaxed) {
        return;
    }

    // Leave maximize first so the bounds captured below are the real windowed
    // ones (the OS restores the pre-maximize windowed rect on its own).
    let was_maximized = window.is_maximized().unwrap_or(false);
    if was_maximized {
        let _ = window.unmaximize();
    }

    // Remember the full window's windowed geometry (position + size).
    if let (Ok(size), Ok(pos)) = (window.inner_size(), window.outer_position()) {
        let mut prev = state.full_prev.lock().expect("full_prev poisoned");
        *prev = Some((pos.x as f64, pos.y as f64, size.width as f64, size.height as f64));
    }
    state.full_was_maximized.store(was_maximized, Ordering::Relaxed);

    // The mini window returns to where/how big it last was, defaulting to
    // PIP_W × PIP_H at the current top-left on first entry.
    let mini = state
        .pip_prev
        .lock()
        .expect("pip_prev poisoned")
        .clone()
        .unwrap_or_else(|| {
            let (x, y) = window
                .outer_position()
                .map(|p| (p.x as f64, p.y as f64))
                .unwrap_or((0.0, 0.0));
            (x, y, PIP_W, PIP_H)
        });

    let _ = window.set_always_on_top(true);
    let _ = window.set_position(tauri::LogicalPosition::new(mini.0, mini.1));
    let _ = window.set_size(tauri::LogicalSize::new(mini.2, mini.3));
    state.pip_active.store(true, Ordering::Relaxed);
    // Rust owns geometry; the page owns the CSS class that hides the chrome
    // (see philogg.html's `philoggSetPip`).
    let _ = window.eval("window.philoggSetPip && window.philoggSetPip(true)");
}

/// Exit picture-in-picture: restore the full window's remembered position +
/// size AND its previous windowed/maximized state, and drop the chrome
/// hiding. Exits are user-driven — the mini window's `<->` button, a
/// "jump to another view" (`jumpAfterPip`), or the mini window's X button
/// (`pip_minimize`, which follows this with a minimize) — never detected from
/// a window event, so there is no restore to distinguish. Remembers the mini
/// window's own geometry for the next enter.
pub fn exit_pip(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN) else {
        return;
    };
    let state = app.state::<AppState>();
    if !state.pip_active.load(Ordering::Relaxed) {
        return;
    }

    // Remember where/how big the mini window was, for the next enter.
    if let (Ok(size), Ok(pos)) = (window.inner_size(), window.outer_position()) {
        let mut prev = state.pip_prev.lock().expect("pip_prev poisoned");
        *prev = Some((pos.x as f64, pos.y as f64, size.width as f64, size.height as f64));
    }

    let _ = window.set_always_on_top(false);
    // Always restore the windowed bounds first, even when re-maximizing right
    // after: resizing a normal (non-maximized) window sets the OS's "restore
    // size", so a later unmaximize/drag-out-of-maximize lands on the full
    // windowed size — never the mini size (which is what enter_pip's own
    // set_size would otherwise have left as the restore size).
    let full = state.full_prev.lock().expect("full_prev poisoned").clone();
    if let Some((x, y, w, h)) = full {
        let _ = window.set_position(tauri::LogicalPosition::new(x, y));
        let _ = window.set_size(tauri::LogicalSize::new(w, h));
    }
    if state.full_was_maximized.load(Ordering::Relaxed) {
        let _ = window.maximize();
    }
    state.pip_active.store(false, Ordering::Relaxed);
    let _ = window.eval("window.philoggSetPip && window.philoggSetPip(false)");
}

/// Drives `philogg.html`'s own drop overlay, which the page can no longer
/// show for itself: with the native handler on, it never sees a dragenter.
/// Goes through the page's named `philoggDropOverlay` hook rather than
/// touching `#dropOverlay` directly, so this stays a contract instead of a
/// dependency on the page's internals.
fn show_drop_overlay(window: &WebviewWindow, show: bool) {
    let _ = window.eval(if show {
        "window.philoggDropOverlay && window.philoggDropOverlay(true)"
    } else {
        "window.philoggDropOverlay && window.philoggDropOverlay(false)"
    });
}

/// A native drop is the only kind that carries real OS paths, which is the
/// whole reason the native handler is on (see `create_main`). Splits a
/// drop's paths into files this wrapper serves (registered exactly like a
/// file-association open, so they arrive with a path *and* a
/// `philogg://local/…` URL) and folders, whose paths the page turns into
/// watched folders through `list_folder`.
fn register_dropped(state: &AppState, paths: &[PathBuf]) -> (Vec<commands::LocalFile>, Vec<String>) {
    let mut files = Vec::new();
    let mut folders = Vec::new();
    for path in paths {
        if path.is_dir() {
            folders.push(path.to_string_lossy().to_string());
        } else {
            files.push(commands::LocalFile::register(state, path));
        }
    }
    (files, folders)
}

fn handle_drag_drop(window: &WebviewWindow, event: &DragDropEvent, is_file_drag: &std::cell::Cell<bool>) {
    match event {
        DragDropEvent::Enter { paths, .. } => {
            is_file_drag.set(!paths.is_empty());
            if is_file_drag.get() {
                show_drop_overlay(window, true);
            }
        }
        DragDropEvent::Over { .. } => {
            if is_file_drag.get() {
                show_drop_overlay(window, true);
            }
        }
        DragDropEvent::Leave => {
            if is_file_drag.get() {
                show_drop_overlay(window, false);
            }
            is_file_drag.set(false);
        }
        DragDropEvent::Drop { paths, .. } => {
            let was_file_drag = is_file_drag.get();
            is_file_drag.set(false);
            if !was_file_drag {
                return;
            }
            show_drop_overlay(window, false);
            let app = window.app_handle();
            let (files, folders) = register_dropped(&app.state::<AppState>(), paths);
            if files.is_empty() && folders.is_empty() {
                return;
            }
            let payload = serde_json::json!({ "files": files, "folders": folders });
            let js = format!(
                "window.philoggLoadLocalFiles && window.philoggLoadLocalFiles({})",
                serde_json::to_string(&payload).unwrap_or_else(|_| "{}".to_string())
            );
            let _ = window.eval(&js);
        }
        _ => {}
    }
}

pub fn focus_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN) {
        if window.is_minimized().unwrap_or(false) {
            let _ = window.unminimize();
        }
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Routes a file open (a second file-association launch, or a later macOS
/// open-file) into the already-running window instead of spawning another
/// one — only the very first file of a run should ever create a window.
/// `philogg.html` exposes `window.philoggLoadUrl` for exactly this, so the
/// file simply joins the existing tree the way a manual "Open…" would.
pub fn open_file(app: &AppHandle, path: &Path) {
    let Some(window) = app.get_webview_window(MAIN) else {
        create_main(app, Some(path.to_path_buf()));
        return;
    };
    let url = app.state::<AppState>().register_local_file(path);
    let js = format!(
        "window.philoggLoadUrl && window.philoggLoadUrl({})",
        serde_json::to_string(&url).unwrap_or_else(|_| "\"\"".to_string())
    );
    let _ = window.eval(&js);
    focus_main(app);
}

fn eval_load_local(window: &WebviewWindow, payload: &serde_json::Value) {
    let js = format!(
        "window.philoggLoadLocalFiles && window.philoggLoadLocalFiles({})",
        serde_json::to_string(payload).unwrap_or_else(|_| "{}".to_string())
    );
    let _ = window.eval(&js);
}

/// The Explorer-context-menu route for a `.zip` file or a watched folder
/// (`LaunchArg::LocalTarget`, see `classify_launch`) — the same
/// `philoggLoadLocalFiles` call `register_dropped` + `handle_drag_drop`
/// already make for a native drop, reused here for a launch instead of a
/// drag, so a zip opens (via `loadDesktopLocalFiles`'s existing zip
/// special-case) and a folder starts a watch exactly like a dropped one
/// would.
///
/// An already-running window gets the eval immediately, mirroring
/// `open_file`. A cold launch (no window yet) has no page loaded to eval
/// into, so the window is created plain (`create_main(app, None)`, same as
/// a launch with nothing to open) and the payload waits in
/// `AppState.pending_local_load` until `flush_pending_local` runs it —
/// called from `commands::app_ready`, the signal the injected script sends
/// once the page has painted (i.e. its script is up and can take the eval).
pub fn open_local(app: &AppHandle, files: Vec<PathBuf>, folders: Vec<PathBuf>) {
    let state = app.state::<AppState>();
    let local_files: Vec<commands::LocalFile> =
        files.iter().map(|p| commands::LocalFile::register(&state, p)).collect();
    let folder_strs: Vec<String> = folders.iter().map(|p| p.to_string_lossy().to_string()).collect();
    let payload = serde_json::json!({ "files": local_files, "folders": folder_strs });

    if let Some(window) = app.get_webview_window(MAIN) {
        eval_load_local(&window, &payload);
        focus_main(app);
    } else {
        *state.pending_local_load.lock().expect("pending_local_load poisoned") = Some(payload);
        create_main(app, None);
    }
}

/// See `open_local`'s doc comment: runs a payload that had to wait for the
/// window to exist. A no-op when there is nothing pending (the common case —
/// every launch that isn't a cold `.zip`/folder Explorer-verb open).
pub fn flush_pending_local(app: &AppHandle) {
    let state = app.state::<AppState>();
    let pending = state
        .pending_local_load
        .lock()
        .expect("pending_local_load poisoned")
        .take();
    let Some(payload) = pending else { return };
    let Some(window) = app.get_webview_window(MAIN) else { return };
    eval_load_local(&window, &payload);
}

/// Shows the LLM assistant's chat window, creating it on first use. It is an
/// *owned* window (`parent` = the main window): it floats above PhiLogg and
/// minimizes with it, but doesn't cover other programs — unless the person
/// turns on "always on top" (`set_chat_on_top`). Size and position come back
/// from `settings.json` (`philogg-llm-chat-geometry`, written by
/// `hide_chat`). The page is a thin view; nothing here ever copies app
/// state into it (docs/llm-assistant.md → "Chat view").
pub fn show_chat(app: &AppHandle) {
    if let Some(chat) = app.get_webview_window(CHAT) {
        let _ = chat.show();
        let _ = chat.unminimize();
        let _ = chat.set_focus();
        return;
    }
    let Some(main) = app.get_webview_window(MAIN) else { return };
    let state = app.state::<AppState>();
    let stored = settings::read(&state.settings_path);
    let Ok(url) = tauri::Url::parse(&protocol::chat_url()) else { return };
    let geometry = stored
        .get(CHAT_GEOMETRY_KEY)
        .and_then(|g| serde_json::from_str::<serde_json::Value>(g).ok())
        .and_then(|g| Some((g["x"].as_f64()?, g["y"].as_f64()?, g["w"].as_f64()?, g["h"].as_f64()?)));
    let (w, h) = geometry.map(|g| (g.2, g.3)).unwrap_or((420.0, 640.0));
    let mut builder = WebviewWindowBuilder::new(app, CHAT, WebviewUrl::CustomProtocol(url))
        .title("PhiLogg Assistant")
        .inner_size(w.max(300.0), h.max(260.0))
        .min_inner_size(300.0, 260.0)
        .background_color(tauri::window::Color(0x15, 0x19, 0x24, 0xff))
        .always_on_top(stored.get(CHAT_ON_TOP_KEY).map(|v| v == "1").unwrap_or(false));
    if let Some((x, y, _, _)) = geometry {
        builder = builder.position(x, y);
    }
    // Frameless like the main window: chat.html draws its own title bar
    // (drag region + the same window controls as inject.js's #tauri-wc).
    // macOS keeps the native traffic lights over an overlay title bar.
    #[cfg(target_os = "macos")]
    {
        builder = builder.title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true);
    }
    #[cfg(not(target_os = "macos"))]
    {
        builder = builder.decorations(false);
    }
    // Same WebView2 data directory as the main window: two environments with
    // different options in one process refuse to start.
    if let Some(dir) = settings::portable_dir() {
        builder = builder.data_directory(dir.join("data").join("webview"));
    }
    let Ok(builder) = builder.parent(&main) else { return };
    let Ok(chat) = builder.build() else { return };
    let chat_ref = chat.clone();
    chat.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            let app = chat_ref.app_handle();
            if app.state::<AppState>().is_quitting.load(Ordering::Relaxed) {
                return;
            }
            // The X only hides — the toolbar button brings it back, and the
            // agent loop (main window) never notices either way.
            api.prevent_close();
            hide_chat(app);
        }
    });
}

/// Hides the chat window, remembering its geometry in the main page's
/// localStorage (and so in `settings.json`).
pub fn hide_chat(app: &AppHandle) {
    let Some(chat) = app.get_webview_window(CHAT) else { return };
    let scale = chat.scale_factor().unwrap_or(1.0);
    if let (Ok(size), Ok(pos)) = (chat.inner_size(), chat.outer_position()) {
        let geometry = serde_json::json!({
            "x": pos.x as f64 / scale, "y": pos.y as f64 / scale,
            "w": size.width as f64 / scale, "h": size.height as f64 / scale,
        })
        .to_string();
        set_main_local_storage(app, CHAT_GEOMETRY_KEY, &geometry);
    }
    let _ = chat.hide();
}

/// "Always on top" — global, over every program (`set_always_on_top`).
pub fn set_chat_on_top(app: &AppHandle, on: bool) {
    if let Some(chat) = app.get_webview_window(CHAT) {
        let _ = chat.set_always_on_top(on);
    }
    set_main_local_storage(app, CHAT_ON_TOP_KEY, if on { "1" } else { "0" });
}

fn set_main_local_storage(app: &AppHandle, key: &str, value: &str) {
    if let Some(main) = app.get_webview_window(MAIN) {
        let js = format!(
            "try {{ localStorage.setItem({}, {}); }} catch (e) {{}}",
            serde_json::to_string(key).unwrap_or_default(),
            serde_json::to_string(value).unwrap_or_default()
        );
        let _ = main.eval(&js);
    }
}

#[cfg(test)]
mod tests {
    use super::{window_background, WINDOW_BG_KEY};
    use std::collections::BTreeMap;

    fn bg(value: Option<&str>) -> (u8, u8, u8, u8) {
        let mut stored = BTreeMap::new();
        if let Some(v) = value {
            stored.insert(WINDOW_BG_KEY.to_string(), v.to_string());
        }
        let c = window_background(&stored);
        (c.0, c.1, c.2, c.3)
    }

    #[test]
    fn window_background_from_stored_hex() {
        assert_eq!(bg(Some("#f5f6f8")), (0xf5, 0xf6, 0xf8, 0xff));
        assert_eq!(bg(None), (0x15, 0x19, 0x24, 0xff));
        assert_eq!(bg(Some("f5f6f8")), (0x15, 0x19, 0x24, 0xff));
        assert_eq!(bg(Some("#fff")), (0x15, 0x19, 0x24, 0xff));
        assert_eq!(bg(Some("#zzzzzz")), (0x15, 0x19, 0x24, 0xff));
    }
}
