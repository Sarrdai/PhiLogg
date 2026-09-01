//! The system tray icon and its menu.
//!
//! Always created, not just once "close to tray" first hides the window
//! (`FEATURE_BACKLOG.md` #33) — with no application menu anywhere, the tray
//! is the one reachable place for the config-folder and cache actions, which
//! don't depend on that setting at all.
use std::sync::atomic::Ordering;

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

use crate::state::AppState;
use crate::windows;

const SIZE: u32 = 16;
const ACCENT: [u8; 3] = [0x4f, 0xc7, 0xc3];

/// The same minimal teal dot `desktop/main.js` draws as an inline SVG data
/// URL — rasterized here because Tauri's tray takes pixels, not markup. Kept
/// out of the bundler's icon pipeline either way (see `icons/generate.js`
/// for the app icon set, which is a separate, equally placeholder, thing).
fn icon() -> Image<'static> {
    let mut rgba = vec![0u8; (SIZE * SIZE * 4) as usize];
    let center = (SIZE as f32 - 1.0) / 2.0;
    let radius = SIZE as f32 * 0.44;
    for y in 0..SIZE {
        for x in 0..SIZE {
            let d = ((x as f32 - center).powi(2) + (y as f32 - center).powi(2)).sqrt();
            let alpha = (radius - d + 0.5).clamp(0.0, 1.0);
            let i = ((y * SIZE + x) * 4) as usize;
            rgba[i] = ACCENT[0];
            rgba[i + 1] = ACCENT[1];
            rgba[i + 2] = ACCENT[2];
            rgba[i + 3] = (alpha * 255.0).round() as u8;
        }
    }
    Image::new_owned(rgba, SIZE, SIZE)
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open PhiLogg", true, None::<&str>)?;
    let config = MenuItem::with_id(app, "config", "Open Config Folder", true, None::<&str>)?;
    let cache = MenuItem::with_id(app, "cache", "Clear Cache", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open,
            &PredefinedMenuItem::separator(app)?,
            &config,
            &cache,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    TrayIconBuilder::with_id("philogg")
        .icon(icon())
        .tooltip("PhiLogg")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => windows::focus_main(app),
            "config" => {
                let dir = app.state::<AppState>().settings_path.clone();
                if let Some(parent) = dir.parent() {
                    let _ = std::fs::create_dir_all(parent);
                    let _ = app.opener().open_path(parent.to_string_lossy().to_string(), None::<&str>);
                }
            }
            // The webview's own storage (philogg.html's IndexedDB session
            // cache included) isn't meant to be hand-edited, so "reachable
            // action" is all it needs — same reasoning as desktop/main.js's
            // clearStorageData + reload.
            "cache" => {
                if let Some(window) = app.get_webview_window(windows::MAIN) {
                    let _ = window.clear_all_browsing_data();
                    let _ = window.eval("location.reload()");
                }
            }
            "quit" => {
                app.state::<AppState>().is_quitting.store(true, Ordering::Relaxed);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                windows::focus_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}
