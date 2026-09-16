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
//! makes for Windows font enumeration.
//!
//! One gotcha that isn't obvious from a C# reference implementation of this
//! technique: PowerShell can only call methods on a COM object dynamically
//! (`$obj.Method()`) when that object is Automation/`IDispatch`-compatible.
//! The raw ROT interfaces (`IRunningObjectTable`/`IBindCtx`/`IEnumMoniker`/
//! `IMoniker`) are NOT — walking the ROT itself has to happen inside the
//! embedded, compile-time-typed C# class (`windows_impl::CS_SOURCE`), never
//! in PowerShell script text directly. `EnvDTE.DTE` itself, and
//! `[Marshal]::BindToMoniker` (a plain static .NET method, not a COM call),
//! are both fine from PowerShell once a moniker string is in hand — see
//! `CS_SOURCE`'s own doc comment for the full story.
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

/// `list_instances`'s result: the (possibly empty) instance list, plus a
/// human-readable diagnostic whenever the PowerShell/COM side itself failed
/// — as opposed to a clean run that legitimately found zero instances. The
/// two used to be indistinguishable (any problem at all came back as an
/// empty `Vec`, by design, so a script bug and "VS really isn't running"
/// looked identical to the Settings dialog); this carries the script's own
/// error text through instead, so the "Connect…" button can show it.
#[derive(Serialize)]
pub struct VsListResult {
    instances: Vec<VsInstance>,
    error: Option<String>,
}

