// Arayashiki's desktop shell. The editor and the simulator are the
// web UI (../src) and the engine (../core); this adds what a webview can't
// do on its own:
//
//   * Roblox assets (pictures, sounds, decals, models), by every route a
//     desktop app has, including the Roblox client's own cache (roblox.rs).
//   * Opening and saving codes as .txt files with the system's dialogs.
//   * Taking a moveset from outside: `arayashiki --open <file>` (what
//     the CLI's `sbs open` and the MCP server's `open_in_app` run). A second
//     launch hands its file to the window already open.
//   * Checking GitHub for a newer release and installing it (updates.rs).
//   * Free AI models on this PC: llama.cpp's server and GGUF models (local.rs).

mod account;
mod ai;
mod bridge;
mod files;
mod local;
mod roblox;
mod updates;

use std::sync::{Arc, Mutex};

use account::{Account, Status as AccountStatus, User};
use roblox::{AssetInfo, Assets, IndexStatus, SharedAssets};

use serde::Serialize;
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

/// A moveset code arriving from a file.
#[derive(Clone, Serialize)]
struct OpenRequest {
    text: String,
    name: Option<String>,
    file: Option<String>,
}

/// What the command line asked to open at launch, until the UI takes it.
struct Pending(Mutex<Option<OpenRequest>>);

fn read_request(path: &str, name: Option<String>) -> Option<OpenRequest> {
    let text = std::fs::read_to_string(path).ok()?;
    Some(OpenRequest {
        text: text.trim().to_string(),
        name,
        file: Some(path.to_string()),
    })
}

/// `--open <file> [--name <name>]`, or a bare .txt path (a file dropped on
/// the executable, or opened with it).
fn request_from_args(args: &[String]) -> Option<OpenRequest> {
    let name = args
        .iter()
        .position(|a| a == "--name")
        .and_then(|i| args.get(i + 1).cloned());
    if let Some(i) = args.iter().position(|a| a == "--open") {
        return read_request(args.get(i + 1)?, name);
    }
    args.iter()
        .skip(1)
        .find(|a| a.to_lowercase().ends_with(".txt"))
        .and_then(|path| read_request(path, name))
}

#[tauri::command]
fn take_pending_open(state: tauri::State<Pending>) -> Option<OpenRequest> {
    state.0.lock().ok()?.take()
}

// ─── Roblox assets ──────────────────────────────────────────────────────

/// Fetches an asset by every route and says what it is and where it came
/// from. A decal or model comes back as the image or sound inside it.
#[tauri::command]
async fn asset_fetch(assets: tauri::State<'_, SharedAssets>, id: String) -> Result<AssetInfo, String> {
    assets.inner().clone().fetch(&id, 0).await
}

/// An asset's name, type and creator, without fetching the file.
#[tauri::command]
async fn asset_describe(assets: tauri::State<'_, SharedAssets>, id: String) -> Result<AssetInfo, String> {
    assets.inner().clone().describe(&id).await
}

/// A model's own bytes (an accessory), not unwrapped to what it holds.
#[tauri::command]
async fn model_fetch(assets: tauri::State<'_, SharedAssets>, id: String) -> Result<tauri::ipc::Response, String> {
    assets.inner().clone().model(&id).await.map(tauri::ipc::Response::new)
}

/// A fetched asset's bytes.
#[tauri::command]
fn asset_read(assets: tauri::State<'_, SharedAssets>, id: String) -> Result<tauri::ipc::Response, String> {
    assets.read(&id).map(tauri::ipc::Response::new)
}

#[tauri::command]
fn assets_status(assets: tauri::State<'_, SharedAssets>) -> IndexStatus {
    assets.status()
}

/// Re-reads the Roblox client's cache for anything new.
#[tauri::command]
async fn assets_reindex(assets: tauri::State<'_, SharedAssets>) -> Result<usize, String> {
    let assets = assets.inner().clone();
    tauri::async_runtime::spawn_blocking(move || assets.build_index()).await.map_err(|e| e.to_string())?
}

/// Deletes the assets this app downloaded (the Roblox client's cache is
/// never touched).
#[tauri::command]
fn assets_clear(assets: tauri::State<'_, SharedAssets>) -> Result<usize, String> {
    assets.clear()
}

// ─── Signing in with Roblox (account.rs) ──────────────────────────────

type SharedAccount = Arc<Account>;

#[tauri::command]
fn account_status(account: tauri::State<'_, SharedAccount>) -> AccountStatus {
    account.status()
}

/// Opens Roblox's login page in its own window and waits for the sign-in.
#[tauri::command]
async fn account_sign_in(app: tauri::AppHandle, account: tauri::State<'_, SharedAccount>) -> Result<User, String> {
    account.inner().clone().sign_in(app).await
}

