// The bridge: how AI tools reach the running app.
//
// The app listens on 127.0.0.1 (a random port) and writes the port and a
// random token to bridge.json in its config folder, which only this Windows
// user can read. A request needs the token, so a web page can't drive the
// app even though it can reach localhost. Every request is handed to the
// UI as a `bridge-request` event and answered when the UI calls
// `bridge_reply`: the tools themselves live in the UI (src/ai/), next to the
// moveset, the simulator and the 3D view they work on.
//
//   POST /mcp   one MCP JSON-RPC message; the reply (empty for a notification)
//   POST /rpc   { "tool": name, "args": {…} } → the tool's result
//   GET  /health
//
// `arayashiki.exe --mcp` is an MCP server over stdio for AI clients (Claude
// Desktop, Cursor, VS Code…): it starts the app if it isn't running, then
// passes each message to /mcp and prints the reply. No Node needed.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};

/// The app's config folder (%APPDATA%\dev.woogi.skillbuildersim), worked
/// out the way Tauri does, for the `--mcp` proxy that runs without Tauri.
pub fn config_dir() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(|d| PathBuf::from(d).join("dev.woogi.skillbuildersim"))
}

#[derive(Serialize, Deserialize, Clone)]
struct BridgeFile {
    port: u16,
    token: String,
    pid: u32,
    version: String,
}

#[derive(Clone, Serialize)]
struct BridgeRequest {
    id: u64,
    kind: String,
    body: String,
}

#[derive(Default)]
pub struct Bridge {
    next: AtomicU64,
    /// The UI is listening (it says so with `bridge_ready`); until then
    /// requests wait, and /health says 503.
    ready: AtomicBool,
    waiting: Mutex<HashMap<u64, Sender<String>>>,
}

pub type SharedBridge = Arc<Bridge>;

pub(crate) fn random_token() -> String {
    // Good enough for a local secret: the clock, the process and a heap
    // address through a few rounds of mixing.
    let mut x = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(7)
        ^ ((std::process::id() as u64) << 32)
        ^ (Box::into_raw(Box::new(0u8)) as u64);
    let mut out = String::new();
    for _ in 0..4 {
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        out.push_str(&format!("{x:016x}"));
    }
    out
}

/// Starts listening and writes bridge.json. Runs for the app's life.
pub fn start(app: tauri::AppHandle, bridge: SharedBridge) -> Result<(), String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let token = random_token();
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let info = BridgeFile { port, token: token.clone(), pid: std::process::id(), version: app.package_info().version.to_string() };
    std::fs::write(dir.join("bridge.json"), serde_json::to_string_pretty(&info).unwrap_or_default()).map_err(|e| e.to_string())?;
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let app = app.clone();
            let bridge = bridge.clone();
            let token = token.clone();
            std::thread::spawn(move || {
                let _ = serve(stream, &app, &bridge, &token);
            });
        }
    });
    Ok(())
}

/// Removes bridge.json when the app closes, if it's still ours.
pub fn stop(app: &tauri::AppHandle) {
    if let Ok(dir) = app.path().app_config_dir() {
        let file = dir.join("bridge.json");
        if let Ok(text) = std::fs::read_to_string(&file) {
            if serde_json::from_str::<BridgeFile>(&text).map(|b| b.pid == std::process::id()).unwrap_or(false) {
                let _ = std::fs::remove_file(file);
            }
        }
    }
}

