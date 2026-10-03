// The assistant on an AI subscription: Claude (Pro/Max), ChatGPT (Plus/Pro)
// or a Google account, through the official command-line apps that own
// those sign-ins: Claude Code, Codex and Gemini CLI. It's what the Claude
// Code extension for VS Code does: the CLI signs in (in the browser, with
// the provider's own page), keeps the login, and runs the conversation;
// this starts it, hands it the message, and streams its events back to the
// assistant (src/ai/cli.js). The CLI reaches the app's tools through MCP
// (`arayashiki.exe --mcp`), like any AI app.
//
// No subscription token ever passes through Arayashiki: it only ever sees
// what the CLI prints.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::Manager;

use crate::updates::CREATE_NO_WINDOW;

const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;

#[derive(Default)]
pub struct Runs {
    next: AtomicU64,
    children: Mutex<HashMap<u64, Arc<Mutex<Child>>>>,
}
pub type SharedRuns = Arc<Runs>;

fn home() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE").map(PathBuf::from)
}

/// PATH as a new terminal would see it: this process's, then the user's and
/// the machine's from the registry (a CLI installed after the app started
/// isn't in the app's own PATH).
fn search_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH").map(|p| std::env::split_paths(&p).collect()).unwrap_or_default();
    for key in [r"HKCU\Environment", r"HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment"] {
        if let Ok(out) = Command::new("reg").args(["query", key, "/v", "Path"]).creation_flags(CREATE_NO_WINDOW).output() {
            let text = String::from_utf8_lossy(&out.stdout);
            if let Some(value) = text.lines().find(|l| l.trim_start().starts_with("Path")).and_then(|l| l.split("REG_").nth(1)).and_then(|l| l.split_once("    ").map(|(_, v)| v.trim().to_string())) {
                for part in value.split(';').filter(|p| !p.is_empty()) {
                    dirs.push(PathBuf::from(expand(part)));
                }
            }
        }
    }
    if let Some(h) = home() {
        dirs.push(h.join(".local").join("bin"));
    }
    if let Some(a) = std::env::var_os("APPDATA") {
        dirs.push(PathBuf::from(a).join("npm"));
    }
    dirs
}

/// %VARIABLES% in a registry PATH entry.
fn expand(s: &str) -> String {
    let mut out = s.to_string();
    while let Some(a) = out.find('%') {
        let Some(len) = out[a + 1..].find('%') else { break };
        let name = &out[a + 1..a + 1 + len];
        let value = std::env::var(name).unwrap_or_default();
        out.replace_range(a..a + len + 2, &value);
    }
    out
}

/// The CLI's program: its .exe, or an npm shim (.cmd) unwrapped to the exe
/// it starts when it starts one (so arguments don't go through cmd.exe).
fn find(name: &str) -> Option<PathBuf> {
    for dir in search_dirs() {
        let exe = dir.join(format!("{name}.exe"));
        if exe.is_file() {
            return Some(exe);
        }
        let cmd = dir.join(format!("{name}.cmd"));
        if cmd.is_file() {
            return Some(unwrap_shim(&cmd).unwrap_or(cmd));
        }
    }
    None
}

fn unwrap_shim(cmd: &Path) -> Option<PathBuf> {
    let text = std::fs::read_to_string(cmd).ok()?;
    let dir = cmd.parent()?;
    for line in text.lines() {
        if let Some(start) = line.find("\"%dp0%\\") {
            let rest = &line[start + 7..];
            let end = rest.find('"')?;
            let target = dir.join(&rest[..end]);
            if target.extension().map(|e| e.eq_ignore_ascii_case("exe")).unwrap_or(false) && target.is_file() {
                return Some(target);
            }
        }
    }
    None
}

fn program(tool: &str) -> Result<&'static str, String> {
    match tool {
        "claude" => Ok("claude"),
        "codex" => Ok("codex"),
        "gemini" => Ok("gemini"),
        _ => Err(format!("Unknown tool {tool}")),
    }
}

fn run_quiet(exe: &Path, args: &[&str]) -> Option<(bool, String)> {
    let out = Command::new(exe).args(args).stdin(Stdio::null()).creation_flags(CREATE_NO_WINDOW).output().ok()?;
    let mut text = String::from_utf8_lossy(&out.stdout).to_string();
    text.push_str(&String::from_utf8_lossy(&out.stderr));
    Some((out.status.success(), text))
}

#[derive(Serialize)]
pub struct CliStatus {
    installed: bool,
    path: Option<String>,
    version: Option<String>,
    #[serde(rename = "signedIn")]
    signed_in: bool,
    account: Option<String>,
    plan: Option<String>,
}