#[tauri::command]
fn account_cancel(account: tauri::State<'_, SharedAccount>) {
    account.cancel();
}

#[tauri::command]
async fn account_sign_out(account: tauri::State<'_, SharedAccount>) -> Result<(), String> {
    account.inner().clone().sign_out().await;
    Ok(())
}

/// The signed-in user, refreshed from Roblox (name, picture).
#[tauri::command]
async fn account_refresh(account: tauri::State<'_, SharedAccount>) -> Result<Option<User>, String> {
    Ok(account.inner().clone().refresh_user().await)
}

/// An avatar (the signed-in user's when no ID is given).
#[tauri::command]
async fn roblox_avatar(
    assets: tauri::State<'_, SharedAssets>,
    account: tauri::State<'_, SharedAccount>,
    user_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let id = match user_id {
        Some(id) => id,
        None => account.status().user.map(|u| u.id).ok_or("Not signed in")?,
    };
    assets.inner().clone().avatar(&id).await
}

// ─── Uploading (the Progress Bar Maker's pictures) ──────────────────────

/// A request's raw body, with its details as URL-encoded JSON in `x-meta`.
pub(crate) fn raw_request(request: &tauri::ipc::Request) -> Result<(Vec<u8>, serde_json::Value), String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected the file's bytes".into());
    };
    let meta = request
        .headers()
        .get("x-meta")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| url::form_urlencoded::parse(format!("m={v}").as_bytes()).next().map(|(_, m)| m.to_string()))
        .and_then(|m| serde_json::from_str(&m).ok())
        .unwrap_or_default();
    Ok((bytes.clone(), meta))
}

/// Uploads a PNG as a decal on the signed-in account; its decal and image IDs.
#[tauri::command]
async fn roblox_upload(
    assets: tauri::State<'_, SharedAssets>,
    request: tauri::ipc::Request<'_>,
) -> Result<roblox::Uploaded, String> {
    let (png, meta) = raw_request(&request)?;
    if !png.starts_with(&[0x89, b'P', b'N', b'G']) {
        return Err("Only PNG pictures are uploaded".into());
    }
    let name = meta["name"].as_str().unwrap_or("Progress bar").to_string();
    let description = meta["description"].as_str().unwrap_or_default().to_string();
    assets.inner().clone().upload_decal(png, &name, &description).await
}

// ─── Files ──────────────────────────────────────────────────────────────

