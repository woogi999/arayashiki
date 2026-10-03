// AI, two ways:
//
//   * The assistant inside the app (src/ai/): the user's own API key for
//     Claude, OpenAI, Gemini, OpenRouter, or a local model (Ollama, LM
//     Studio). Keys live in Windows' Credential Manager, never in the web
//     view: the UI sends requests here with no key, and this puts the key
//     on the way out and streams the answer back.
//   * AI apps on this PC (Claude Desktop, Cursor, VS Code…) through MCP:
//     `connect_ai_client` writes the app into the client's MCP settings,
//     pointing at `arayashiki.exe --mcp` (src-tauri/src/bridge.rs).

use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{json, Value};
use tauri::ipc::Channel;

const SERVICE: &str = "arayashiki-ai";
const PROVIDERS: &[&str] = &["anthropic", "openai", "gemini", "openrouter", "groq", "xai", "deepseek", "mistral", "custom"];

fn entry(provider: &str) -> Result<keyring::Entry, String> {
    if !PROVIDERS.contains(&provider) {
        return Err(format!("Unknown provider {provider}"));
    }
    keyring::Entry::new(SERVICE, provider).map_err(|e| e.to_string())
}

fn key_of(provider: &str) -> Option<String> {
    entry(provider).ok()?.get_password().ok().filter(|k| !k.is_empty())
}

#[tauri::command]
pub fn ai_key_set(provider: String, key: String) -> Result<(), String> {
    let e = entry(&provider)?;
    if key.trim().is_empty() {
        let _ = e.delete_credential();
        return Ok(());
    }
    e.set_password(key.trim()).map_err(|e| e.to_string())
}

/// Which providers have a key saved (never the keys themselves).
#[tauri::command]
pub fn ai_key_status() -> Value {
    let mut out = serde_json::Map::new();
    for p in PROVIDERS {
        out.insert((*p).into(), Value::Bool(key_of(p).is_some()));
    }
    Value::Object(out)
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum AiEvent {
    Head { status: u16, headers: Vec<(String, String)> },
    Chunk { text: String },
    End,
    Error { message: String },
}

fn allowed_url(url: &str) -> bool {
    let Ok(u) = url::Url::parse(url) else { return false };
    match u.scheme() {
        "https" => true,
        "http" => matches!(u.host_str(), Some("localhost") | Some("127.0.0.1") | Some("[::1]")),
        _ => false,
    }
}

/// A request to an AI provider, streamed back over `on_event`: the status
/// and headers, then the body as text as it arrives, then End (or Error).
/// The provider's key, if one is saved, goes on as x-api-key (Anthropic) or
/// a Bearer token (the rest).
#[tauri::command]
pub async fn ai_fetch(
    app: tauri::AppHandle,
    provider: String,
    url: String,
    method: String,
    headers: Vec<(String, String)>,
    body: Option<String>,
    on_event: Channel<AiEvent>,
) -> Result<(), String> {
    if !allowed_url(&url) {
        return Err("Only https addresses (or a model on this PC) are allowed".into());
    }
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let method = reqwest::Method::from_bytes(method.to_uppercase().as_bytes()).map_err(|e| e.to_string())?;
    let mut req = client.request(method, &url);
    for (k, v) in headers {
        let lower = k.to_lowercase();
        if lower == "x-api-key" || lower == "authorization" || lower == "content-length" || lower == "host" {
            continue;
        }
        req = req.header(k, v);
    }
    if provider == "local" {
        // The built-in engine's key for this run (local.rs).
        if let Some(key) = crate::local::server_key(&app) {
            req = req.bearer_auth(key);
        }
    } else if let Some(key) = key_of(&provider) {
        req = if provider == "anthropic" { req.header("x-api-key", key) } else { req.bearer_auth(key) };
    }
    if let Some(body) = body {
        req = req.body(body);
    }
    let mut res = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            let _ = on_event.send(AiEvent::Error { message: format!("Couldn't reach {url}: {e}") });
            return Ok(());
        }
    };
    let headers = res
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();
    let _ = on_event.send(AiEvent::Head { status: res.status().as_u16(), headers });
    // Text only in whole characters: keep a split UTF-8 sequence for the next chunk.
    let mut pending: Vec<u8> = Vec::new();
    loop {
        match res.chunk().await {
            Ok(Some(bytes)) => {
                pending.extend_from_slice(&bytes);
                let valid = match std::str::from_utf8(&pending) {
                    Ok(_) => pending.len(),
                    Err(e) => e.valid_up_to(),
                };
                if valid > 0 {
                    let text = String::from_utf8_lossy(&pending[..valid]).to_string();
                    pending.drain(..valid);
                    if on_event.send(AiEvent::Chunk { text }).is_err() {
                        return Ok(()); // the UI went away (cancelled)
                    }
                }
            }
            Ok(None) => break,
            Err(e) => {
                let _ = on_event.send(AiEvent::Error { message: e.to_string() });
                return Ok(());
            }
        }
    }
    if !pending.is_empty() {
        let _ = on_event.send(AiEvent::Chunk { text: String::from_utf8_lossy(&pending).to_string() });
    }
    let _ = on_event.send(AiEvent::End);
    Ok(())
}

