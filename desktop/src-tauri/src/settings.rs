//! `FEATURE_BACKLOG.md` #33: mirror `philogg.html`'s `philogg-*`
//! `localStorage` keys into a plain, human-editable `settings.json` in a
//! well-known config directory, without touching `philogg.html` itself.
//!
//! Two halves, with different timing constraints. The *read* half must land
//! before `philogg.html`'s own top-level script runs (many `philogg-*` keys
//! are read once, synchronously, at script parse). The values are already
//! known to the Rust side at window-creation time, so they are baked
//! straight into the window's initialization script as a JSON literal — no
//! IPC, no preload, and nothing that can race the page. The *write* half
//! polls instead (see `inject.rs`), since writes only ever happen later, in
//! response to a user action.
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc::Sender;

/// Windows-only portable mode: a `philogg-portable` marker file dropped next
/// to the executable (see `desktop/README.md` "Portable build") means "keep
/// everything on this drive" — `settings.json` and the webview's own storage
/// both move from the OS's per-user directories into a `data/` folder beside
/// the exe, so nothing is written to the host machine at all.
#[cfg(target_os = "windows")]
pub fn portable_dir() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?.to_path_buf();
    dir.join("philogg-portable").is_file().then_some(dir)
}

#[cfg(not(target_os = "windows"))]
pub fn portable_dir() -> Option<PathBuf> {
    None
}

/// The config directory this wrapper owns. Deliberately **not** the
/// identifier-derived `app_config_dir()` (`com.kleinphilipp.philogg`)
/// but a plain, readable name, so `settings.json` is findable by hand.
/// See `desktop/README.md`.
pub fn config_dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> PathBuf {
    if let Some(dir) = portable_dir() {
        return dir.join("data");
    }
    use tauri::Manager;
    let base = app
        .path()
        .config_dir()
        .unwrap_or_else(|_| std::env::temp_dir());
    base.join("PhiLogg")
}

/// Missing file (first run) or corrupt/hand-edited JSON both start clean
/// rather than crash — `philogg.html` then falls back to its own defaults,
/// exactly as on a first run.
pub fn read(path: &Path) -> BTreeMap<String, String> {
    let Ok(text) = std::fs::read_to_string(path) else {
        return BTreeMap::new();
    };
    serde_json::from_str::<BTreeMap<String, serde_json::Value>>(&text)
        .map(|parsed| {
            parsed
                .into_iter()
                .filter_map(|(k, v)| v.as_str().map(|s| (k, s.to_string())))
                .collect()
        })
        .unwrap_or_default()
}

/// Written to a sibling temp file and renamed over the real one, so a
/// process exit mid-write (the writer thread below is not joined on quit)
/// leaves the previous `settings.json` intact instead of a truncated one.
pub fn write(path: &Path, values: &BTreeMap<String, String>) {
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let Ok(json) = serde_json::to_string_pretty(values) else {
        return;
    };
    let tmp = path.with_extension("json.tmp");
    if std::fs::write(&tmp, json).is_ok() {
        let _ = std::fs::rename(&tmp, path);
    }
}

/// The one thread that ever writes `settings.json`. A `#[tauri::command]`
/// without `async` runs on the main (event-loop) thread, so writing the file
/// straight from `save_settings` froze the whole window — no repaint, no
/// resize — for as long as the write took, which on a slow network drive
/// (the portable build keeps `settings.json` next to the exe) is seconds.
/// A channel keeps the writes in order; dumps that queued up behind a slow
/// write are coalesced, since only the newest one matters.
pub fn spawn_writer(path: PathBuf) -> Sender<BTreeMap<String, String>> {
    let (tx, rx) = std::sync::mpsc::channel::<BTreeMap<String, String>>();
    std::thread::spawn(move || {
        while let Ok(mut values) = rx.recv() {
            while let Ok(newer) = rx.try_recv() {
                values = newer;
            }
            write(&path, &values);
        }
    });
    tx
}

#[cfg(test)]
mod tests {
    use super::{read, spawn_writer, write};
    use std::collections::BTreeMap;

    fn dump(n: usize) -> BTreeMap<String, String> {
        BTreeMap::from([("philogg-n".to_string(), n.to_string())])
    }

    #[test]
    fn write_replaces_atomically() {
        let dir = std::env::temp_dir().join(format!("philogg-settings-test-{}", std::process::id()));
        let path = dir.join("settings.json");
        write(&path, &dump(1));
        write(&path, &dump(2));
        assert_eq!(read(&path), dump(2));
        assert!(!path.with_extension("json.tmp").exists());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn writer_keeps_the_newest_dump() {
        let dir = std::env::temp_dir().join(format!("philogg-writer-test-{}", std::process::id()));
        let path = dir.join("settings.json");
        let tx = spawn_writer(path.clone());
        for n in 0..50 {
            tx.send(dump(n)).unwrap();
        }
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        while read(&path) != dump(49) && std::time::Instant::now() < deadline {
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        assert_eq!(read(&path), dump(49));
        let _ = std::fs::remove_dir_all(dir);
    }
}
