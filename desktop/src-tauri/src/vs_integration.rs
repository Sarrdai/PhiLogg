//! Visual Studio integration: jump from a log entry's Location/Method
//! columns straight into a running `devenv.exe` instance, at the right
//! file/line.
//!
//! Windows-only — Visual Studio itself only exists there. Every running
//! instance registers itself in the Running Object Table (ROT) under a
//! `!VisualStudio.DTE.<version>:<pid>` moniker; enumerating the ROT and
//! driving the resulting `EnvDTE.DTE` object is the standard COM-automation
//! route (the same one countless VS extensions and command-line tools use).
//! Both operations shell out to a small embedded PowerShell script rather
//! than pulling in a COM-interop crate — the same tradeoff `fonts.rs` already
//! makes for Windows font enumeration — since PowerShell's own COM support
//! (`[Runtime.InteropServices.Marshal]::BindToMoniker`) covers exactly what's
//! needed with no new Cargo dependency.
use serde::Serialize;

/// One running Visual Studio instance, as the Settings dialog's instance
/// picker needs it: its ROT moniker (opaque to the page, passed back
/// verbatim to `open_file`), its process id (to disambiguate two instances
/// with the same solution open, e.g. two worktrees), and whichever solution
/// it currently has open (`None` if it's sitting at the start page).
#[derive(Serialize)]
pub struct VsInstance {
    moniker: String,
    pid: u32,
    solution_path: Option<String>,
    title: String,
}

