// Arayashiki-Setup.exe: the installer that never needs building again. It
// asks GitHub's API for the latest release, downloads that release's
// `arayashiki.exe` into %LOCALAPPDATA%\Arayashiki (installing Microsoft's
// WebView2 first on the rare PC without it), and starts it with
// `--install`; the app makes its own shortcuts and Settings → Apps entry
// (src-tauri/src/install.rs) and keeps itself up to date from then on.
//
// A release from before the app was published on its own (only the NSIS
// installer) gets that installer downloaded and run instead.
//
//   Arayashiki-Setup.exe [--to <folder>] [--no-launch]   (the flags are for testing)

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use std::sync::Mutex;

use windows_sys::Win32::Foundation::{HWND, LPARAM, S_OK, WPARAM};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::Controls::*;
use windows_sys::Win32::UI::WindowsAndMessaging::{SendMessageW, IDCANCEL};

const REPO: &str = "woogi999/arayashiki";
const APP: &str = "arayashiki.exe";
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
/// Microsoft's small WebView2 bootstrapper.
const WEBVIEW2: &str = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";

/// What the dialog shows, written by the download thread.
struct Shown {
    step: String,
    got: u64,
    total: u64,
    /// The program to start once it's all done, and its arguments; or what went wrong.
    outcome: Option<Result<(PathBuf, Vec<String>), String>>,
}

static SHOWN: Mutex<Shown> = Mutex::new(Shown {
    step: String::new(),
    got: 0,
    total: 0,
    outcome: None,
});
static CANCELLED: AtomicBool = AtomicBool::new(false);
static MARQUEE: AtomicIsize = AtomicIsize::new(-1);

fn step(text: &str) {
    let mut s = SHOWN.lock().unwrap();
    s.step = text.to_string();
    s.got = 0;
    s.total = 0;
}

fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent(concat!("Arayashiki-Setup/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(std::time::Duration::from_secs(20))
        .timeout(std::time::Duration::from_secs(1800))
        .build()
        .map_err(|e| e.to_string())
}

/// Streams `url` into `path`, through `path.part`.
fn download(url: &str, path: &Path) -> Result<(), String> {
    let mut response = client()?
        .get(url)
        .send()
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("The download failed: {e}"))?;
    let total = response.content_length().unwrap_or(0);
    SHOWN.lock().unwrap().total = total;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("The folder couldn't be made: {e}"))?;
    }
    let part = path.with_extension("part");
    let mut file = std::fs::File::create(&part).map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; 64 * 1024];
    let mut got = 0u64;
    loop {
        if CANCELLED.load(Ordering::Relaxed) {
            drop(file);
            let _ = std::fs::remove_file(&part);
            return Err(String::new());
        }
        let n = response
            .read(&mut buf)
            .map_err(|e| format!("The download stopped: {e}"))?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        got += n as u64;
        SHOWN.lock().unwrap().got = got;
    }
    drop(file);
    if total > 0 && got != total {
        let _ = std::fs::remove_file(&part);
        return Err("The download was cut short. Check your connection and try again.".into());
    }
    let _ = std::fs::remove_file(path);
    std::fs::rename(&part, path).map_err(|e| e.to_string())
}

