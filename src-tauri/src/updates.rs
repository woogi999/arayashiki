// Updates, from the project's GitHub releases (github.com/woogi999/arayashiki).
// The app updates itself, the way game launchers do:
//
//   * `update_check` asks GitHub's API for the latest release and says
//     whether it's newer than this build, with its notes and its files.
//   * `update_stage` downloads the new `arayashiki.exe` next to this one
//     (into `update\`), in the background, reporting progress on a channel.
//   * `update_restart` swaps it in and starts it. Left staged, the swap
//     happens at the next launch instead (`at_launch`), before any window
//     opens: closing the app and opening it again is enough.
//
// The swap renames the running exe to `arayashiki.exe.old` (Windows lets a
// running program be renamed, not overwritten), moves the new one into its
// place, and starts it; the old file is deleted on the next launch.
//
// A release without the app's exe on its own (older ones only had the NSIS
// installer), or an install the app can't write to, falls back to
// downloading and running the installer (`update_download`,
// `update_install`). Only this repository's release downloads are fetched.

use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::Value;
use tauri::ipc::Channel;

const REPO: &str = "woogi999/arayashiki";
/// The app's own exe in a release: what updates swap in, and what the
/// setup (src-tauri/setup) downloads.
pub const APP_ASSET: &str = "arayashiki.exe";
pub const UNINSTALL_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Arayashiki";
/// Keeps `reg`, `powershell` and the like from flashing a console window.
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn releases_url() -> String {
    format!("https://api.github.com/repos/{REPO}/releases/latest")
}

fn download_prefix() -> String {
    format!("https://github.com/{REPO}/releases/download/")
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        // GitHub's API refuses requests without a User-Agent.
        .user_agent(concat!("Arayashiki/", env!("CARGO_PKG_VERSION")))
        .timeout(std::time::Duration::from_secs(600))
        .connect_timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())
}

/// "v1.2.3" or "1.2.3-beta" → [1, 2, 3]; missing parts are 0.
fn version_parts(v: &str) -> [u64; 3] {
    let core = v.trim().trim_start_matches(['v', 'V']).split(['-', '+']).next().unwrap_or("");
    let mut out = [0; 3];
    for (slot, part) in out.iter_mut().zip(core.split('.')) {
        *slot = part.trim().parse().unwrap_or(0);
    }
    out
}

fn newer_than_this(v: &str) -> bool {
    version_parts(v) > version_parts(env!("CARGO_PKG_VERSION"))
}

#[derive(Serialize)]
pub struct Asset {
    name: String,
    size: u64,
    url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    current: String,
    latest: String,
    newer: bool,
    name: String,
    notes: String,
    page: String,
    published: Option<String>,
    /// The NSIS installer or the setup, for the fallback.
    installer: Option<Asset>,
    /// The app's exe, which updates swap in.
    app: Option<Asset>,
    /// Whether this copy can replace itself (an installed release build,
    /// in a folder it can write to).
    self_update: bool,
    /// A version already downloaded and waiting for a restart.
    staged: Option<String>,
}

fn find_asset(release: &Value, pick: impl Fn(&str) -> bool) -> Option<Asset> {
    release["assets"].as_array()?.iter().find_map(|a| {
        let name = a["name"].as_str()?;
        let url = a["browser_download_url"].as_str()?;
        (pick(&name.to_lowercase()) && url.starts_with(&download_prefix())).then(|| Asset {
            name: name.to_string(),
            size: a["size"].as_u64().unwrap_or(0),
            url: url.to_string(),
        })
    })
}

