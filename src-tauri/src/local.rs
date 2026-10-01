// Free AI models on this PC, built in (the assistant's "On this PC"
// service, src/ai/local.js):
//
//   * The engine: llama.cpp's server (github.com/ggml-org/llama.cpp), fetched
//     from its releases the first time: the Vulkan build (NVIDIA, AMD and
//     Intel graphics) or the CPU build. It answers OpenAI's chat API, tools
//     included, so the assistant talks to it as to any other service.
//   * Models: GGUF files from Hugging Face (Qwen, Gemma, gpt-oss…), fetched
//     with progress, resumable, cancellable, and kept in the app's data folder.
//   * The server runs on a free port on 127.0.0.1 only, one model at a time,
//     started when the assistant first needs it and stopped with the app. It
//     wants a key made fresh each start, which only this shell knows and
//     adds to the assistant's requests (ai.rs), so a web page can't use it.

use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::ipc::Channel;
use tauri::Manager;

const ENGINE_REPO: &str = "ggml-org/llama.cpp";
const SERVER_EXE: &str = "llama-server.exe";

#[derive(Default)]
pub struct LocalAi {
    server: Mutex<Option<Running>>,
    cancels: Mutex<HashMap<String, Arc<AtomicBool>>>,
}
pub type SharedLocal = Arc<LocalAi>;

struct Running {
    child: Child,
    key: String,
    model: String,
    ctx: u32,
    gpu: bool,
    port: u16,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct EngineInfo {
    version: String,
    kind: String,
    exe: String,
}

fn root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("local-ai");
    std::fs::create_dir_all(dir.join("models")).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn engine_info(dir: &Path) -> Option<EngineInfo> {
    let info: EngineInfo = serde_json::from_str(&std::fs::read_to_string(dir.join("engine.json")).ok()?).ok()?;
    dir.join("engine").join(&info.exe).is_file().then_some(info)
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(concat!("Arayashiki/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())
}

/// Only plain file names: "Qwen3.5-4B-Q4_K_M.gguf".
fn safe_model_name(file: &str) -> Result<String, String> {
    let ok = file.to_lowercase().ends_with(".gguf")
        && file.len() < 200
        && file.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c));
    ok.then(|| file.to_string()).ok_or_else(|| "That isn't a model file name.".into())
}

#[derive(Clone, Serialize)]
pub struct Progress {
    got: u64,
    total: u64,
}

fn cancel_flag(state: &LocalAi, key: &str) -> Arc<AtomicBool> {
    let flag = Arc::new(AtomicBool::new(false));
    state.cancels.lock().unwrap().insert(key.to_string(), flag.clone());
    flag
}

/// Fetches `url` into `path` (by way of `path.part`, picked up again if a
/// download was cut off), reporting progress; stops if `cancel` is set.
async fn download(url: &str, path: &Path, cancel: &AtomicBool, progress: &Channel<Progress>) -> Result<(), String> {
    let part = path.with_extension(format!("{}.part", path.extension().and_then(|e| e.to_str()).unwrap_or("")));
    let have = std::fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
    let mut req = client()?.get(url);
    if have > 0 {
        req = req.header("Range", format!("bytes={have}-"));
    }
    let mut res = req.send().await.map_err(|e| format!("The download didn't start: {e}"))?;
    let status = res.status().as_u16();
    if !(200..300).contains(&status) {
        return Err(format!("The server answered {status}."));
    }
    let resumed = status == 206;
    let mut got = if resumed { have } else { 0 };
    let total = got + res.content_length().unwrap_or(0);
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .append(resumed)
        .truncate(!resumed)
        .open(&part)
        .map_err(|e| e.to_string())?;
    let mut last = 0u64;
    while let Some(chunk) = res.chunk().await.map_err(|e| format!("The download stopped: {e}. Try again to pick it up."))? {
        if cancel.load(Ordering::Relaxed) {
            return Err("Cancelled.".into());
        }
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        got += chunk.len() as u64;
        if got - last >= 1 << 20 || got == total {
            last = got;
            let _ = progress.send(Progress { got, total });
        }
    }
    drop(file);
    if total > 0 && got < total {
        return Err("The download was cut short. Try again to pick it up.".into());
    }
    std::fs::rename(&part, path).map_err(|e| e.to_string())
}

// ─── What's here ────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct ModelFile {
    file: String,
    size: u64,
    partial: bool,
}