/// Lists every running Visual Studio instance found in the ROT.
pub fn list_instances() -> VsListResult {
    #[cfg(windows)]
    {
        windows_impl::list_instances()
    }
    #[cfg(not(windows))]
    {
        VsListResult { instances: Vec::new(), error: None }
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
    use super::{VsInstance, VsListResult};
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

    /// Runs an already-configured `powershell(...)` command, returning
    /// `Ok(stdout)` on a clean exit or `Err(message)` otherwise — a spawn
    /// failure, or the script's own top-level `catch` (both scripts below
    /// wrap their whole body in one and exit 1 after writing a clear message
    /// to stderr, instead of letting an unhandled COM/.NET exception produce
    /// an opaque result). Centralized here so `list_instances`/`open_file`
    /// don't each re-derive the same spawn-error/exit-code/stderr plumbing.
    fn run(mut cmd: Command) -> Result<String, String> {
        let out = cmd.output().map_err(|e| e.to_string())?;
        if out.status.success() {
            Ok(String::from_utf8_lossy(&out.stdout).into_owned())
        } else {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            Err(if stderr.is_empty() {
                "The PowerShell script exited with an error (no message on stderr).".to_string()
            } else {
                stderr
            })
        }
    }

    /// Enumerates the ROT and filters monikers starting with
    /// `!VisualStudio.DTE.` (every running `devenv.exe` registers one),
    /// returning their moniker **strings** — nothing else. The whole walk
    /// (`GetRunningObjectTable`/`CreateBindCtx`/`IRunningObjectTable.
    /// EnumRunning`/`IEnumMoniker.Next`/`IMoniker.GetDisplayName`) happens
    /// inside this embedded, compile-time-typed C# class rather than in
    /// PowerShell script text, because it HAS to: PowerShell's own dynamic
    /// (`$obj.Method()`) dispatch on a COM object only works for
    /// Automation/`IDispatch`-compatible interfaces, and
    /// `IRunningObjectTable`/`IBindCtx`/`IEnumMoniker`/`IMoniker` are plain
    /// vtable-only interfaces with no `IDispatch` support at all — a COM
    /// object without a registered interop class reports its runtime type
    /// as the generic `System.__ComObject` to PowerShell's reflection-based
    /// method lookup, which then has no `IDispatch.Invoke` to fall back to.
    /// (Confirmed the hard way: an earlier version of this file tried
    /// `$rot.EnumRunning()`/`$rot.GetObject($m)` directly from PowerShell
    /// and failed with exactly "[System.__ComObject] does not contain a
    /// method named 'EnumRunning'".) None of this applies to compiled C#,
    /// where `.EnumRunning()` resolves at compile time against the
    /// *declared* interface type and never needs reflection — which is
    /// also why every reference example for this technique found online is
    /// C#, not PowerShell, and doesn't translate over 1:1.
    const CS_SOURCE: &str = r#"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
public static class PhiloggRot {
    [DllImport("ole32.dll")] private static extern int GetRunningObjectTable(int r, out IRunningObjectTable prot);
    [DllImport("ole32.dll")] private static extern int CreateBindCtx(int r, out IBindCtx ppbc);

    public static string[] ListVsMonikers() {
        IRunningObjectTable rot;
        int hr = GetRunningObjectTable(0, out rot);
        if (hr != 0) throw new Exception("GetRunningObjectTable failed, HRESULT 0x" + hr.ToString("X8"));
        IBindCtx ctx;
        hr = CreateBindCtx(0, out ctx);
        if (hr != 0) throw new Exception("CreateBindCtx failed, HRESULT 0x" + hr.ToString("X8"));

        var results = new List<string>();
        // Unlike GetRunningObjectTable/CreateBindCtx above (plain ole32.dll
        // P/Invokes returning a raw HRESULT), EnumRunning is a COM-interop
        // interface method with no [PreserveSig] — the CLR checks its
        // HRESULT itself and throws a COMException on failure, so there is
        // no int return value to check here at all (a genuine, verified
        // signature difference; guessing this one wrong is exactly what
        // produced the previous "no overload takes 0 arguments" error).
        IEnumMoniker enumMoniker;
        rot.EnumRunning(out enumMoniker);
        IMoniker[] monikers = new IMoniker[1];
        while (enumMoniker.Next(1, monikers, IntPtr.Zero) == 0) {
            string name = null;
            try { monikers[0].GetDisplayName(ctx, null, out name); } catch { continue; }
            if (name != null && name.StartsWith("!VisualStudio.DTE.", StringComparison.OrdinalIgnoreCase)) {
                results.Add(name);
            }
        }
        return results.ToArray();
    }
}
"#;

    /// Once a moniker *string* is in hand (from `ListVsMonikers` above, or
    /// passed back in by the page), everything else is safe to do directly
    /// from PowerShell: `[Marshal]::BindToMoniker` is a plain **static
    /// method on an ordinary .NET class** (`Marshal` isn't a COM object, so
    /// PowerShell's normal reflection handles it fine), and the resulting
    /// `EnvDTE.DTE` is itself Automation/`IDispatch`-compatible by design
    /// (that's the whole point of the DTE object model — cross-language
    /// scripting access) — so `.Solution.FullName`/`.MainWindow.Caption`/
    /// `.ItemOperations.OpenFile`/etc. all work as ordinary late-bound
    /// property/method access. `Solution.FullName` is an empty string, not
    /// an error, when no solution is open. The whole body is one top-level
    /// `try`, so any failure (including inside `CS_SOURCE`) is reported on
    /// stderr with exit code 1 instead of an unhandled exception's default
    /// (opaque, and not guaranteed non-zero) behavior.
    const LIST_SCRIPT: &str = r#"
try {
  $src = @"
__CS_SOURCE__
"@
  Add-Type -TypeDefinition $src -ErrorAction Stop

  $results = @()
  foreach ($moniker in [PhiloggRot]::ListVsMonikers()) {
    try {
      $dte = [Runtime.InteropServices.Marshal]::BindToMoniker($moniker)
      $pidPart = $moniker.Substring($moniker.LastIndexOf(":") + 1)
      $sol = $null; try { $sol = $dte.Solution.FullName } catch {}
      $title = $null; try { $title = $dte.MainWindow.Caption } catch {}
      $results += [PSCustomObject]@{ moniker = $moniker; pid = [int]$pidPart; solutionPath = $sol; title = $title }
    } catch { continue }
  }
  $results | ConvertTo-Json -Compress
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
"#;

    pub fn list_instances() -> VsListResult {
        let script = LIST_SCRIPT.replace("__CS_SOURCE__", CS_SOURCE);
        match run(powershell(&script)) {
            Ok(stdout) => VsListResult { instances: parse_instances(&stdout), error: None },
            Err(error) => VsListResult { instances: Vec::new(), error: Some(error) },
        }
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

    /// No ROT walk needed here at all — the moniker string is already known
    /// (returned by a prior `list_instances` call, round-tripped back in by
    /// the page) — so this goes straight to the same plain, ordinary
    /// `[Marshal]::BindToMoniker` + `IDispatch`-compatible DTE access
    /// `LIST_SCRIPT` uses once it has a moniker string, with no C# needed at
    /// all. The variable, log-derived `moniker`/`path`/`line` travel in via
    /// `PHILOGG_VS_*` environment variables (set by `open_file` below),
    /// never interpolated into this (fixed) script text. `GotoLine`'s
    /// second argument (`true`) also selects/centers the line, matching
    /// what a person doing this by hand in the IDE would expect.
    const OPEN_SCRIPT: &str = r#"
try {
  $moniker = $env:PHILOGG_VS_MONIKER
  $path = $env:PHILOGG_VS_PATH
  $line = [int]$env:PHILOGG_VS_LINE

  $dte = [Runtime.InteropServices.Marshal]::BindToMoniker($moniker)
  $dte.ItemOperations.OpenFile($path) | Out-Null
  $dte.ActiveDocument.Selection.GotoLine($line, $true)
  $dte.MainWindow.Activate()
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
"#;

    pub fn open_file(moniker: &str, path: &str, line: u32) -> Result<(), String> {
        let mut cmd = powershell(OPEN_SCRIPT);
        cmd.env("PHILOGG_VS_MONIKER", moniker)
            .env("PHILOGG_VS_PATH", path)
            .env("PHILOGG_VS_LINE", line.to_string());
        run(cmd).map(|_| ())
    }
}