/// The latest release on GitHub, compared with this build.
#[tauri::command]
pub async fn update_check() -> Result<UpdateInfo, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let response = client()?
        .get(releases_url())
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|e| format!("GitHub couldn't be reached: {e}"))?;
    match response.status().as_u16() {
        200 => {}
        404 => {
            return Ok(UpdateInfo {
                latest: current.clone(),
                current,
                newer: false,
                name: String::new(),
                notes: String::new(),
                page: format!("https://github.com/{REPO}/releases"),
                published: None,
                installer: None,
                app: None,
                self_update: can_self_update(),
                staged: staged_version(),
            })
        }
        403 | 429 => return Err("GitHub is limiting requests from this network for now. Try again in a while.".into()),
        s => return Err(format!("GitHub answered {s}.")),
    }
    let release: Value = response.json().await.map_err(|e| e.to_string())?;
    let tag = release["tag_name"].as_str().unwrap_or_default().to_string();
    let latest = tag.trim_start_matches(['v', 'V']).to_string();
    Ok(UpdateInfo {
        newer: newer_than_this(&latest),
        current,
        name: release["name"].as_str().filter(|n| !n.is_empty()).unwrap_or(&tag).to_string(),
        notes: release["body"].as_str().unwrap_or_default().to_string(),
        page: release["html_url"].as_str().unwrap_or_default().to_string(),
        published: release["published_at"].as_str().map(String::from),
        installer: find_asset(&release, |n| n.ends_with("-setup.exe")),
        app: find_asset(&release, |n| n == APP_ASSET),
        self_update: can_self_update(),
        staged: staged_version(),
        latest,
    })
}

#[derive(Clone, Serialize)]
pub struct Progress {
    got: u64,
    total: u64,
}

/// Streams `url` into `path` (through `path.part`, so a half-finished
/// download is never mistaken for a whole one).
async fn fetch_to(url: &str, path: &Path, progress: &Channel<Progress>) -> Result<(), String> {
    use std::io::Write;
    let mut response = client()?
        .get(url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("The download failed: {e}"))?;
    let total = response.content_length().unwrap_or(0);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let part = path.with_extension("part");
    let mut file = std::fs::File::create(&part).map_err(|e| e.to_string())?;
    let mut got = 0u64;
    let mut last = 0u64;
    while let Some(chunk) = response.chunk().await.map_err(|e| format!("The download stopped: {e}"))? {
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        got += chunk.len() as u64;
        // A message every 64 KB is plenty for a progress bar.
        if got - last >= 65_536 || got == total {
            last = got;
            let _ = progress.send(Progress { got, total });
        }
    }
    drop(file);
    if total > 0 && got != total {
        let _ = std::fs::remove_file(&part);
        return Err("The download was cut short. Try again.".into());
    }
    let _ = std::fs::remove_file(path);
    std::fs::rename(&part, path).map_err(|e| e.to_string())
}

// ─── Updating in place ──────────────────────────────────────────────────