#[derive(Serialize)]
pub struct RunningInfo {
    model: String,
    port: u16,
    ctx: u32,
    gpu: bool,
}

#[derive(Serialize)]
pub struct Status {
    engine: Option<EngineInfo>,
    models: Vec<ModelFile>,
    running: Option<RunningInfo>,
    folder: String,
}

#[tauri::command]
pub fn local_status(app: tauri::AppHandle, state: tauri::State<'_, SharedLocal>) -> Result<Status, String> {
    let dir = root(&app)?;
    let mut models = Vec::new();
    for entry in std::fs::read_dir(dir.join("models")).map_err(|e| e.to_string())?.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        if let Some(base) = name.strip_suffix(".part") {
            models.push(ModelFile { file: base.to_string(), size, partial: true });
        } else if name.to_lowercase().ends_with(".gguf") {
            models.push(ModelFile { file: name, size, partial: false });
        }
    }
    let mut server = state.server.lock().unwrap();
    // A server that quit on its own isn't running.
    if let Some(r) = server.as_mut() {
        if r.child.try_wait().ok().flatten().is_some() {
            *server = None;
        }
    }
    Ok(Status {
        engine: engine_info(&dir),
        models,
        running: server.as_ref().map(|r| RunningInfo { model: r.model.clone(), port: r.port, ctx: r.ctx, gpu: r.gpu }),
        folder: dir.to_string_lossy().to_string(),
    })
}

// ─── The engine ─────────────────────────────────────────────────────────

/// Fetches llama.cpp's newest Windows build ("vulkan" or "cpu") and unpacks it.
#[tauri::command]
pub async fn local_install_engine(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedLocal>,
    kind: String,
    progress: Channel<Progress>,
) -> Result<EngineInfo, String> {
    if kind != "vulkan" && kind != "cpu" {
        return Err("Pick the GPU (Vulkan) or the CPU build.".into());
    }
    let dir = root(&app)?;
    let releases: Value = client()?
        .get(format!("https://api.github.com/repos/{ENGINE_REPO}/releases?per_page=15"))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("GitHub couldn't be reached: {e}"))?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let (version, url) = releases
        .as_array()
        .into_iter()
        .flatten()
        .find_map(|r| {
            let tag = r["tag_name"].as_str()?;
            let want = format!("llama-{tag}-bin-win-{kind}-x64.zip");
            let asset = r["assets"].as_array()?.iter().find(|a| a["name"].as_str() == Some(want.as_str()))?;
            Some((tag.to_string(), asset["browser_download_url"].as_str()?.to_string()))
        })
        .ok_or("No Windows build of the engine was found on GitHub just now. Try again later.")?;
    if !url.starts_with(&format!("https://github.com/{ENGINE_REPO}/releases/download/")) {
        return Err("Unexpected download address.".into());
    }
    let zip = dir.join("engine.zip");
    let cancel = cancel_flag(&state, "engine");
    download(&url, &zip, &cancel, &progress).await?;
    // The engine can't be replaced while it runs.
    stop_server(&state);
    let engine = dir.join("engine");
    let _ = std::fs::remove_dir_all(&engine);
    std::fs::create_dir_all(&engine).map_err(|e| e.to_string())?;
    // Windows' own tar (bsdtar) unpacks zips; another tar on the PATH (Git's) may not.
    let tar = std::env::var_os("SystemRoot")
        .map(|r| PathBuf::from(r).join("System32").join("tar.exe"))
        .filter(|p| p.is_file())
        .unwrap_or_else(|| PathBuf::from("tar"));
    let out = hidden(Command::new(tar))
        .arg("-xf")
        .arg(&zip)
        .arg("-C")
        .arg(&engine)
        .output()
        .map_err(|e| format!("Couldn't unpack the engine: {e}"))?;
    let _ = std::fs::remove_file(&zip);
    if !out.status.success() {
        return Err(format!("Couldn't unpack the engine: {}", String::from_utf8_lossy(&out.stderr)));
    }
    let exe = find_file(&engine, SERVER_EXE).ok_or("The engine's download had no llama-server.exe.")?;
    let info = EngineInfo { version, kind, exe: exe.strip_prefix(&engine).unwrap_or(&exe).to_string_lossy().to_string() };
    std::fs::write(dir.join("engine.json"), serde_json::to_string(&info).unwrap()).map_err(|e| e.to_string())?;
    Ok(info)
}

