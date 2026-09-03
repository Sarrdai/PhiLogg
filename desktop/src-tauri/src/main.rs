// PhiLogg desktop wrapper (Tauri v2).
//
// The optional desktop shell around `philogg.html`: `.log` file
// associations, CLI-argument opening, a frameless window, a tray and a
// splash screen, built on the OS webview (WebView2 / WKWebView / WebKitGTK)
// plus this Rust backend. The per-module comments call out each place the
// platforms genuinely differ.
//
// The one rule everything here obeys: `philogg.html` is never modified. It
// is loaded, unmodified, through a custom `philogg://` scheme and handed a
// local file through its own `?url=` deep-link mechanism (see PROJECT.md
// "Deep-link loading").
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod fonts;
mod inject;
mod protocol;
mod settings;
mod state;
mod tray;
mod windows;

use std::path::PathBuf;
use std::sync::atomic::Ordering;

use tauri::Manager;

use state::{AppState, CLOSE_TO_TRAY_KEY};

/// `philogg.html` is packaged as a bundle resource (`tauri.conf.json` ->
/// `bundle.resources`), which only exists in a built app — a `tauri dev` run
/// reads the working copy next to the crate instead, so editing
/// `philogg.html` and restarting is enough during development.
fn html_path(app: &tauri::AppHandle) -> PathBuf {
    if let Ok(dir) = app.path().resource_dir() {
        let packaged = dir.join("philogg.html");
        if packaged.is_file() {
            return packaged;
        }
    }
    // The portable build has no installer/resource dir at all — it ships
    // philogg.html sitting right next to the executable instead.
    if let Some(dir) = settings::portable_dir() {
        let sibling = dir.join("philogg.html");
        if sibling.is_file() {
            return sibling;
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("philogg.html")
}

fn main() {
    tauri::Builder::default()
        // A second file-association launch arrives here instead of as a new
        // process, and is routed into the existing window rather than
        // opening another one — the same fix `desktop/main.js` applies in
        // its own "second-instance" handler.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            match windows::file_arg(argv) {
                Some(path) => windows::open_file(app, &path),
                None => windows::focus_main(app),
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .register_asynchronous_uri_scheme_protocol(protocol::SCHEME, protocol::handle)
        .invoke_handler(tauri::generate_handler![
            commands::save_settings,
            commands::reveal_path,
            commands::reveal_local_url,
            commands::pick_files,
            commands::pick_folder,
            commands::list_folder,
            commands::path_for_local_url,
            commands::list_system_fonts,
            commands::toggle_fullscreen,
            commands::window_minimize,
            commands::window_toggle_maximize,
            commands::window_close,
            commands::app_ready,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let config_dir = settings::config_dir(&handle);
            let state = AppState::new(html_path(&handle), config_dir.join("settings.json"));
            // Seeded from disk so the very first close already honours the
            // stored preference, before the page's own settings poll has run
            // even once. Default on, matching philogg.html's own default.
            let stored = settings::read(&state.settings_path);
            state.close_to_tray.store(
                stored.get(CLOSE_TO_TRAY_KEY).map(|v| v != "0").unwrap_or(true),
                Ordering::Relaxed,
            );
            app.manage(state);

            tray::create(&handle)?;
            windows::create_splash(&handle);
            windows::create_main(&handle, windows::file_arg(std::env::args()));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to start PhiLogg")
        .run(|app, event| match event {
            // macOS delivers file-association opens as an event, never as
            // argv — including on a cold launch, which is why this can also
            // be the first file of a run.
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Opened { urls } => {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        windows::open_file(app, &path);
                    }
                }
            }
            // macOS apps stay alive with no windows open; every other
            // platform quits, same as desktop/main.js's "window-all-closed".
            #[cfg(target_os = "macos")]
            tauri::RunEvent::ExitRequested { api, .. } => {
                if !app.state::<AppState>().is_quitting.load(Ordering::Relaxed) {
                    api.prevent_exit();
                }
            }
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => {
                if app.get_webview_window(windows::MAIN).is_some() {
                    windows::focus_main(app);
                } else {
                    windows::create_main(app, None);
                }
            }
            _ => {
                let _ = app;
            }
        });
}
