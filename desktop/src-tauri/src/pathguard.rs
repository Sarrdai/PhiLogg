//! Guards for the two ways a hostile log file could abuse the path-taking
//! commands in `commands.rs`. Pure string functions with no I/O, so they run
//! (and are unit-tested) the same on every platform.
//!
//! 1. A UNC path in a log line (`\\attacker.example\share\x.log`) makes
//!    Windows open an SMB/WebDAV connection and authenticate with the user's
//!    NTLM credentials the moment the page checks whether the path exists —
//!    no click needed, the row only has to scroll into view. `is_remote_path`
//!    lets `path_exists` refuse before it touches the filesystem.
//! 2. The "open" actions hand a log-/archive-controlled name to the OS shell
//!    opener, which RUNS executable and script types instead of showing
//!    them. `check_open_target` (`open_path`) and `is_executable_content`
//!    (`open_extracted_entry`) refuse those.

/// Types the OS shell runs (or installs, or merges into the registry) rather
/// than opens in a viewer. Compared case-insensitively against the extension
/// after `is_executable_content`'s Windows normalisation.
const EXECUTABLE_EXTENSIONS: &[&str] = &[
    "exe", "com", "bat", "cmd", "scr", "pif", "msi", "msp", "msc", "cpl", "dll", "ps1", "psm1", "psd1", "vbs", "vbe",
    "js", "jse", "wsf", "wsh", "hta", "lnk", "url", "reg", "jar", "sh", "command", "app", "appimage", "desktop", "run",
];

/// URI schemes `open_path` may pass to the OS: the IDE integration's Rider
/// deep link (`jetbrains://rider/navigate/reference?...`, philogg.html's
/// `buildRiderUri`). Everything else with a scheme is refused — `file://`,
/// `ms-msdt:`, `search-ms:` and friends are exactly what a hostile link would use.
const ALLOWED_URI_SCHEMES: &[&str] = &["jetbrains"];

/// True for a path that leaves this machine or reaches a device namespace:
/// Windows UNC (`\\server\share`, also in the forward-slash form
/// `//server/share` — Windows accepts either separator anywhere),
/// `\\?\UNC\...`, `\\.\...` (device namespace) and the NT-object `\??\...`
/// spelling. A local extended-length path (`\\?\C:\...`), drive paths, POSIX
/// paths, relative paths and the empty string are not remote.
///
/// Deliberately not platform-gated: a path that starts with two separators is
/// never a path the page legitimately found on a log line anywhere else
/// either, and answering "not here" is the safe error.
pub fn is_remote_path(path: &str) -> bool {
    let p = path.trim_start().replace('/', "\\");
    if let Some(rest) = p.strip_prefix("\\\\?\\").or_else(|| p.strip_prefix("\\??\\")) {
        // Local only when what follows is a drive (`C:` + end or separator).
        // `UNC\...`, `GLOBALROOT\...` (reaches `Device\Mup` = a network
        // redirector) and `Volume{...}` all count as remote/device.
        let mut chars = rest.chars();
        let drive = chars.next().is_some_and(|c| c.is_ascii_alphabetic()) && chars.next() == Some(':');
        return !(drive && matches!(chars.next(), None | Some('\\')));
    }
    p.starts_with("\\\\")
}

/// True when opening this path/name would make the OS run it. Judges the
/// final path component only, after undoing the Windows tricks that make a
/// different name resolve to the same file:
///   - both `/` and `\` separate components;
///   - trailing spaces and dots are dropped (`x.exe `, `x.exe.` are `x.exe`);
///   - NTFS alternate data streams (`x.exe::$DATA`, `x.txt:evil.exe`): every
///     `:`-separated part is judged, the file name and the stream name alike.
pub fn is_executable_content(path: &str) -> bool {
    basename(path).split(':').any(has_executable_extension)
}

/// The last component of `path`, split on both separators, ignoring trailing
/// ones (`dir/x.exe/` is `x.exe`). Also what the refusal messages show.
pub fn basename(path: &str) -> &str {
    let trimmed = path.trim_end_matches(['/', '\\']);
    trimmed.rsplit(['/', '\\']).next().unwrap_or(trimmed)
}

fn has_executable_extension(name: &str) -> bool {
    let name = name.trim_end_matches([' ', '.']);
    name.rsplit_once('.')
        .is_some_and(|(_, ext)| EXECUTABLE_EXTENSIONS.iter().any(|e| ext.eq_ignore_ascii_case(e)))
}