// ─── Connecting AI apps through MCP ─────────────────────────────────────

fn home() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE").map(PathBuf::from)
}
fn appdata() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(PathBuf::from)
}

/// Claude Desktop's settings folders. The Microsoft Store build (MSIX)
/// reads %LOCALAPPDATA%\Packages\Claude_…\LocalCache\Roaming\Claude, never
/// %APPDATA%\Claude; the classic installer reads %APPDATA%\Claude. Every one
/// that's there, the Store's first; %APPDATA%'s when there's none.
fn claude_desktop_dirs() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(packages) = std::env::var_os("LOCALAPPDATA").map(|d| PathBuf::from(d).join("Packages")) {
        if let Ok(entries) = std::fs::read_dir(packages) {
            for e in entries.flatten() {
                let name = e.file_name().to_string_lossy().to_string();
                if name.starts_with("Claude_") || name.starts_with("AnthropicPBC.Claude_") {
                    out.push(e.path().join("LocalCache").join("Roaming").join("Claude"));
                }
            }
        }
    }
    if let Some(d) = appdata().map(|d| d.join("Claude")) {
        if d.exists() || out.is_empty() {
            out.push(d);
        }
    }
    out
}

/// Where each client keeps its MCP servers (every file it might read), and
/// the key they go under.
fn client_configs(client: &str) -> Vec<(PathBuf, &'static str)> {
    if client == "claude-desktop" {
        return claude_desktop_dirs().into_iter().map(|d| (d.join("claude_desktop_config.json"), "mcpServers")).collect();
    }
    client_config(client).into_iter().collect()
}

fn client_config(client: &str) -> Option<(PathBuf, &'static str)> {
    Some(match client {
        "cursor" => (home()?.join(".cursor").join("mcp.json"), "mcpServers"),
        "vscode" => (appdata()?.join("Code").join("User").join("mcp.json"), "servers"),
        "vscode-insiders" => (appdata()?.join("Code - Insiders").join("User").join("mcp.json"), "servers"),
        "windsurf" => (home()?.join(".codeium").join("windsurf").join("mcp_config.json"), "mcpServers"),
        "gemini-cli" => (home()?.join(".gemini").join("settings.json"), "mcpServers"),
        "lm-studio" => (home()?.join(".lmstudio").join("mcp.json"), "mcpServers"),
        "cline" => (
            appdata()?
                .join("Code")
                .join("User")
                .join("globalStorage")
                .join("saoudrizwan.claude-dev")
                .join("settings")
                .join("cline_mcp_settings.json"),
            "mcpServers",
        ),
        "claude-code" => (home()?.join(".claude.json"), "mcpServers"),
        _ => return None,
    })
}

fn exe_path() -> Result<String, String> {
    Ok(std::env::current_exe().map_err(|e| e.to_string())?.to_string_lossy().to_string())
}

#[derive(Serialize)]
pub struct ClientInfo {
    id: String,
    installed: bool,
    connected: bool,
    config: Option<String>,
}

fn has_server(path: &Path, key: &str) -> bool {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .map(|v| v.get(key).and_then(|s| s.get("arayashiki")).is_some())
        .unwrap_or(false)
}

