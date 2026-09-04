//! Window creation and the file-opening routes into it.
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;

use tauri::{AppHandle, DragDropEvent, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

use crate::state::AppState;
use crate::{commands, inject, protocol, settings};

pub const MAIN: &str = "main";
pub const SPLASH: &str = "splash";

/// Windows/Linux: a `.log` file association relaunches the app with the path
/// as a plain argv entry. macOS never does this — it delivers the path
/// through `RunEvent::Opened` instead, even on a cold launch.
pub fn file_arg<I: IntoIterator<Item = String>>(argv: I) -> Option<PathBuf> {
    argv.into_iter()
        .skip(1)
        .find(|a| a.to_lowercase().ends_with(".log"))
        .map(PathBuf::from)
}

/// `FEATURE_BACKLOG.md` #51: shown immediately so the seconds before
/// `philogg.html` paints aren't a blank screen. Deliberately gets no
/// initialization script — that script ends by reporting "painted", which
/// would have the splash dismiss itself.
pub fn create_splash(app: &AppHandle) {
    let Ok(url) = tauri::Url::parse(&protocol::splash_url()) else {
        return;
    };
    let _ = WebviewWindowBuilder::new(app, SPLASH, WebviewUrl::CustomProtocol(url))
        .title("PhiLogg")
        .inner_size(320.0, 180.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .center()
        .build();
}

pub fn dismiss_splash(app: &AppHandle) {
    if let Some(splash) = app.get_webview_window(SPLASH) {
        let _ = splash.close();
    }
    if let Some(main) = app.get_webview_window(MAIN) {
        let _ = main.show();
        let _ = main.set_focus();
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

    let script = inject::script(
        &settings::read(&state.settings_path),
        &state.nonce,
        protocol::base_url(),
    );

    let mut builder = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::CustomProtocol(url))
        .title("PhiLogg")
        .inner_size(1400.0, 900.0)
        // Shown by dismiss_splash() once the page reports a first paint, so
        // the splash is never replaced by a blank window.
        .visible(false)
        // Matches #toolbar/--bg-panel's dark-theme default, so there is no
        // white flash before the page's own background paints.
        .background_color(tauri::window::Color(0x15, 0x19, 0x24, 0xff))
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