/// Whether the CLI is on this PC, and signed in (and as whom).
#[tauri::command]
pub async fn ai_cli_status(tool: String) -> Result<CliStatus, String> {
    let name = program(&tool)?;
    tauri::async_runtime::spawn_blocking(move || {
        let Some(exe) = find(name) else {
            return CliStatus { installed: false, path: None, version: None, signed_in: false, account: None, plan: None };
        };
        let version = run_quiet(&exe, &["--version"]).map(|(_, t)| t.lines().next().unwrap_or("").trim().to_string());
        let (signed_in, account, plan) = match tool.as_str() {
            "claude" => run_quiet(&exe, &["auth", "status"])
                .and_then(|(_, t)| serde_json::from_str::<serde_json::Value>(t.trim()).ok())
                .map(|v| {
                    (
                        v["loggedIn"].as_bool().unwrap_or(false),
                        v["email"].as_str().map(str::to_string),
                        v["subscriptionType"].as_str().or(v["authMethod"].as_str()).map(str::to_string),
                    )
                })
                .unwrap_or((false, None, None)),
            "codex" => run_quiet(&exe, &["login", "status"])
                .map(|(ok, t)| {
                    let line = t.lines().find(|l| l.to_lowercase().contains("logged in")).map(|l| l.trim().to_string());
                    (ok && line.is_some() && !t.to_lowercase().contains("not logged in"), None, line)
                })
                .unwrap_or((false, None, None)),
            _ => {
                // Gemini CLI keeps its Google sign-in here.
                let creds = home().map(|h| h.join(".gemini").join("oauth_creds.json")).map(|p| p.is_file()).unwrap_or(false);
                let account = home()
                    .and_then(|h| std::fs::read_to_string(h.join(".gemini").join("google_accounts.json")).ok())
                    .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
                    .and_then(|v| v["active"].as_str().map(str::to_string));
                (creds, account, None)
            }
        };
        CliStatus { installed: true, path: Some(exe.to_string_lossy().to_string()), version, signed_in, account, plan }
    })
    .await
    .map_err(|e| e.to_string())
}