/// Which AI clients look installed, and which already have Arayashiki.
#[tauri::command]
pub fn ai_clients() -> Vec<ClientInfo> {
    let mut out = Vec::new();
    for id in ["claude-desktop", "claude-code", "cursor", "vscode", "vscode-insiders", "windsurf", "cline", "gemini-cli", "lm-studio", "codex"] {
        let (path, installed, connected) = if id == "codex" {
            let p = home().map(|h| h.join(".codex").join("config.toml"));
            let installed = p.as_ref().and_then(|p| p.parent().map(|d| d.exists())).unwrap_or(false);
            let connected = p
                .as_ref()
                .and_then(|p| std::fs::read_to_string(p).ok())
                .map(|t| t.contains("[mcp_servers.arayashiki]"))
                .unwrap_or(false);
            (p, installed, connected)
        } else {
            let configs = client_configs(id);
            let installed = if id == "claude-code" {
                home().map(|h| h.join(".claude").exists()).unwrap_or(false)
            } else {
                configs.iter().any(|(p, _)| p.exists() || p.parent().map(|d| d.exists()).unwrap_or(false))
            };
            // Connected only when every file the app might read has it.
            let connected = !configs.is_empty() && configs.iter().all(|(p, key)| has_server(p, key));
            (configs.first().map(|(p, _)| p.clone()), installed, connected)
        };
        out.push(ClientInfo { id: id.into(), installed, connected, config: path.map(|p| p.to_string_lossy().to_string()) });
    }
    out
}

/// Adds Arayashiki to one JSON settings file (a backup is kept next to it).
fn add_to_json(path: &Path, key: &str, server: Value) -> Result<(), String> {
    let mut config: Value = if path.exists() {
        let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
        if text.trim().is_empty() {
            json!({})
        } else {
            let parsed = serde_json::from_str(&text).map_err(|_| {
                format!("{} has comments or isn't plain JSON, so it wasn't touched. Add Arayashiki to it by hand (the steps are below).", path.display())
            })?;
            let _ = std::fs::write(path.with_extension("json.bak"), &text);
            parsed
        }
    } else {
        std::fs::create_dir_all(path.parent().ok_or("Bad path")?).map_err(|e| e.to_string())?;
        json!({})
    };
    let obj = config.as_object_mut().ok_or("The settings file isn't a JSON object")?;
    let servers = obj.entry(key).or_insert_with(|| json!({}));
    servers.as_object_mut().ok_or("Its server list isn't a JSON object")?.insert("arayashiki".into(), server);
    std::fs::write(path, serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

/// Claude Code also gets Arayashiki's skill (~/.claude/skills/arayashiki),
/// so it knows when to reach for the tools.
fn install_claude_skill() {
    if let Some(dir) = home().map(|h| h.join(".claude").join("skills").join("arayashiki")) {
        if std::fs::create_dir_all(&dir).is_ok() {
            let _ = std::fs::write(dir.join("SKILL.md"), include_str!("../../docs/ai/installed/SKILL.md"));
        }
    }
}

/// Adds Arayashiki to a client's MCP settings (a backup of each file is
/// kept next to it). Returns the files it changed.
#[tauri::command]
pub fn connect_ai_client(client: String) -> Result<String, String> {
    let exe = exe_path()?;
    if client == "codex" {
        let path = home().ok_or("No home folder")?.join(".codex").join("config.toml");
        std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
        let mut text = std::fs::read_to_string(&path).unwrap_or_default();
        if text.contains("[mcp_servers.arayashiki]") {
            return Ok(path.to_string_lossy().to_string());
        }
        if !text.is_empty() {
            let _ = std::fs::write(path.with_extension("toml.bak"), &text);
            if !text.ends_with('\n') {
                text.push('\n');
            }
        }
        let quoted = exe.replace('\\', "\\\\").replace('"', "\\\"");
        text.push_str(&format!("\n[mcp_servers.arayashiki]\ncommand = \"{quoted}\"\nargs = [\"--mcp\"]\n"));
        std::fs::write(&path, text).map_err(|e| e.to_string())?;
        return Ok(path.to_string_lossy().to_string());
    }
    let configs = client_configs(&client);
    if configs.is_empty() {
        return Err(format!("Unknown client {client}"));
    }
    let mut done = Vec::new();
    let mut failed = None;
    for (path, key) in configs {
        let server = if key == "servers" {
            json!({ "type": "stdio", "command": exe, "args": ["--mcp"] })
        } else if client == "claude-code" {
            json!({ "type": "stdio", "command": exe, "args": ["--mcp"], "env": {} })
        } else {
            json!({ "command": exe, "args": ["--mcp"] })
        };
        match add_to_json(&path, key, server) {
            Ok(()) => done.push(path.to_string_lossy().to_string()),
            Err(e) => failed = Some(e),
        }
    }
    if client == "claude-code" {
        install_claude_skill();
    }
    match (done.is_empty(), failed) {
        (true, Some(e)) => Err(e),
        _ => Ok(done.join(" and ")),
    }
}

/// This app's own path, for instructions shown to the user.
#[tauri::command]
pub fn app_exe_path() -> Result<String, String> {
    exe_path()
}
