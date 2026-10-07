//! Provided log formats: `*.logformat.json` files in a `formats/` folder next
//! to the executable (machine-wide, e.g. rolled out by an installer) and in
//! the per-user config folder. Read once at window creation and baked into the
//! init script (`inject.rs`) as `window.__PHILOGG_PROVIDED_FORMATS__`, which
//! the page uses instead of its hosted `formats/index.json` fetch. The files
//! are passed through as text; the page validates them and shows a notice for
//! an invalid one. A restart picks up changes. See `docs/log-formats.md` →
//! "Provided formats".
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize, Debug, PartialEq, Eq)]
pub struct ProvidedFile {
    /// File name, e.g. `app-log.logformat.json` (the page derives the format id from it).
    pub name: String,
    /// Full path, shown as the "Provided" tag's tooltip.
    pub source: String,
    pub text: String,
}

const EXTENSION: &str = ".logformat.json";

/// Every `*.logformat.json` (case-insensitive) directly inside `dir`, sorted by
/// name. A missing folder, subfolders, other files and unreadable files are ignored.
pub fn read_folder(dir: &Path) -> Vec<ProvidedFile> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut files: Vec<ProvidedFile> = entries
        .filter_map(Result::ok)
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            if !name.to_lowercase().ends_with(EXTENSION) {
                return None;
            }
            let text = std::fs::read_to_string(e.path()).ok()?;
            Some(ProvidedFile { name, source: e.path().to_string_lossy().into_owned(), text })
        })
        .collect();
    files.sort_by(|a, b| a.name.cmp(&b.name));
    files
}

/// Machine-wide folder first, then the per-user one; a per-user file with the
/// same name replaces the machine-wide one. The result is sorted by name.
pub fn read_folders(machine: Option<&Path>, user: Option<&Path>) -> Vec<ProvidedFile> {
    let mut out: Vec<ProvidedFile> = Vec::new();
    for dir in [machine, user].into_iter().flatten() {
        for f in read_folder(dir) {
            out.retain(|o| o.name != f.name);
            out.push(f);
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

/// `<exe-dir>/formats`: the install folder for an installed app, the app
/// folder for a portable one.
pub fn machine_dir() -> Option<PathBuf> {
    Some(std::env::current_exe().ok()?.parent()?.join("formats"))
}

/// All provided formats for this run. `config_dir` is `settings::config_dir`
/// (`<config>/PhiLogg`, or `<exe>/data` when portable); the portable build keeps
/// its formats in `<exe-dir>/formats` only, which is the machine folder.
pub fn read_all(config_dir: &Path, portable: bool) -> Vec<ProvidedFile> {
    let user = (!portable).then(|| config_dir.join("formats"));
    read_folders(machine_dir().as_deref(), user.as_deref())
}

#[cfg(test)]
mod tests {
    use super::{read_folder, read_folders};
    use std::path::PathBuf;

    fn scratch(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("philogg-formats-test-{}-{}", tag, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn missing_folder_is_empty() {
        assert!(read_folder(&std::env::temp_dir().join("philogg-formats-does-not-exist")).is_empty());
    }

    #[test]
    fn reads_sorted_format_files_only_and_passes_invalid_json_through() {
        let dir = scratch("read");
        std::fs::write(dir.join("b.logformat.json"), "{\"a\":1}").unwrap();
        std::fs::write(dir.join("A.LogFormat.JSON"), "not json at all").unwrap();
        std::fs::write(dir.join("notes.txt"), "x").unwrap();
        std::fs::write(dir.join("plain.json"), "{}").unwrap();
        std::fs::create_dir_all(dir.join("sub.logformat.json")).unwrap();
        std::fs::create_dir_all(dir.join("nested")).unwrap();
        std::fs::write(dir.join("nested").join("c.logformat.json"), "{}").unwrap();
        let files = read_folder(&dir);
        let names: Vec<&str> = files.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(names, ["A.LogFormat.JSON", "b.logformat.json"]);
        assert_eq!(files[0].text, "not json at all");
        assert!(files[1].source.ends_with("b.logformat.json"));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn user_file_replaces_machine_file_of_the_same_name() {
        let machine = scratch("machine");
        let user = scratch("user");
        std::fs::write(machine.join("shared.logformat.json"), "machine").unwrap();
        std::fs::write(machine.join("only-machine.logformat.json"), "m").unwrap();
        std::fs::write(user.join("shared.logformat.json"), "user").unwrap();
        std::fs::write(user.join("only-user.logformat.json"), "u").unwrap();
        let files = read_folders(Some(&machine), Some(&user));
        let got: Vec<(&str, &str)> = files.iter().map(|f| (f.name.as_str(), f.text.as_str())).collect();
        assert_eq!(
            got,
            [("only-machine.logformat.json", "m"), ("only-user.logformat.json", "u"), ("shared.logformat.json", "user")]
        );
        assert!(read_folders(None, None).is_empty());
        let _ = std::fs::remove_dir_all(machine);
        let _ = std::fs::remove_dir_all(user);
    }
}
