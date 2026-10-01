// Installing and uninstalling without an installer of its own. The setup
// (src-tauri/setup, `Arayashiki-Setup.exe`) only downloads the latest
// `arayashiki.exe` from GitHub into %LOCALAPPDATA%\Arayashiki and runs it
// with `--install`; the app then makes its own shortcuts and its entry in
// Settings → Apps, and `--uninstall` (what that entry runs) takes them away.
// Because this lives in the app, it improves with every update, and the
// setup never needs building again.
//
// A copy installed by the older NSIS installer keeps that installer's
// uninstaller: only its version number is brought up to date.

use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::updates::{CREATE_NO_WINDOW, UNINSTALL_KEY};

fn reg(args: &[&str]) -> bool {
    Command::new("reg")
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn key() -> String {
    format!(r"HKCU\{UNINSTALL_KEY}")
}

fn set(name: &str, value: &str) {
    reg(&["add", &key(), "/v", name, "/t", "REG_SZ", "/d", value, "/f"]);
}

/// The entry's uninstaller, if it has one that's still there.
fn uninstaller() -> Option<PathBuf> {
    let out = Command::new("reg")
        .args(["query", &key(), "/v", "UninstallString"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    let value = text.lines().find(|l| l.contains("UninstallString"))?.split("REG_SZ").nth(1)?.trim();
    let path = value.trim_matches('"');
    (!path.contains("--uninstall") && Path::new(path).is_file()).then(|| PathBuf::from(path))
}

/// After an update: the version Settings → Apps shows.
pub fn record_version(version: &str) {
    if reg(&["query", &key()]) {
        set("DisplayVersion", version);
    }
}

fn shortcuts(exe: &Path, desktop: bool) {
    // WScript.Shell is the one way to write a .lnk without a library. The
    // paths go in through the environment, so nothing needs quoting.
    let script = r#"
$ws = New-Object -ComObject WScript.Shell
$programs = [Environment]::GetFolderPath('Programs')
$have = Get-ChildItem -Path $programs -Filter 'Arayashiki.lnk' -Recurse -ErrorAction SilentlyContinue
$links = @()
if (-not $have) { $links += Join-Path $programs 'Arayashiki.lnk' }
if ($env:ARAYASHIKI_DESKTOP -eq '1') { $links += Join-Path ([Environment]::GetFolderPath('Desktop')) 'Arayashiki.lnk' }
foreach ($p in $links) {
  $s = $ws.CreateShortcut($p)
  $s.TargetPath = $env:ARAYASHIKI_EXE
  $s.WorkingDirectory = Split-Path $env:ARAYASHIKI_EXE
  $s.IconLocation = "$($env:ARAYASHIKI_EXE),0"
  $s.Description = 'Jujutsu Shenanigans Skill Builder editor and simulator'
  $s.Save()
}
"#;
    let _ = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script])
        .env("ARAYASHIKI_EXE", exe)
        .env("ARAYASHIKI_DESKTOP", if desktop { "1" } else { "0" })
        .creation_flags(CREATE_NO_WINDOW)
        .status();
}

/// `--install`: shortcuts and the Settings → Apps entry.
fn install() {
    let Ok(exe) = std::env::current_exe() else { return };
    let dir = exe.parent().map(Path::to_path_buf).unwrap_or_default();
    let fresh = !reg(&["query", &key()]);
    shortcuts(&exe, fresh);
    let exe_s = exe.to_string_lossy().to_string();
    set("DisplayName", "Arayashiki");
    set("DisplayVersion", env!("CARGO_PKG_VERSION"));
    set("Publisher", "woogi999");
    set("DisplayIcon", &format!("\"{exe_s}\""));
    set("InstallLocation", &format!("\"{}\"", dir.to_string_lossy()));
    set("URLInfoAbout", "https://github.com/woogi999/arayashiki");
    set("MainBinaryName", "arayashiki.exe");
    if uninstaller().is_none() {
        set("UninstallString", &format!("\"{exe_s}\" --uninstall"));
    }
    reg(&["add", &key(), "/v", "NoModify", "/t", "REG_DWORD", "/d", "1", "/f"]);
    reg(&["add", &key(), "/v", "NoRepair", "/t", "REG_DWORD", "/d", "1", "/f"]);
    let kb = std::fs::metadata(&exe).map(|m| m.len() / 1024).unwrap_or(0);
    reg(&["add", &key(), "/v", "EstimatedSize", "/t", "REG_DWORD", "/d", &kb.to_string(), "/f"]);
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}

fn ask(text: &str) -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, IDYES, MB_ICONQUESTION, MB_YESNO};
    let (text, title) = (wide(text), wide("Uninstall Arayashiki"));
    // SAFETY: both strings are NUL-terminated and outlive the call.
    unsafe { MessageBoxW(std::ptr::null_mut(), text.as_ptr(), title.as_ptr(), MB_YESNO | MB_ICONQUESTION) == IDYES }
}

/// `--uninstall`: removes the shortcuts, the entry, and the app's folder
/// (once this process has ended). Movesets and settings are left.
fn uninstall() {
    if !ask("Remove Arayashiki from this PC?\n\nYour movesets, meters and settings are kept.") {
        return;
    }
    let script = r#"
foreach ($root in @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop'))) {
  Get-ChildItem -Path $root -Filter 'Arayashiki.lnk' -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force
}
$folder = Join-Path ([Environment]::GetFolderPath('Programs')) 'Arayashiki'
if ((Test-Path $folder) -and -not (Get-ChildItem $folder)) { Remove-Item $folder }
"#;
    let _ = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW)
        .status();
    reg(&["delete", &key(), "/f"]);
    let Ok(exe) = std::env::current_exe() else { return };
    let Some(dir) = exe.parent() else { return };
    // Only a folder of the app's own is removed whole; a copy run from
    // somewhere else only loses its exe.
    let target = if dir.file_name().map(|n| n.eq_ignore_ascii_case("Arayashiki")).unwrap_or(false) {
        format!("rmdir /s /q \"{}\"", dir.to_string_lossy())
    } else {
        format!("del /f /q \"{}\"", exe.to_string_lossy())
    };
    let _ = Command::new("cmd")
        .raw_arg(format!("/c ping -n 3 127.0.0.1 >nul & {target}"))
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
}

/// Handles `--install` and `--uninstall`; true when the process should end
/// here (uninstalling), false to go on and open the app.
pub fn at_launch(args: &[String]) -> bool {
    if args.iter().any(|a| a == "--uninstall") {
        uninstall();
        return true;
    }
    if args.iter().any(|a| a == "--install") {
        install();
    }
    false
}