/// Lists every running Visual Studio instance found in the ROT. Never fails
/// outward: a spawn error, a parse error, or simply no Visual Studio running
/// all come back as an empty list — matching `fonts.rs`'s own "no extra
/// options show up" convention — since an empty picker is a normal,
/// recoverable state the Settings UI already has to show.
pub fn list_instances() -> Vec<VsInstance> {
    #[cfg(windows)]
    {
        windows_impl::list_instances()
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

/// Asks the given instance (by the moniker `list_instances` handed back) to
/// open `path` and move the caret to `line`, then brings it forward.
/// Windows-only; unreachable in practice because the Settings dialog and
/// context-menu item are both hidden outside Windows
/// (`window.philogg.isWindows`), but returns a proper `Err` rather than
/// panicking if ever called anyway.
pub fn open_file(moniker: &str, path: &str, line: u32) -> Result<(), String> {
    #[cfg(windows)]
    {
        windows_impl::open_file(moniker, path, line)
    }
    #[cfg(not(windows))]
    {
        let _ = (moniker, path, line);
        Err("Visual Studio integration is Windows-only".to_string())
    }
}

#[cfg(windows)]
mod windows_impl {
    use super::VsInstance;
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    /// `CREATE_NO_WINDOW`: both scripts below are triggered by an explicit
    /// user click (Connect, "Open in Visual Studio"), so — unlike the cached,
    /// once-per-run font enumeration in `fonts.rs` — a flashing console
    /// window would be noticeable on every use.
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    /// Runs a fixed PowerShell script via `-EncodedCommand` (base64 of its
    /// UTF-16LE bytes). Encoding sidesteps Windows command-line quoting
    /// entirely for a script this size/shape (embedded C#, here-strings,
    /// nested quotes) — there's nothing quoting-fragile left to get wrong.
    /// Any *variable* input (moniker/path/line) travels separately, through
    /// environment variables the caller sets on the returned `Command`,
    /// never interpolated into the script text.
    fn powershell(script: &str) -> Command {
        let mut cmd = Command::new("powershell");
        cmd.args(["-NoProfile", "-NonInteractive", "-EncodedCommand", &encoded_command(script)])
            .creation_flags(CREATE_NO_WINDOW);
        cmd
    }

    fn encoded_command(script: &str) -> String {
        let utf16le: Vec<u8> = script.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
        base64_encode(&utf16le)
    }

    /// Minimal RFC 4648 base64 (with padding) — the only place this crate
    /// needs it, so a dependency for it would just be "pulling in a crate to
    /// re-derive" a few lines, the same call `fonts.rs` already makes about
    /// font enumeration.
    fn base64_encode(data: &[u8]) -> String {
        const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
        for chunk in data.chunks(3) {
            let b0 = chunk[0] as u32;
            let b1 = *chunk.get(1).unwrap_or(&0) as u32;
            let b2 = *chunk.get(2).unwrap_or(&0) as u32;
            let n = (b0 << 16) | (b1 << 8) | b2;
            out.push(TABLE[((n >> 18) & 0x3F) as usize] as char);
            out.push(TABLE[((n >> 12) & 0x3F) as usize] as char);
            out.push(if chunk.len() > 1 { TABLE[((n >> 6) & 0x3F) as usize] as char } else { '=' });
            out.push(if chunk.len() > 2 { TABLE[(n & 0x3F) as usize] as char } else { '=' });
        }
        out
    }

    /// Enumerates the ROT via a small embedded C# snippet
    /// (`Add-Type -TypeDefinition`, the standard way to P/Invoke from
    /// PowerShell) — there is no PowerShell-native ROT API. Every VS
    /// instance's moniker starts with `!VisualStudio.DTE.`;
    /// `Marshal.BindToMoniker` on that moniker string hands back the
    /// `EnvDTE.DTE` COM object directly. `Solution.FullName` is an empty
    /// string, not an error, when no solution is open.
    const LIST_SCRIPT: &str = r#"
$src = @"
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
public static class PhiloggRot {
    [DllImport("ole32.dll")] public static extern int GetRunningObjectTable(int r, out IRunningObjectTable prot);
    [DllImport("ole32.dll")] public static extern int CreateBindCtx(int r, out IBindCtx ppbc);
}
"@
Add-Type -TypeDefinition $src -ErrorAction Stop
$rot = $null; [PhiloggRot]::GetRunningObjectTable(0, [ref]$rot) | Out-Null
$ctx = $null; [PhiloggRot]::CreateBindCtx(0, [ref]$ctx) | Out-Null
$enumerator = $rot.EnumRunning()
$monikers = New-Object System.Runtime.InteropServices.ComTypes.IMoniker[] 1
$results = @()
while ($enumerator.Next(1, $monikers, [IntPtr]::Zero) -eq 0) {
  $m = $monikers[0]
  $name = $null
  try { $name = $m.GetDisplayName($ctx) } catch { continue }
  if ($name -notlike "!VisualStudio.DTE.*") { continue }
  try {
    $dte = [Runtime.InteropServices.Marshal]::BindToMoniker($name)
    $pidPart = $name.Substring($name.LastIndexOf(":") + 1)
    $sol = $null; try { $sol = $dte.Solution.FullName } catch {}
    $title = $null; try { $title = $dte.MainWindow.Caption } catch {}
    $results += [PSCustomObject]@{ moniker = $name; pid = [int]$pidPart; solutionPath = $sol; title = $title }
  } catch { continue }
}
$results | ConvertTo-Json -Compress
"#;

    pub fn list_instances() -> Vec<VsInstance> {
        let Ok(out) = powershell(LIST_SCRIPT).output() else { return Vec::new() };
        if !out.status.success() {
            return Vec::new();
        }
        parse_instances(&String::from_utf8_lossy(&out.stdout))
    }

    #[derive(serde::Deserialize)]
    struct RawInstance {
        moniker: String,
        pid: i64,
        #[serde(rename = "solutionPath")]
        solution_path: Option<String>,
        title: Option<String>,
    }

    fn parse_instances(stdout: &str) -> Vec<VsInstance> {
        let trimmed = stdout.trim();
        if trimmed.is_empty() {
            return Vec::new();
        }
        // `ConvertTo-Json` emits a single object rather than a one-element
        // array when there's exactly one result — normalize both shapes.
        let raws: Vec<RawInstance> = if trimmed.starts_with('[') {
            serde_json::from_str(trimmed).unwrap_or_default()
        } else {
            serde_json::from_str::<RawInstance>(trimmed).map(|r| vec![r]).unwrap_or_default()
        };
        raws.into_iter()
            .map(|r| VsInstance {
                moniker: r.moniker,
                pid: r.pid.max(0) as u32,
                solution_path: r.solution_path.filter(|s| !s.is_empty()),
                title: r.title.unwrap_or_default(),
            })
            .collect()
    }

    /// Fixed script — the variable, log-derived `moniker`/`path`/`line`
    /// travel in via `PHILOGG_VS_*` environment variables on the spawned
    /// process (set below), never interpolated into the script text.
    /// `GotoLine`'s second argument (`true`) also selects/centers the line,
    /// matching what a person doing this by hand in the IDE would expect.
    const OPEN_SCRIPT: &str = r#"
$moniker = $env:PHILOGG_VS_MONIKER
$path = $env:PHILOGG_VS_PATH
$line = [int]$env:PHILOGG_VS_LINE
$dte = [Runtime.InteropServices.Marshal]::BindToMoniker($moniker)
$dte.ItemOperations.OpenFile($path) | Out-Null
$dte.ActiveDocument.Selection.GotoLine($line, $true)
$dte.MainWindow.Activate()
"#;

    pub fn open_file(moniker: &str, path: &str, line: u32) -> Result<(), String> {
        let out = powershell(OPEN_SCRIPT)
            .env("PHILOGG_VS_MONIKER", moniker)
            .env("PHILOGG_VS_PATH", path)
            .env("PHILOGG_VS_LINE", line.to_string())
            .output()
            .map_err(|e| e.to_string())?;
        if out.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            Err(if stderr.is_empty() {
                "Visual Studio didn't respond — is the connected instance still running?".to_string()
            } else {
                stderr
            })
        }
    }
}