fn find_file(dir: &Path, name: &str) -> Option<PathBuf> {
    for entry in std::fs::read_dir(dir).ok()?.flatten() {
        let p = entry.path();
        if p.is_dir() {
            if let Some(found) = find_file(&p, name) {
                return Some(found);
            }
        } else if p.file_name().map(|n| n.eq_ignore_ascii_case(name)).unwrap_or(false) {
            return Some(p);
        }
    }
    None
}

// ─── Models ─────────────────────────────────────────────────────────────

/// Fetches a GGUF model from Hugging Face into the models folder.
#[tauri::command]
pub async fn local_download_model(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedLocal>,
    url: String,
    file: String,
    progress: Channel<Progress>,
) -> Result<(), String> {
    let file = safe_model_name(&file)?;
    let parsed = url::Url::parse(&url).map_err(|e| e.to_string())?;
    let ok = parsed.scheme() == "https"
        && parsed.host_str() == Some("huggingface.co")
        && parsed.path().contains("/resolve/")
        && parsed.path().to_lowercase().ends_with(".gguf");
    if !ok {
        return Err("Models come from huggingface.co: a …/resolve/…/model.gguf address.".into());
    }
    let path = root(&app)?.join("models").join(&file);
    let cancel = cancel_flag(&state, &file);
    let result = download(parsed.as_str(), &path, &cancel, &progress).await;
    state.cancels.lock().unwrap().remove(&file);
    result
}

/// Stops a download ("engine", or a model's file name); what came so far is kept to resume.
#[tauri::command]
pub fn local_cancel(state: tauri::State<'_, SharedLocal>, key: String) {
    if let Some(flag) = state.cancels.lock().unwrap().get(&key) {
        flag.store(true, Ordering::Relaxed);
    }
}

