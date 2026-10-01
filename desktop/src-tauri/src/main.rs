// PhiLogg desktop wrapper (Tauri v2).
//
// The optional desktop shell around `philogg.html`: `.log` file
// associations, CLI-argument opening, a frameless window and a tray,
// built on the OS webview (WebView2 / WKWebView / WebKitGTK)
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
mod pathguard;
mod protocol;
mod settings;
mod state;
mod tray;
mod vs_integration;
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
    resource_path(app, "philogg.html", &["..", ".."])
}

/// The LLM assistant's chat view (`desktop/chat.html`), packaged next to
/// `philogg.html` and found the same three ways.
fn chat_html_path(app: &tauri::AppHandle) -> PathBuf {
    resource_path(app, "chat.html", &[".."])
}

fn resource_path(app: &tauri::AppHandle, name: &str, dev_dir: &[&str]) -> PathBuf {
    if let Ok(dir) = app.path().resource_dir() {
        let packaged = dir.join(name);
        if packaged.is_file() {
            return packaged;
        }
    }
    // The portable build has no installer/resource dir at all — it ships
    // philogg.html sitting right next to the executable instead.
    if let Some(dir) = settings::portable_dir() {
        let sibling = dir.join(name);
        if sibling.is_file() {
            return sibling;
        }
    }
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    for part in dev_dir {
        path.push(part);
    }
    path.join(name)
}

fn main() {
    tauri::Builder::default()
        // A second file-association launch arrives here instead of as a new
        // process, and is routed into the existing window rather than
        // opening another one — the same fix `desktop/main.js` applies in
        // its own "second-instance" handler.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            match windows::classify_launch(argv) {
                Some(windows::LaunchArg::LogFile(path)) => windows::open_file(app, &path),
                Some(windows::LaunchArg::LocalTarget(path)) if path.is_dir() => {
                    windows::open_local(app, vec![], vec![path])
                }
                Some(windows::LaunchArg::LocalTarget(path)) => windows::open_local(app, vec![path], vec![]),
                None => windows::focus_main(app),
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .register_asynchronous_uri_scheme_protocol(protocol::SCHEME, protocol::handle)
        .invoke_handler(tauri::generate_handler![
            commands::save_settings,
            commands::set_window_background,
            commands::reveal_path,
            commands::reveal_local_url,
            commands::open_extracted_entry,
            commands::pick_files,
            commands::pick_folder,
            commands::list_folder,
            commands::list_subfolders,
            commands::path_for_local_url,
            commands::parse_log_file,
            commands::path_exists,
            commands::open_path,
            commands::open_local_path,
            commands::list_system_fonts,
            commands::vs_list_instances,
            commands::vs_open_file,
            commands::window_minimize,
            commands::window_toggle_maximize,
            commands::window_set_fullscreen,
            commands::window_close,
            commands::app_ready,
            commands::pip_exit,
            commands::pip_enter,
            commands::pip_minimize,
            commands::llm_models,
            commands::llm_model_details,
            commands::llm_chat,
            commands::llm_cancel,
            commands::llm_chat_window,
            commands::llm_view_to_main,
            commands::llm_main_to_view,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let config_dir = settings::config_dir(&handle);
            let mut state = AppState::new(html_path(&handle), config_dir.join("settings.json"));
            state.chat_html_path = chat_html_path(&handle);
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
            match windows::classify_launch(std::env::args()) {
                Some(windows::LaunchArg::LogFile(path)) => windows::create_main(&handle, Some(path)),
                Some(windows::LaunchArg::LocalTarget(path)) if path.is_dir() => {
                    windows::open_local(&handle, vec![], vec![path])
                }
                Some(windows::LaunchArg::LocalTarget(path)) => windows::open_local(&handle, vec![path], vec![]),
                None => windows::create_main(&handle, None),
            }
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