/// Opens a terminal window that signs in the provider's way (its page opens
/// in the browser); the UI watches the status until it's done.
#[tauri::command]
pub fn ai_cli_sign_in(tool: String) -> Result<(), String> {
    let name = program(&tool)?;
    let exe = find(name).ok_or("It isn't installed yet.")?;
    let args: &[&str] = match tool.as_str() {
        "claude" => &["auth", "login", "--claudeai"],
        "codex" => &["login"],
        // Gemini CLI signs in from its own first screen ("Sign in with Google").
        _ => &[],
    };
    Command::new(exe).args(args).creation_flags(CREATE_NEW_CONSOLE).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn ai_cli_sign_out(tool: String) -> Result<(), String> {
    let name = program(&tool)?;
    let exe = find(name).ok_or("It isn't installed.")?;
    tauri::async_runtime::spawn_blocking(move || {
        match tool.as_str() {
            "claude" => {
                run_quiet(&exe, &["auth", "logout"]);
            }
            "codex" => {
                run_quiet(&exe, &["logout"]);
            }
            _ => {
                if let Some(h) = home() {
                    let _ = std::fs::remove_file(h.join(".gemini").join("oauth_creds.json"));
                }
            }
        }
    })
    .await
    .map_err(|e| e.to_string())
}

/// Installs the CLI in a terminal window, the way its maker says to.
#[tauri::command]
pub fn ai_cli_install(tool: String) -> Result<(), String> {
    let script = match tool.as_str() {
        "claude" => "irm https://claude.ai/install.ps1 | iex",
        "codex" | "gemini" => {
            if find("npm").is_none() {
                return Err("This one installs with Node.js: install Node.js from nodejs.org first, then try again.".into());
            }
            if tool == "codex" {
                "npm install -g @openai/codex"
            } else {
                "npm install -g @google/gemini-cli"
            }
        }
        _ => return Err(format!("Unknown tool {tool}")),
    };
    let full = format!("{script}; Write-Host ''; Write-Host 'Done. You can close this window and go back to Arayashiki.'");
    Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", &full])
        .creation_flags(CREATE_NEW_CONSOLE)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum CliEvent {
    /// One line the CLI printed (a JSON event).
    Line { text: String },
    /// Its error output, for when it fails.
    Stderr { text: String },
    Exit { code: Option<i32> },
}

/// The folder the CLIs work in: their instructions (CLAUDE.md, AGENTS.md,
/// GEMINI.md) and an MCP config pointing at this app.
fn workspace(app: &tauri::AppHandle, system: &str) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?.join("assistant");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    for name in ["CLAUDE.md", "AGENTS.md", "GEMINI.md"] {
        std::fs::write(dir.join(name), system).map_err(|e| e.to_string())?;
    }
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let mcp = serde_json::json!({ "mcpServers": { "arayashiki": { "command": exe.to_string_lossy(), "args": ["--mcp"] } } });
    std::fs::write(dir.join("mcp.json"), mcp.to_string()).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Runs one turn of the conversation: `prompt` goes in, the CLI's events
/// stream out on `on_event`. `session` carries on an earlier conversation.
/// Returns the run's id, for `ai_cli_cancel`.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn ai_cli_run(
    app: tauri::AppHandle,
    runs: tauri::State<'_, SharedRuns>,
    tool: String,
    prompt: String,
    system: String,
    session: Option<String>,
    model: Option<String>,
    on_event: Channel<CliEvent>,
) -> Result<u64, String> {
    let name = program(&tool)?;
    let exe = find(name).ok_or("It isn't installed.")?;
    let dir = workspace(&app, &system)?;
    let model = model.filter(|m| !m.trim().is_empty() && m.chars().all(|c| c.is_ascii_alphanumeric() || "-._:/[]".contains(c)));
    let session = session.filter(|s| s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'));
    let mut args: Vec<String> = Vec::new();
    match tool.as_str() {
        "claude" => {
            args.extend(
                [
                    "-p",
                    "--output-format",
                    "stream-json",
                    "--verbose",
                    "--include-partial-messages",
                    "--mcp-config",
                    "mcp.json",
                    "--strict-mcp-config",
                    "--allowedTools",
                    "mcp__arayashiki",
                    "--permission-mode",
                    "dontAsk",
                    "--tools",
                    "",
                ]
                .map(String::from),
            );
            if let Some(s) = &session {
                args.extend(["--resume".into(), s.clone()]);
            }
            if let Some(m) = &model {
                args.extend(["--model".into(), m.clone()]);
            }
        }
        "codex" => {
            // Its MCP servers come from ~/.codex/config.toml (Connect an AI
            // app writes Arayashiki there; the assistant does it first).
            args.extend(["exec".into(), "--json".into(), "--skip-git-repo-check".into(), "--sandbox".into(), "read-only".into()]);
            if let Some(m) = &model {
                args.extend(["-m".into(), m.clone()]);
            }
            if let Some(s) = &session {
                args.extend(["resume".into(), s.clone()]);
            }
            args.push("-".into());
        }
        _ => {
            args.extend(["--output-format".into(), "stream-json".into(), "--allowed-mcp-server-names".into(), "arayashiki".into(), "--yolo".into()]);
            if let Some(m) = &model {
                args.extend(["-m".into(), m.clone()]);
            }
            if let Some(s) = &session {
                args.extend(["--resume".into(), s.clone()]);
            }
        }
    }
    let mut child = Command::new(&exe)
        .args(&args)
        .current_dir(&dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Couldn't start {name}: {e}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(prompt.as_bytes());
    }
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let id = runs.next.fetch_add(1, Ordering::Relaxed) + 1;
    let child = Arc::new(Mutex::new(child));
    runs.children.lock().map_err(|e| e.to_string())?.insert(id, child.clone());
    if let Some(err) = stderr {
        let ch = on_event.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(err).lines().map_while(Result::ok) {
                let _ = ch.send(CliEvent::Stderr { text: line });
            }
        });
    }
    let runs = runs.inner().clone();
    std::thread::spawn(move || {
        if let Some(out) = stdout {
            for line in BufReader::new(out).lines().map_while(Result::ok) {
                if !line.trim().is_empty() {
                    let _ = on_event.send(CliEvent::Line { text: line });
                }
            }
        }
        let code = loop {
            match child.lock().ok().and_then(|mut c| c.try_wait().ok().flatten()) {
                Some(status) => break status.code(),
                None => std::thread::sleep(std::time::Duration::from_millis(50)),
            }
        };
        if let Ok(mut map) = runs.children.lock() {
            map.remove(&id);
        }
        let _ = on_event.send(CliEvent::Exit { code });
    });
    Ok(id)
}

/// Stops a run (the Stop button).
#[tauri::command]
pub fn ai_cli_cancel(runs: tauri::State<'_, SharedRuns>, id: u64) {
    if let Some(child) = runs.children.lock().ok().and_then(|m| m.get(&id).cloned()) {
        if let Ok(mut c) = child.lock() {
            // The whole tree: an npm-installed CLI runs under node.
            let pid = c.id().to_string();
            let _ = Command::new("taskkill").args(["/PID", &pid, "/T", "/F"]).creation_flags(CREATE_NO_WINDOW).status();
            let _ = c.kill();
        }
    }
}