/// Deletes a model (or what was downloaded of it).
#[tauri::command]
pub fn local_delete_model(app: tauri::AppHandle, state: tauri::State<'_, SharedLocal>, file: String) -> Result<(), String> {
    let file = safe_model_name(&file)?;
    if state.server.lock().unwrap().as_ref().map(|r| r.model == file).unwrap_or(false) {
        stop_server(&state);
    }
    let models = root(&app)?.join("models");
    let _ = std::fs::remove_file(models.join(format!("{file}.part")));
    match std::fs::remove_file(models.join(&file)) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

// ─── The server ─────────────────────────────────────────────────────────

fn hidden(mut cmd: Command) -> Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

fn stop_server(state: &LocalAi) {
    if let Some(mut r) = state.server.lock().unwrap().take() {
        let _ = r.child.kill();
        let _ = r.child.wait();
    }
}

/// A server left running by a run of the app that didn't close properly.
fn stop_stray(dir: &Path) {
    let pid_file = dir.join("server.pid");
    if let Ok(pid) = std::fs::read_to_string(&pid_file) {
        let pid = pid.trim();
        if pid.chars().all(|c| c.is_ascii_digit()) && !pid.is_empty() {
            let _ = hidden(Command::new("taskkill"))
                .args(["/F", "/FI", &format!("PID eq {pid}"), "/FI", &format!("IMAGENAME eq {SERVER_EXE}")])
                .output();
        }
        let _ = std::fs::remove_file(pid_file);
    }
}

fn free_port() -> Result<u16, String> {
    let l = std::net::TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    Ok(l.local_addr().map_err(|e| e.to_string())?.port())
}

fn log_tail(path: &Path) -> String {
    let text = std::fs::read_to_string(path).unwrap_or_default();
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    lines[lines.len().saturating_sub(6)..].join("\n")
}

/// Starts the server with a model (or keeps the one running with it); its port.
#[tauri::command]
pub async fn local_start(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedLocal>,
    file: String,
    ctx: u32,
    gpu: bool,
) -> Result<u16, String> {
    let file = safe_model_name(&file)?;
    let dir = root(&app)?;
    {
        let mut server = state.server.lock().unwrap();
        if let Some(r) = server.as_mut() {
            let alive = r.child.try_wait().ok().flatten().is_none();
            if alive && r.model == file && r.ctx == ctx && r.gpu == gpu {
                return Ok(r.port);
            }
        }
    }
    stop_server(&state);
    stop_stray(&dir);
    let engine = engine_info(&dir).ok_or("Get the engine first (Settings in the assistant).")?;
    let model = dir.join("models").join(&file);
    if !model.is_file() {
        return Err(format!("{file} isn't downloaded."));
    }
    let port = free_port()?;
    let key = crate::bridge::random_token();
    let log_path = dir.join("server.log");
    let log = std::fs::File::create(&log_path).map_err(|e| e.to_string())?;
    let mut cmd = hidden(Command::new(dir.join("engine").join(&engine.exe)));
    cmd.arg("-m")
        .arg(&model)
        .args(["--host", "127.0.0.1", "--port", &port.to_string(), "--jinja", "-c", &ctx.to_string(), "--alias", &file])
        .args(["-ngl", if gpu { "999" } else { "0" }])
        .args(["--api-key", &key])
        .current_dir(dir.join("engine"))
        .stdin(Stdio::null())
        .stdout(log.try_clone().map_err(|e| e.to_string())?)
        .stderr(log);
    let child = cmd.spawn().map_err(|e| format!("The engine didn't start: {e}"))?;
    let _ = std::fs::write(dir.join("server.pid"), child.id().to_string());
    *state.server.lock().unwrap() = Some(Running { child, key, model: file.clone(), ctx, gpu, port });

    // Loading a big model takes a while: wait for /health to say it's ready.
    let http = client()?;
    let started = Instant::now();
    loop {
        tokio_sleep(Duration::from_millis(400)).await;
        {
            let mut server = state.server.lock().unwrap();
            let Some(r) = server.as_mut() else { return Err("Stopped.".into()) };
            if r.port != port {
                return Err("Another model was started.".into());
            }
            if let Ok(Some(status)) = r.child.try_wait() {
                *server = None;
                return Err(format!("The engine stopped ({status}). It said:\n{}", log_tail(&log_path)));
            }
        }
        if let Ok(res) = http.get(format!("http://127.0.0.1:{port}/health")).send().await {
            if res.status().is_success() {
                return Ok(port);
            }
        }
        if started.elapsed() > Duration::from_secs(300) {
            stop_server(&state);
            return Err(format!("The model took too long to load. The engine said:\n{}", log_tail(&log_path)));
        }
    }
}

async fn tokio_sleep(d: Duration) {
    let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(d)).await;
}

#[tauri::command]
pub fn local_stop(state: tauri::State<'_, SharedLocal>) {
    stop_server(&state);
}

/// The running server's key, for the assistant's requests to it.
pub fn server_key(app: &tauri::AppHandle) -> Option<String> {
    let state = app.try_state::<SharedLocal>()?;
    let server = state.server.lock().ok()?;
    server.as_ref().map(|r| r.key.clone())
}

/// When the app closes: the server goes with it.
pub fn shutdown(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<SharedLocal>() {
        stop_server(&state);
        if let Ok(dir) = root(app) {
            let _ = std::fs::remove_file(dir.join("server.pid"));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_names_are_plain_files() {
        assert!(safe_model_name("Qwen3.5-4B-Q4_K_M.gguf").is_ok());
        assert!(safe_model_name("../evil.gguf").is_err());
        assert!(safe_model_name("model.exe").is_err());
        assert!(safe_model_name("a b.gguf").is_err());
    }
}