fn this_exe() -> Option<PathBuf> {
    std::env::current_exe().ok()?.canonicalize().ok().map(|p| {
        // canonicalize gives \\?\C:\…; Explorer and shortcuts want C:\…
        PathBuf::from(p.to_string_lossy().trim_start_matches(r"\\?\").to_string())
    })
}

fn stage_dir() -> Option<PathBuf> {
    Some(this_exe()?.parent()?.join("update"))
}

fn staged_exe() -> Option<PathBuf> {
    Some(stage_dir()?.join(APP_ASSET))
}

/// The version waiting in `update\`, if it's newer than this one.
fn staged_version() -> Option<String> {
    let dir = stage_dir()?;
    let version = std::fs::read_to_string(dir.join("version.txt")).ok()?.trim().to_string();
    (dir.join(APP_ASSET).is_file() && newer_than_this(&version)).then_some(version)
}

/// Development builds (`npm run dev`) never replace themselves, and an
/// install the app can't write to (Program Files) uses the installer.
fn can_self_update() -> bool {
    if cfg!(debug_assertions) {
        return false;
    }
    let Some(dir) = stage_dir() else { return false };
    if std::fs::create_dir_all(&dir).is_err() {
        return false;
    }
    let probe = dir.join(".write-test");
    let ok = std::fs::write(&probe, b"ok").is_ok();
    let _ = std::fs::remove_file(probe);
    ok
}

/// Looks like a Windows program, and not a truncated one.
fn is_program(path: &Path) -> bool {
    use std::io::Read;
    let mut head = [0u8; 2];
    let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    size > 1_000_000 && std::fs::File::open(path).and_then(|mut f| f.read_exact(&mut head)).is_ok() && &head == b"MZ"
}

/// Downloads the release's `arayashiki.exe` into `update\`, for the next
/// restart.
#[tauri::command]
pub async fn update_stage(url: String, version: String, progress: Channel<Progress>) -> Result<(), String> {
    let name = url.rsplit('/').next().unwrap_or_default();
    if !url.starts_with(&download_prefix()) || !name.eq_ignore_ascii_case(APP_ASSET) {
        return Err("That isn't an Arayashiki release.".into());
    }
    if !newer_than_this(&version) {
        return Err("That version isn't newer than this one.".into());
    }
    if !can_self_update() {
        return Err("This copy of Arayashiki can't update itself.".into());
    }
    let dir = stage_dir().ok_or("The app's folder couldn't be found.")?;
    let exe = dir.join(APP_ASSET);
    // A newer version may be half-swapped in by now: start clean.
    let _ = std::fs::remove_file(dir.join("version.txt"));
    fetch_to(&url, &exe, &progress).await?;
    if !is_program(&exe) {
        let _ = std::fs::remove_file(&exe);
        return Err("What GitHub sent isn't the app. Try again later.".into());
    }
    std::fs::write(dir.join("version.txt"), version.trim()).map_err(|e| e.to_string())
}

/// The version downloaded and waiting for a restart, if any.
#[tauri::command]
pub fn update_staged() -> Option<String> {
    staged_version()
}

/// Swaps the staged exe in for this one; the version now in place.
fn apply_staged() -> Result<String, String> {
    let version = staged_version().ok_or("No update is waiting.")?;
    let exe = this_exe().ok_or("The app's file couldn't be found.")?;
    let staged = staged_exe().ok_or("The update couldn't be found.")?;
    if !is_program(&staged) {
        let _ = std::fs::remove_file(&staged);
        return Err("The downloaded update was damaged; it will download again.".into());
    }
    let old = exe.with_extension("exe.old");
    let _ = std::fs::remove_file(&old);
    std::fs::rename(&exe, &old).map_err(|e| format!("The app couldn't be moved aside: {e}"))?;
    if let Err(e) = std::fs::rename(&staged, &exe) {
        let _ = std::fs::rename(&old, &exe);
        return Err(format!("The update couldn't be put in place: {e}"));
    }
    if let Some(dir) = stage_dir() {
        let _ = std::fs::remove_file(dir.join("version.txt"));
    }
    crate::install::record_version(&version);
    Ok(version)
}

/// Starts the app again with the same arguments, telling the new process
/// to wait until this one has gone (so the single-instance check doesn't
/// hand it back to us).
fn relaunch(args: &[String]) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    let exe = this_exe().ok_or("The app's file couldn't be found.")?;
    let mut keep = Vec::new();
    let mut it = args.iter().skip(1);
    while let Some(a) = it.next() {
        if a == "--after-update" {
            it.next();
        } else if a != "--install" {
            keep.push(a.clone());
        }
    }
    std::process::Command::new(exe)
        .args(keep)
        .arg("--after-update")
        .arg(std::process::id().to_string())
        .creation_flags(0x0000_0008) // DETACHED_PROCESS
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("The new version didn't start: {e}"))
}

/// Installs the downloaded update now: swaps it in, starts it, and closes.
#[tauri::command]
pub fn update_restart(app: tauri::AppHandle) -> Result<(), String> {
    apply_staged()?;
    relaunch(&std::env::args().collect::<Vec<_>>())?;
    crate::bridge::stop(&app);
    crate::local::shutdown(&app);
    app.exit(0);
    Ok(())
}