/// Asks where to save and writes the bytes there (a picture, a zip, a
/// design file); the path, or None if cancelled.
#[tauri::command]
async fn save_bytes(app: tauri::AppHandle, request: tauri::ipc::Request<'_>) -> Result<Option<String>, String> {
    let (bytes, meta) = raw_request(&request)?;
    let name = meta["name"].as_str().unwrap_or("file").to_string();
    let label = meta["label"].as_str().unwrap_or("File").to_string();
    // `folder` ("pictures", "videos") saves there without asking.
    let Some(path) = files::pick_path(&app, &name, &label, meta["folder"].as_str())? else {
        return Ok(None);
    };
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

/// Asks for a text file (a design file) and returns its name and text, or None.
#[tauri::command]
async fn open_text(app: tauri::AppHandle, label: String, extensions: Vec<String>) -> Result<Option<(String, String)>, String> {
    let exts: Vec<&str> = extensions.iter().map(String::as_str).collect();
    let Some(picked) = app.dialog().file().set_title("Open").add_filter(label, &exts).blocking_pick_file() else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    let name = path.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(Some((name, text)))
}

/// Asks for a .txt and returns the code in it, or None if cancelled.
#[tauri::command]
async fn open_code_file(app: tauri::AppHandle) -> Result<Option<OpenRequest>, String> {
    let Some(picked) = app
        .dialog()
        .file()
        .set_title("Open a Skill Builder code")
        .add_filter("Skill Builder code", &["txt"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    let name = path.file_stem().map(|s| s.to_string_lossy().to_string());
    read_request(&path.to_string_lossy(), name)
        .map(Some)
        .ok_or_else(|| "That file couldn't be read.".to_string())
}

/// Asks where to save and writes the code there; the path, or None if
/// cancelled.
#[tauri::command]
async fn save_code_file(
    app: tauri::AppHandle,
    name: String,
    text: String,
) -> Result<Option<String>, String> {
    let safe: String = name
        .chars()
        .map(|c| if r#"<>:"/\|?*"#.contains(c) || c.is_control() { '_' } else { c })
        .collect();
    let Some(picked) = app
        .dialog()
        .file()
        .set_title("Save the code")
        .add_filter("Skill Builder code", &["txt"])
        .set_file_name(format!("{}.txt", safe.trim()))
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

/// Reads a .txt the app opened or saved before (a recent file).
#[tauri::command]
fn read_code_file(path: String) -> Result<OpenRequest, String> {
    if !path.to_lowercase().ends_with(".txt") {
        return Err("Only .txt files are opened.".into());
    }
    let name = std::path::Path::new(&path).file_stem().map(|s| s.to_string_lossy().to_string());
    read_request(&path, name).ok_or_else(|| "That file isn't there any more.".to_string())
}

/// Writes a code back to the .txt it came from (or was last saved to).
#[tauri::command]
fn write_code_file(path: String, text: String) -> Result<(), String> {
    if !path.to_lowercase().ends_with(".txt") {
        return Err("Only .txt files are written.".into());
    }
    std::fs::write(&path, text).map_err(|e| e.to_string())
}

/// Appends a line to ui.log in the app's config folder: the UI's errors,
/// for bug reports (the window has no console in release builds).
#[tauri::command]
fn ui_log(app: tauri::AppHandle, line: String) {
    use std::io::Write;
    if let Ok(dir) = app.path().app_config_dir() {
        let path = dir.join("ui.log");
        // Kept small: start over past 1 MB.
        if std::fs::metadata(&path).map(|m| m.len() > 1_000_000).unwrap_or(false) {
            let _ = std::fs::remove_file(&path);
        }
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(f, "{line}");
        }
    }
}

/// Closes the window for good (after the UI has asked about unsaved work).
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    bridge::stop(&app);
    local::shutdown(&app);
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    // An MCP server over stdio for AI apps: no window, it talks to the
    // running app (starting it if needed) through the bridge.
    if args.iter().any(|a| a == "--mcp") {
        bridge::run_mcp_proxy();
        return;
    }
    tauri::Builder::default()
        // First, so a second launch hands over its file and quits.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(request) = request_from_args(&args) {
                let _ = app.emit("open-code", request);
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        // A reload (or the first load) means the UI isn't answering the bridge yet.
        .on_page_load(|webview, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Started) {
                if let Some(b) = webview.try_state::<bridge::SharedBridge>() {
                    bridge::not_ready(&b);
                }
            }
        })
        .manage(Pending(Mutex::new(request_from_args(&args))))
        .setup(|app| {
            roblox::forget_old_key();
            // Closing asks the UI first, so it can offer to save.
            if let Some(window) = app.get_webview_window("main") {
                let w = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = w.emit("close-requested", ());
                    }
                });
            }
            let account: SharedAccount = Arc::new(Account::new(app.path().app_config_dir()?));
            app.manage(account.clone());
            let dir = app.path().app_cache_dir()?.join("assets");
            let assets: SharedAssets = Arc::new(Assets::new(dir, account));
            app.manage(assets.clone());
            app.manage(files::Streams::default());
            app.manage(local::SharedLocal::default());
            // The bridge AI tools reach the app by (bridge.rs).
            let shared_bridge: bridge::SharedBridge = Default::default();
            app.manage(shared_bridge.clone());
            if let Err(e) = bridge::start(app.handle().clone(), shared_bridge) {
                eprintln!("The AI bridge didn't start: {e}");
            }
            // Index the Roblox client's cache in the background; the first
            // time reads tens of thousands of files, later times only what's new.
            std::thread::spawn(move || {
                let _ = assets.build_index();
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            take_pending_open,
            asset_fetch,
            asset_describe,
            asset_read,
            model_fetch,
            assets_status,
            assets_reindex,
            assets_clear,
            write_code_file,
            read_code_file,
            quit_app,
            ui_log,
            account_status,
            account_sign_in,
            account_cancel,
            account_sign_out,
            account_refresh,
            roblox_avatar,
            roblox_upload,
            save_bytes,
            open_text,
            open_code_file,
            save_code_file,
            files::stream_create,
            files::stream_write,
            files::stream_close,
            files::stream_abort,
            files::reveal_file,
            files::folder_create,
            files::folder_write,
            bridge::bridge_reply,
            bridge::bridge_ready,
            ai::ai_key_set,
            ai::ai_key_status,
            ai::ai_fetch,
            ai::ai_clients,
            ai::connect_ai_client,
            ai::app_exe_path,
            updates::update_check,
            updates::update_download,
            updates::update_install,
            updates::open_url,
            local::local_status,
            local::local_install_engine,
            local::local_download_model,
            local::local_cancel,
            local::local_delete_model,
            local::local_start,
            local::local_stop
        ])
        .build(tauri::generate_context!())
        .expect("error while running Arayashiki")
        .run(|app, event| {
            // However it closes, a local model's server goes with it.
            if let tauri::RunEvent::Exit = event {
                local::shutdown(app);
            }
        });
}