fn has_webview2() -> bool {
    use std::os::windows::process::CommandExt;
    const CLIENT: &str = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
    [
        format!(r"HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{CLIENT}"),
        format!(r"HKLM\SOFTWARE\Microsoft\EdgeUpdate\Clients\{CLIENT}"),
        format!(r"HKCU\Software\Microsoft\EdgeUpdate\Clients\{CLIENT}"),
    ]
    .iter()
    .any(|key| {
        std::process::Command::new("reg")
            .args(["query", key, "/v", "pv"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map(|o| o.status.success() && !String::from_utf8_lossy(&o.stdout).contains("0.0.0.0"))
            .unwrap_or(false)
    })
}

/// Everything but the dialog: what to start when it's done.
fn work(dir: &Path) -> Result<(PathBuf, Vec<String>), String> {
    step("Finding the latest version on GitHub…");
    let release: serde_json::Value = client()?
        .get(format!(
            "https://api.github.com/repos/{REPO}/releases/latest"
        ))
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .map_err(|e| format!("GitHub couldn't be reached: {e}"))
        .and_then(|r| match r.status().as_u16() {
            200 => r.json().map_err(|e| e.to_string()),
            403 | 429 => Err(
                "GitHub is limiting requests from this network for now. Try again in a while."
                    .into(),
            ),
            s => Err(format!("GitHub answered {s}.")),
        })?;
    let version = release["tag_name"]
        .as_str()
        .unwrap_or("")
        .trim_start_matches(['v', 'V'])
        .to_string();
    let prefix = format!("https://github.com/{REPO}/releases/download/");
    let asset = |pick: &dyn Fn(&str) -> bool| {
        release["assets"].as_array()?.iter().find_map(|a| {
            let name = a["name"].as_str()?.to_lowercase();
            let url = a["browser_download_url"].as_str()?;
            (pick(&name) && url.starts_with(&prefix)).then(|| url.to_string())
        })
    };

    if !has_webview2() {
        step("Installing Microsoft WebView2, which Arayashiki runs on…");
        MARQUEE.store(1, Ordering::Relaxed);
        let setup = std::env::temp_dir().join("MicrosoftEdgeWebview2Setup.exe");
        download(WEBVIEW2, &setup)?;
        let _ = std::process::Command::new(&setup)
            .args(["/silent", "/install"])
            .status();
        let _ = std::fs::remove_file(setup);
        MARQUEE.store(0, Ordering::Relaxed);
    }

    if let Some(url) = asset(&|n| n == APP) {
        step(&format!("Downloading Arayashiki {version}…"));
        let staged = dir.join("update").join(APP);
        download(&url, &staged)?;
        let exe = dir.join(APP);
        // A copy that's open can't be overwritten, only moved aside.
        let old = dir.join("arayashiki.exe.old");
        let _ = std::fs::remove_file(&old);
        if exe.exists() {
            std::fs::rename(&exe, &old)
                .map_err(|e| format!("Arayashiki is open; close it and try again ({e})."))?;
        }
        std::fs::rename(&staged, &exe).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_dir(dir.join("update"));
        return Ok((exe, vec!["--install".into()]));
    }
    // Older releases: their own installer.
    let url = asset(&|n| n.ends_with("_x64-setup.exe"))
        .ok_or("The latest release has nothing to install yet. Try again later.")?;
    step(&format!("Downloading Arayashiki {version}…"));
    let setup = std::env::temp_dir()
        .join("arayashiki-update")
        .join(url.rsplit('/').next().unwrap_or("setup.exe"));
    download(&url, &setup)?;
    Ok((setup, Vec::new()))
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}

unsafe extern "system" fn callback(
    hwnd: HWND,
    msg: TASKDIALOG_NOTIFICATIONS,
    wparam: WPARAM,
    _: LPARAM,
    _: isize,
) -> i32 {
    match msg {
        TDN_CREATED => {
            SendMessageW(
                hwnd,
                TDM_SET_PROGRESS_BAR_RANGE as u32,
                0,
                (1000 << 16) as LPARAM,
            );
        }
        TDN_BUTTON_CLICKED => {
            // Cancel while it's still going: stop the download, then close.
            if wparam as i32 == IDCANCEL && SHOWN.lock().unwrap().outcome.is_none() {
                CANCELLED.store(true, Ordering::Relaxed);
            }
            return S_OK;
        }
        TDN_TIMER => {
            let s = SHOWN.lock().unwrap();
            if s.outcome.is_some() {
                drop(s);
                SendMessageW(hwnd, TDM_CLICK_BUTTON as u32, IDCANCEL as WPARAM, 0);
                return S_OK;
            }
            let marquee = MARQUEE.swap(-1, Ordering::Relaxed);
            if marquee >= 0 {
                SendMessageW(
                    hwnd,
                    TDM_SET_MARQUEE_PROGRESS_BAR as u32,
                    marquee as WPARAM,
                    0,
                );
                SendMessageW(
                    hwnd,
                    TDM_SET_PROGRESS_BAR_MARQUEE as u32,
                    marquee as WPARAM,
                    30,
                );
            }
            let mb = |b: u64| b as f64 / 1_048_576.0;
            let text = if s.total > 0 {
                format!("{}\n{:.1} MB of {:.1} MB", s.step, mb(s.got), mb(s.total))
            } else {
                format!("{}\n", s.step)
            };
            let pos = if s.total > 0 {
                (s.got * 1000 / s.total) as usize
            } else {
                0
            };
            drop(s);
            let text = wide(&text);
            SendMessageW(
                hwnd,
                TDM_SET_ELEMENT_TEXT as u32,
                TDE_CONTENT as WPARAM,
                text.as_ptr() as LPARAM,
            );
            SendMessageW(hwnd, TDM_SET_PROGRESS_BAR_POS as u32, pos, 0);
        }
        _ => {}
    }
    S_OK
}

/// The task dialog, with a progress bar, until the work is done or cancelled.
fn show_progress() {
    let title = wide("Arayashiki Setup");
    let heading = wide("Installing Arayashiki");
    let body = wide("Starting…\n");
    // SAFETY: the config is zeroed and filled with pointers that outlive the call.
    unsafe {
        let mut config: TASKDIALOGCONFIG = std::mem::zeroed();
        config.cbSize = std::mem::size_of::<TASKDIALOGCONFIG>() as u32;
        config.hInstance = GetModuleHandleW(std::ptr::null());
        config.dwFlags = TDF_SHOW_PROGRESS_BAR
            | TDF_CALLBACK_TIMER
            | TDF_ALLOW_DIALOG_CANCELLATION
            | TDF_POSITION_RELATIVE_TO_WINDOW;
        config.dwCommonButtons = TDCBF_CANCEL_BUTTON;
        config.pszWindowTitle = title.as_ptr();
        // The icon build.rs embedded (tauri-winres gives it ID 32512).
        config.Anonymous1.pszMainIcon = 32512 as *const u16;
        config.pszMainInstruction = heading.as_ptr();
        config.pszContent = body.as_ptr();
        config.pfCallback = Some(callback);
        config.cxWidth = 260;
        let hr = TaskDialogIndirect(
            &config,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        );
        if hr < 0 {
            // Without its icon (a stripped build), try again plain.
            config.Anonymous1.pszMainIcon = TD_INFORMATION_ICON;
            TaskDialogIndirect(
                &config,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            );
        }
    }
}

fn show_error(text: &str) {
    let (title, heading, body) = (
        wide("Arayashiki Setup"),
        wide("Arayashiki wasn't installed"),
        wide(text),
    );
    // SAFETY: as above.
    unsafe {
        let mut config: TASKDIALOGCONFIG = std::mem::zeroed();
        config.cbSize = std::mem::size_of::<TASKDIALOGCONFIG>() as u32;
        config.dwCommonButtons = TDCBF_CLOSE_BUTTON;
        config.pszWindowTitle = title.as_ptr();
        config.Anonymous1.pszMainIcon = TD_ERROR_ICON;
        config.pszMainInstruction = heading.as_ptr();
        config.pszContent = body.as_ptr();
        TaskDialogIndirect(
            &config,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        );
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let dir = args
        .iter()
        .position(|a| a == "--to")
        .and_then(|i| args.get(i + 1))
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_else(|_| ".".into()))
                .join("Arayashiki")
        });
    let launch = !args.iter().any(|a| a == "--no-launch");

    std::thread::spawn(move || {
        let outcome = work(&dir);
        SHOWN.lock().unwrap().outcome = Some(outcome);
    });
    show_progress();

    let outcome = SHOWN.lock().unwrap().outcome.take();
    match outcome {
        Some(Ok((program, program_args))) => {
            if launch {
                if let Err(e) = std::process::Command::new(&program)
                    .args(program_args)
                    .spawn()
                {
                    show_error(&format!("It downloaded, but didn't start: {e}"));
                }
            }
        }
        Some(Err(e)) if !e.is_empty() => show_error(&e),
        // Cancelled: the thread tidies its download away; nothing to say.
        _ => {
            CANCELLED.store(true, Ordering::Relaxed);
            std::thread::sleep(std::time::Duration::from_millis(300));
        }
    }
}
