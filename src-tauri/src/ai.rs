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

use std::path::PathBuf;

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
    if let Some(key) = key_of(&provider) {
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

/// Where each client keeps its MCP servers, and the key they go under.
fn client_config(client: &str) -> Option<(PathBuf, &'static str)> {
    Some(match client {
        "claude-desktop" => (appdata()?.join("Claude").join("claude_desktop_config.json"), "mcpServers"),
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
        } else if let Some((p, key)) = client_config(id) {
            let installed = p.parent().map(|d| d.exists()).unwrap_or(false) || p.exists();
            let connected = std::fs::read_to_string(&p)
                .ok()
                .and_then(|t| serde_json::from_str::<Value>(&t).ok())
                .map(|v| v.get(key).and_then(|s| s.get("arayashiki")).is_some())
                .unwrap_or(false);
            (Some(p), installed, connected)
        } else {
            (None, false, false)
        };
        out.push(ClientInfo { id: id.into(), installed, connected, config: path.map(|p| p.to_string_lossy().to_string()) });
    }
    out
}

/// Adds Arayashiki to a client's MCP settings (a backup of the file is kept
/// next to it). Returns the file it changed.
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
    let (path, key) = client_config(&client).ok_or_else(|| format!("Unknown client {client}"))?;
    let mut config: Value = if path.exists() {
        let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
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
    let server = if key == "servers" {
        json!({ "type": "stdio", "command": exe, "args": ["--mcp"] })
    } else if client == "claude-code" {
        json!({ "type": "stdio", "command": exe, "args": ["--mcp"], "env": {} })
    } else {
        json!({ "command": exe, "args": ["--mcp"] })
    };
    let obj = config.as_object_mut().ok_or("The settings file isn't a JSON object")?;
    let servers = obj.entry(key).or_insert_with(|| json!({}));
    servers.as_object_mut().ok_or("Its server list isn't a JSON object")?.insert("arayashiki".into(), server);
    std::fs::write(&path, serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// This app's own path, for instructions shown to the user.
#[tauri::command]
pub fn app_exe_path() -> Result<String, String> {
    exe_path()
}
