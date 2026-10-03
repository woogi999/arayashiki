// Plugins (mods): folders in the app's config folder, `plugins\<id>\`, each
// with a plugin.json and an ES module (its `main`, main.js by default). The
// UI (src/plugins.js) loads them and hands each the plugin API; this only
// reads them off disk and opens the folder. See docs/PLUGINS.md.

use std::path::PathBuf;

use serde::Serialize;
use tauri::Manager;

const MAX_CODE: u64 = 4 * 1024 * 1024;

fn dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_config_dir().map_err(|e| e.to_string())?.join("plugins");
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

#[derive(Serialize)]
pub struct Plugin {
    folder: String,
    manifest: Option<serde_json::Value>,
    code: Option<String>,
    error: Option<String>,
}

/// Every plugin folder: its manifest and its code (or what's wrong with it).
#[tauri::command]
pub fn plugins_list(app: tauri::AppHandle) -> Result<Vec<Plugin>, String> {
    let root = dir(&app)?;
    let mut out = Vec::new();
    let mut folders: Vec<_> = std::fs::read_dir(&root).map_err(|e| e.to_string())?.flatten().filter(|e| e.path().is_dir()).collect();
    folders.sort_by_key(|e| e.file_name());
    for entry in folders {
        let folder = entry.file_name().to_string_lossy().to_string();
        let path = entry.path();
        let read = || -> Result<(serde_json::Value, String), String> {
            let text = std::fs::read_to_string(path.join("plugin.json")).map_err(|_| "No plugin.json in the folder.".to_string())?;
            let manifest: serde_json::Value = serde_json::from_str(&text).map_err(|e| format!("plugin.json isn't valid JSON: {e}"))?;
            let main = manifest["main"].as_str().unwrap_or("main.js");
            // Only a file inside the plugin's own folder.
            if main.contains("..") || main.contains(':') || main.starts_with('/') || main.starts_with('\\') {
                return Err("plugin.json's main must be a file inside the plugin's folder.".into());
            }
            let file = path.join(main);
            let size = std::fs::metadata(&file).map_err(|_| format!("No {main} in the folder."))?.len();
            if size > MAX_CODE {
                return Err(format!("{main} is over 4 MB."));
            }
            let code = std::fs::read_to_string(&file).map_err(|e| e.to_string())?;
            Ok((manifest, code))
        };
        match read() {
            Ok((manifest, code)) => out.push(Plugin { folder, manifest: Some(manifest), code: Some(code), error: None }),
            Err(e) => out.push(Plugin { folder, manifest: None, code: None, error: Some(e) }),
        }
    }
    Ok(out)
}

/// Opens the plugins folder in Explorer (made if it isn't there yet).
#[tauri::command]
pub fn plugins_open_folder(app: tauri::AppHandle) -> Result<String, String> {
    let d = dir(&app)?;
    std::process::Command::new("explorer").arg(&d).spawn().map_err(|e| e.to_string())?;
    Ok(d.to_string_lossy().to_string())
}

/// The plugins folder's path, for the settings and the docs.
#[tauri::command]
pub fn plugins_folder(app: tauri::AppHandle) -> Result<String, String> {
    Ok(dir(&app)?.to_string_lossy().to_string())
}