struct HttpRequest {
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

fn read_request(stream: &mut TcpStream) -> Result<HttpRequest, String> {
    stream.set_read_timeout(Some(Duration::from_secs(30))).ok();
    let mut reader = BufReader::new(stream.try_clone().map_err(|e| e.to_string())?);
    let mut line = String::new();
    reader.read_line(&mut line).map_err(|e| e.to_string())?;
    let mut parts = line.split_whitespace();
    let method = parts.next().unwrap_or("").to_string();
    let path = parts.next().unwrap_or("").to_string();
    let mut headers = HashMap::new();
    loop {
        let mut h = String::new();
        if reader.read_line(&mut h).map_err(|e| e.to_string())? == 0 || h == "\r\n" || h == "\n" {
            break;
        }
        if let Some((k, v)) = h.split_once(':') {
            headers.insert(k.trim().to_lowercase(), v.trim().to_string());
        }
    }
    let len: usize = headers.get("content-length").and_then(|v| v.parse().ok()).unwrap_or(0);
    if len > 64 * 1024 * 1024 {
        return Err("Too big".into());
    }
    let mut body = vec![0; len];
    reader.read_exact(&mut body).map_err(|e| e.to_string())?;
    Ok(HttpRequest { method, path, headers, body })
}

fn respond(stream: &mut TcpStream, status: &str, body: &str) -> std::io::Result<()> {
    write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )?;
    stream.flush()
}