/// Waits (up to 15 s) for the process an update restarted from to end.
fn wait_for(pid: u32) {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{OpenProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE};
    // SAFETY: plain Win32 calls on a handle we open and close here.
    unsafe {
        let handle = OpenProcess(PROCESS_SYNCHRONIZE, 0, pid);
        if !handle.is_null() {
            WaitForSingleObject(handle, 15_000);
            CloseHandle(handle);
        }
    }
}

/// Before the window opens: finishes an update that restarted the app,
/// tidies the last one away, and swaps in one waiting from last time.
/// True when this process should end (the new version is starting).
pub fn at_launch(args: &[String]) -> bool {
    if let Some(pid) = args.iter().position(|a| a == "--after-update").and_then(|i| args.get(i + 1)?.parse().ok()) {
        wait_for(pid);
    }
    if let Some(exe) = this_exe() {
        let _ = std::fs::remove_file(exe.with_extension("exe.old"));
    }
    if cfg!(debug_assertions) {
        return false;
    }
    if staged_version().is_none() {
        // A version this one already is (or passed): not worth keeping.
        if let Some(dir) = stage_dir().filter(|d| d.join("version.txt").exists()) {
            let _ = std::fs::remove_dir_all(dir);
        }
        return false;
    }
    match apply_staged() {
        Ok(_) => relaunch(args).is_ok(),
        Err(_) => false,
    }
}

// ─── The installer, for releases without the exe ────────────────────────

fn check_installer(url: &str) -> Result<String, String> {
    let name = url.rsplit('/').next().unwrap_or_default();
    if !url.starts_with(&download_prefix()) || !name.to_lowercase().ends_with("-setup.exe") || name.contains(['\\', ':', '?', '#']) {
        return Err("That isn't an Arayashiki installer.".into());
    }
    Ok(name.to_string())
}

/// Downloads the installer into the temp folder; its path.
#[tauri::command]
pub async fn update_download(url: String, progress: Channel<Progress>) -> Result<String, String> {
    let name = check_installer(&url)?;
    let path = std::env::temp_dir().join("arayashiki-update").join(&name);
    fetch_to(&url, &path, &progress).await?;
    Ok(path.to_string_lossy().to_string())
}

/// Starts a downloaded installer and closes the app.
#[tauri::command]
pub fn update_install(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    let dir = std::env::temp_dir().join("arayashiki-update");
    let ok = path.parent().map(|p| p == dir).unwrap_or(false)
        && path.file_name().map(|n| n.to_string_lossy().to_lowercase().ends_with("-setup.exe")).unwrap_or(false)
        && path.is_file();
    if !ok {
        return Err("That installer isn't there any more. Download it again.".into());
    }
    std::process::Command::new(&path).spawn().map_err(|e| format!("The installer didn't start: {e}"))?;
    crate::bridge::stop(&app);
    crate::local::shutdown(&app);
    app.exit(0);
    Ok(())
}

/// Opens a web page (https only) in the default browser.
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|e| e.to_string())?;
    if parsed.scheme() != "https" {
        return Err("Only https links are opened.".into());
    }
    std::process::Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", parsed.as_str()])
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions_compare() {
        assert!(version_parts("v1.0.1") > version_parts("1.0.0"));
        assert!(version_parts("1.10.0") > version_parts("1.9.9"));
        assert_eq!(version_parts("v1.2"), [1, 2, 0]);
        assert_eq!(version_parts("1.2.3-beta.1"), [1, 2, 3]);
    }

    #[test]
    fn only_this_repos_installers() {
        assert!(check_installer("https://github.com/woogi999/arayashiki/releases/download/v1.0.0/Arayashiki_1.0.0_x64-setup.exe").is_ok());
        assert!(check_installer("https://github.com/woogi999/arayashiki/releases/download/v1.0.2/Arayashiki-Setup.exe").is_ok());
        assert!(check_installer("https://github.com/someone/else/releases/download/v1/x-setup.exe").is_err());
        assert!(check_installer("https://github.com/woogi999/arayashiki/releases/download/v1/readme.txt").is_err());
    }
}
