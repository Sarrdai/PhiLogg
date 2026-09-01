//! System font enumeration for `philogg.html`'s UI-font picker.
//!
//! A plain HTML build is stuck with a curated stack list because the
//! browser's Local Font Access API needs a permission-prompt UI it doesn't
//! have; a desktop wrapper has no such restriction. The platform commands
//! below are called directly rather than pulling in a font crate (and, on
//! Linux, its fontconfig/freetype build dependencies) just to re-derive a
//! list of names.
//!
//! Any failure (missing binary, sandboxed OS, …) yields an empty list rather
//! than an error: the curated list still works everywhere, so the only
//! consequence is that no extra options show up.
pub fn list() -> Vec<String> {
    let mut names = platform_fonts();
    names.retain(|n| !n.trim().is_empty());
    names.sort_by_key(|n| n.to_lowercase());
    names.dedup();
    names
}

#[cfg(target_os = "linux")]
fn platform_fonts() -> Vec<String> {
    let out = std::process::Command::new("fc-list")
        .args(["--format", "%{family[0]}\n"])
        .output();
    match out {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout)
            .lines()
            .map(|l| l.trim().to_string())
            .collect(),
        _ => Vec::new(),
    }
}

#[cfg(windows)]
fn platform_fonts() -> Vec<String> {
    let out = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Add-Type -AssemblyName PresentationCore; \
             [Windows.Media.Fonts]::SystemFontFamilies | ForEach-Object { $_.Source }",
        ])
        .output();
    match out {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout)
            .lines()
            .map(|l| l.trim().to_string())
            .collect(),
        _ => Vec::new(),
    }
}

/// macOS has no `fc-list` out of the box and `system_profiler
/// SPFontsDataType` is both slow and awkward to parse, so the family names
/// are approximated from the font files' own names in the three standard
/// font directories. That is an approximation (a file's stem is not always
/// exactly its family name) — see `desktop/README.md` → "Known
/// limitations".
#[cfg(target_os = "macos")]
fn platform_fonts() -> Vec<String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let dirs = [
        "/System/Library/Fonts".to_string(),
        "/Library/Fonts".to_string(),
        format!("{home}/Library/Fonts"),
    ];
    let mut names = Vec::new();
    for dir in dirs {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let ext = path
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default();
            if !matches!(ext.as_str(), "ttf" | "otf" | "ttc") {
                continue;
            }
            if let Some(stem) = path.file_stem() {
                names.push(stem.to_string_lossy().replace('-', " "));
            }
        }
    }
    names
}