fn serve(mut stream: TcpStream, app: &tauri::AppHandle, bridge: &Bridge, token: &str) -> Result<(), String> {
    let req = read_request(&mut stream)?;
    if req.method == "GET" && req.path == "/health" {
        return if bridge.ready.load(Ordering::SeqCst) {
            respond(&mut stream, "200 OK", r#"{"ok":true}"#)
        } else {
            respond(&mut stream, "503 Service Unavailable", r#"{"ok":false,"starting":true}"#)
        }
        .map_err(|e| e.to_string());
    }
    // Browsers send an Origin; the tools don't. Together with the token,
    // that keeps web pages out.
    if req.headers.contains_key("origin") || req.headers.get("x-arayashiki-token").map(String::as_str) != Some(token) {
        return respond(&mut stream, "403 Forbidden", r#"{"error":"Forbidden"}"#).map_err(|e| e.to_string());
    }
    let kind = match (req.method.as_str(), req.path.as_str()) {
        ("POST", "/mcp") => "mcp",
        ("POST", "/rpc") => "rpc",
        _ => return respond(&mut stream, "404 Not Found", r#"{"error":"Not found"}"#).map_err(|e| e.to_string()),
    };
    // A request that arrives while the window is still loading waits for it.
    let until = Instant::now() + Duration::from_secs(90);
    while !bridge.ready.load(Ordering::SeqCst) {
        if Instant::now() > until {
            return respond(&mut stream, "503 Service Unavailable", r#"{"error":"The app's window didn't finish loading"}"#).map_err(|e| e.to_string());
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    let id = bridge.next.fetch_add(1, Ordering::Relaxed) + 1;
    let (tx, rx) = channel();
    bridge.waiting.lock().map_err(|e| e.to_string())?.insert(id, tx);
    let body = String::from_utf8_lossy(&req.body).to_string();
    app.emit("bridge-request", BridgeRequest { id, kind: kind.into(), body }).map_err(|e| e.to_string())?;
    // Long enough for a video export.
    let reply = rx.recv_timeout(Duration::from_secs(1800));
    bridge.waiting.lock().map_err(|e| e.to_string())?.remove(&id);
    match reply {
        Ok(text) if text == RELOADED => respond(&mut stream, "503 Service Unavailable", r#"{"error":"The app's window reloaded; ask again"}"#),
        Ok(text) => respond(&mut stream, "200 OK", &text),
        Err(_) => respond(&mut stream, "504 Gateway Timeout", r#"{"error":"The app didn't answer in time"}"#),
    }
    .map_err(|e| e.to_string())
}

/// The page is (re)loading: requests wait until it listens again.
pub fn not_ready(bridge: &Bridge) {
    bridge.ready.store(false, Ordering::SeqCst);
    // Requests the old page was working on will never be answered: let them go.
    if let Ok(mut waiting) = bridge.waiting.lock() {
        for (_, tx) in waiting.drain() {
            let _ = tx.send(RELOADED.into());
        }
    }
}

const RELOADED: &str = "(the window reloaded)";

/// The UI is listening for requests (or, after a reload, again).
#[tauri::command]
pub fn bridge_ready(bridge: tauri::State<'_, SharedBridge>) {
    bridge.ready.store(true, Ordering::SeqCst);
}

/// The UI's answer to a bridge request.
#[tauri::command]
pub fn bridge_reply(bridge: tauri::State<'_, SharedBridge>, id: u64, body: String) {
    if let Some(tx) = bridge.waiting.lock().ok().and_then(|mut w| w.remove(&id)) {
        let _ = tx.send(body);
    }
}

// ─── `arayashiki.exe --mcp`: stdio ↔ the bridge ──────────────────────────

fn read_bridge_file(dir: &Path) -> Option<BridgeFile> {
    serde_json::from_str(&std::fs::read_to_string(dir.join("bridge.json")).ok()?).ok()
}

fn post(info: &BridgeFile, path: &str, body: &str) -> Result<String, String> {
    let mut stream = TcpStream::connect(("127.0.0.1", info.port)).map_err(|e| e.to_string())?;
    stream.set_read_timeout(Some(Duration::from_secs(1900))).ok();
    write!(
        stream,
        "POST {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nX-Arayashiki-Token: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        info.token,
        body.len()
    )
    .map_err(|e| e.to_string())?;
    let mut text = String::new();
    stream.read_to_string(&mut text).map_err(|e| e.to_string())?;
    let (head, body) = text.split_once("\r\n\r\n").ok_or("Bad reply")?;
    if !head.starts_with("HTTP/1.1 200") {
        return Err(format!("The app answered {}", head.lines().next().unwrap_or("?")));
    }
    Ok(body.to_string())
}

fn healthy(info: &BridgeFile) -> bool {
    let Ok(mut stream) = TcpStream::connect_timeout(&([127, 0, 0, 1], info.port).into(), Duration::from_millis(800)) else {
        return false;
    };
    stream.set_read_timeout(Some(Duration::from_secs(3))).ok();
    if write!(stream, "GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n").is_err() {
        return false;
    }
    let mut text = String::new();
    stream.read_to_string(&mut text).is_ok() && text.starts_with("HTTP/1.1 200")
}

/// The running app's bridge, starting the app if it isn't up (and waiting
/// for its window to be ready).
fn connect(dir: &Path) -> Result<BridgeFile, String> {
    if let Some(info) = read_bridge_file(dir) {
        if healthy(&info) {
            return Ok(info);
        }
    }
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    // On its own: not holding the AI client's pipes, and not closed with it.
    let mut command = std::process::Command::new(exe);
    command.stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        command.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
    }
    command.spawn().map_err(|e| format!("Couldn't start Arayashiki: {e}"))?;
    let until = Instant::now() + Duration::from_secs(90);
    while Instant::now() < until {
        std::thread::sleep(Duration::from_millis(400));
        if let Some(info) = read_bridge_file(dir) {
            if healthy(&info) {
                return Ok(info);
            }
        }
    }
    Err("Arayashiki didn't start in time".into())
}

fn error_reply(line: &str, message: &str) -> Option<String> {
    let msg: serde_json::Value = serde_json::from_str(line).ok()?;
    let id = msg.get("id")?.clone();
    Some(serde_json::json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32603, "message": message } }).to_string())
}

/// Runs the stdio MCP server until stdin closes.
pub fn run_mcp_proxy() {
    let Some(dir) = config_dir() else {
        eprintln!("No APPDATA folder");
        return;
    };
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    let mut info: Option<BridgeFile> = None;
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        let line = line.trim().to_string();
        if line.is_empty() {
            continue;
        }
        let mut attempt = 0;
        let reply = loop {
            attempt += 1;
            if info.is_none() {
                match connect(&dir) {
                    Ok(i) => info = Some(i),
                    Err(e) => break error_reply(&line, &e),
                }
            }
            match post(info.as_ref().unwrap(), "/mcp", &line) {
                Ok(body) => break if body.trim().is_empty() { None } else { Some(body) },
                // The app was closed (or restarted): connect again, once.
                Err(e) if attempt < 2 => {
                    let _ = e;
                    info = None;
                }
                Err(e) => break error_reply(&line, &e),
            }
        };
        if let Some(reply) = reply {
            let _ = writeln!(stdout, "{}", reply.trim());
            let _ = stdout.flush();
        }
    }
}