/// What `open_path` may hand to the OS opener; `Err` carries a short readable
/// reason. Three cases:
///   - an allow-listed deep link (`jetbrains://...`) passes without the
///     executable check — its URL-encoded `path=` query may well name a `.sh`
///     or `.js` *source* file that the IDE merely navigates to;
///   - any other URI scheme is refused;
///   - a plain filesystem path is refused when it is `is_executable_content`.
pub fn check_open_target(target: &str) -> Result<(), String> {
    match uri_is_allowed(target) {
        Some(true) => Ok(()),
        Some(false) => Err("Refusing to open a link with an unsupported scheme".to_string()),
        None if is_executable_content(target) => {
            Err(format!("Refusing to open executable content: {}", basename(target)))
        }
        None => Ok(()),
    }
}

/// `None` for a plain filesystem path, else whether the URI's scheme is
/// allow-listed. A plain path has no scheme: `C:\x` has a single letter before
/// the `:` (a drive, so schemes need two characters or more), POSIX and
/// relative paths don't start with a letter-and-colon at all. `ms-msdt:` /
/// `search-ms:` have no `//` after the colon, so any scheme counts, not only
/// `scheme://`; an allow-listed scheme must still be in its `scheme://` form.
fn uri_is_allowed(target: &str) -> Option<bool> {
    // Leading whitespace/control characters are skipped, as URL parsers do.
    let s = target.trim_start_matches(|c: char| c.is_whitespace() || c.is_control());
    let scheme = &s[..s.find(':')?];
    let mut chars = scheme.chars();
    let valid = chars.next().is_some_and(|c| c.is_ascii_alphabetic())
        && chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '.' | '-'));
    if !valid || scheme.len() < 2 {
        return None;
    }
    let allowed = ALLOWED_URI_SCHEMES.iter().any(|a| scheme.eq_ignore_ascii_case(a));
    Some(allowed && s[scheme.len() + 1..].starts_with("//"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unc_and_device_paths_are_remote() {
        for p in [
            r"\\server\share\x.log",
            r"\\attacker.example\share\x",
            r"\\server",
            r"\\192.168.0.5\c$\x.log",
            r"\\host@SSL\DavWWWRoot\x.log",
            "//server/share/x.log",
            r"\/server/share",
            r"/\server\share",
            r"\\?\UNC\server\share\x.log",
            r"\\?\unc\server\share",
            "//?/UNC/server/share",
            r"\\.\pipe\x",
            r"\\.\C:\x",
            r"\\?\GLOBALROOT\Device\Mup\server\share",
            r"\\?\Volume{01234567-89ab-cdef-0123-456789abcdef}\x.log",
            r"\??\UNC\server\share\x",
            r"  \\server\share",
        ] {
            assert!(is_remote_path(p), "{p:?} must be remote");
        }
    }

    #[test]
    fn local_paths_are_not_remote() {
        for p in [
            r"\\?\C:\logs\app.log",
            r"\\?\c:\logs",
            r"\\?\C:",
            "//?/C:/logs/app.log",
            r"\??\C:\logs\app.log",
            r"C:\logs\app.log",
            "C:/logs/app.log",
            r"C:\\logs",
            "/var/log/app.log",
            "/usr/lib/x",
            r"\server\share",
            r"logs\app.log",
            "./app.log",
            "app.log",
            "~/app.log",
            "",
        ] {
            assert!(!is_remote_path(p), "{p:?} must not be remote");
        }
    }

    #[test]
    fn executable_types_are_refused_case_insensitively() {
        for ext in EXECUTABLE_EXTENSIONS {
            assert!(is_executable_content(&format!("C:\\tmp\\x.{ext}")), "{ext}");
            assert!(is_executable_content(&format!("/tmp/x.{}", ext.to_uppercase())), "{ext} upper");
        }
        assert!(is_executable_content("evil.Exe"));
        assert!(is_executable_content("a.b.c.ps1"));
        assert!(is_executable_content("Setup.MSI"));
        assert!(is_executable_content("MyApp.app"));
    }

    #[test]
    fn data_types_are_not_executable() {
        for p in [
            "app.log",
            "app.log.1.gz",
            "notes.txt",
            "data.json",
            "report.pdf",
            "archive.zip",
            "x.exe.txt",
            "exe",
            "x.exe2",
            "x.js.map",
            "C:\\logs\\app.log",
            "/var/log/syslog",
            "run",
            "",
            "dir.exe/readme.txt",
            "dir.exe\\readme.txt",
        ] {
            assert!(!is_executable_content(p), "{p:?} must be allowed");
        }
    }

    #[test]
    fn windows_name_tricks_do_not_hide_the_extension() {
        for p in [
            "x.exe ",
            "x.exe.",
            "x.exe. . .",
            "x.exe...  ",
            "x.exe::$DATA",
            "x.exe:stream",
            "x.txt:evil.exe",
            "x.txt:evil.exe:$DATA",
            "x.txt:evil.EXE ",
            "C:evil.exe",
            r"C:\dir\x.exe ",
            r"C:\dir\x.txt:evil.exe",
            "dir/x.exe/",
            r"dir\x.exe\",
            r"dir/sub\x.cmd",
            r"..\..\x.bat",
        ] {
            assert!(is_executable_content(p), "{p:?} must be refused");
        }
        // The stream-name rule must not turn plain streams into false hits.
        assert!(!is_executable_content("x.txt:$DATA"));
        assert!(!is_executable_content("x.txt::$DATA"));
        assert!(!is_executable_content(r"C:\dir.exe\x.txt:stream"));
    }

    #[test]
    fn basename_splits_on_both_separators() {
        assert_eq!(basename("a/b/c.txt"), "c.txt");
        assert_eq!(basename(r"a\b\c.txt"), "c.txt");
        assert_eq!(basename(r"a/b\c.txt"), "c.txt");
        assert_eq!(basename("a/b/"), "b");
        assert_eq!(basename("c.txt"), "c.txt");
        assert_eq!(basename(""), "");
    }

    #[test]
    fn rider_deep_link_is_the_only_allowed_scheme() {
        for u in [
            "jetbrains://rider/navigate/reference?project=P&path=a%2Fb.cs:41",
            "JetBrains://rider/navigate/reference?project=P",
            "  jetbrains://rider/x",
            // A source file the IDE merely navigates to is not executable content.
            "jetbrains://rider/navigate/reference?project=P&path=scripts%2Fbuild.sh:41",
            "jetbrains://rider/navigate/reference?project=P&path=tools%2Frun.cmd:0",
            "jetbrains://rider/navigate/reference?project=P&path=web%2Fapp.js:9",
        ] {
            assert_eq!(check_open_target(u), Ok(()), "{u:?} must pass");
        }
        for u in [
            "file:///C:/Windows/System32/calc.exe",
            "file://attacker.example/share/x.exe",
            "file://attacker.example/share/x.log",
            "ms-msdt:/id PCWDiagnostic /skip force /param \"IT_BrowseForFile=x\"",
            "ms-msdt:id",
            "search-ms:query=x&crumb=location:\\\\attacker.example\\share",
            "search-ms://query=x",
            "http://example.com/x",
            "https://example.com/x",
            "smb://server/share",
            "ms-officecmd:x",
            "vscode://file/x",
            "x-github-client://openRepo/x",
            "jetbrains:rider/navigate",
            "jetbrainsx://rider/x",
            "  ms-msdt:id",
            "\tms-msdt:id",
            "MS-MSDT:id",
        ] {
            let err = check_open_target(u).expect_err(u);
            assert!(err.contains("scheme"), "{u:?}: {err}");
        }
    }

    #[test]
    fn filesystem_paths_are_not_uris() {
        for p in [
            r"C:\logs\app.log",
            "C:/logs/app.log",
            "c:app.log",
            r"C:\\server",
            "C://logs",
            r"\\server\share\x.log",
            r"\\?\C:\logs\app.log",
            "/var/log/app.log",
            "/var/log/a:b.log",
            "~/logs/app.log",
            "./a:b.log",
            "app.log",
            "",
        ] {
            assert_eq!(uri_is_allowed(p), None, "{p:?} must not be taken for a URI");
            assert_eq!(check_open_target(p), Ok(()), "{p:?} must be openable");
        }
    }

    #[test]
    fn open_target_refuses_executable_paths_by_name() {
        let err = check_open_target(r"C:\Users\x\Downloads\Setup.exe").unwrap_err();
        assert_eq!(err, "Refusing to open executable content: Setup.exe");
        assert!(check_open_target("/tmp/run.sh").is_err());
        assert!(check_open_target("C:/tmp/x.txt:evil.exe").is_err());
        // A remote path is not refused here (only `path_exists` cuts the
        // credential probe), but a remote executable still is.
        assert_eq!(check_open_target(r"\\server\share\app.log"), Ok(()));
        assert!(check_open_target(r"\\server\share\evil.exe").is_err());
    }
}
