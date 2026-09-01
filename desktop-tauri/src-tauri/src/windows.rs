//! Window creation and the file-opening routes into it.
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

use crate::state::AppState;
use crate::{inject, protocol, settings};

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
        // philogg.html handles drag-and-drop itself, through ordinary HTML
        // drop events and the File objects they carry. Tauri's own drag-drop
        // handler would swallow those in favour of a native event carrying
        // OS paths — which is exactly the trade-off behind the
        // getPathForFile gap documented in inject.js: dropping files has to
        // keep working, so the native handler stays off.
        .disable_drag_drop_handler()
        .initialization_script(&script);

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
    watch_close(&window);
}

/// `FEATURE_BACKLOG.md` #51's "close to system tray" half. The setting lives
/// in `philogg.html`'s own `localStorage`; unlike `desktop/main.js` — which
/// has to `executeJavaScript()` it back out of the renderer at close time —
/// the value is already mirrored into `AppState` by the settings poll, so
/// this can decide synchronously.
fn watch_close(window: &WebviewWindow) {
    let window_ref = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
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
    });
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
