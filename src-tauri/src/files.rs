// Files the UI writes in pieces (videos, which can be gigabytes) or into a
// known folder without a dialog (what the AI tools export), and showing a
// file in Explorer.

use std::collections::HashMap;
use std::fs::File;
use std::io::{Seek, SeekFrom, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
pub struct Streams {
    next: AtomicU32,
    open: Mutex<HashMap<u32, (File, PathBuf)>>,
    /// Folders picked for image sequences: files go only inside these.
    folders: Mutex<HashMap<u32, PathBuf>>,
}

/// A name safe to use as a file name on Windows.
pub fn safe_name(name: &str) -> String {
    let s: String = name
        .chars()
        .map(|c| if r#"<>:"/\|?*"#.contains(c) || c.is_control() { '_' } else { c })
        .collect();
    let s = s.trim().trim_matches('.').to_string();
    if s.is_empty() { "file".into() } else { s }
}

/// Videos\Arayashiki or Pictures\Arayashiki (made if missing), for exports
/// that don't ask where to go.
pub fn known_folder(app: &tauri::AppHandle, folder: &str) -> Result<PathBuf, String> {
    let base = match folder {
        "videos" => app.path().video_dir(),
        "pictures" => app.path().picture_dir(),
        _ => return Err(format!("Unknown folder {folder}")),
    }
    .map_err(|e| e.to_string())?;
    let dir = base.join("Arayashiki");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// A path in `dir` for `name` that isn't taken: "name.mp4", "name 2.mp4"…
pub fn free_path(dir: &std::path::Path, name: &str) -> PathBuf {
    let name = safe_name(name);
    let path = std::path::Path::new(&name);
    let stem = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or(name.clone());
    let ext = path.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    let mut candidate = dir.join(&name);
    let mut n = 2;
    while candidate.exists() {
        candidate = dir.join(format!("{stem} {n}{ext}"));
        n += 1;
    }
    candidate
}

/// Where to save `name`: asked with a dialog (folder None), or in a known
/// folder. None if the dialog was cancelled.
pub fn pick_path(app: &tauri::AppHandle, name: &str, label: &str, folder: Option<&str>) -> Result<Option<PathBuf>, String> {
    if let Some(folder) = folder {
        return Ok(Some(free_path(&known_folder(app, folder)?, name)));
    }
    let safe = safe_name(name);
    let ext = std::path::Path::new(&safe).extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_default();
    let mut dialog = app.dialog().file().set_title("Save").set_file_name(&safe);
    if !ext.is_empty() {
        dialog = dialog.add_filter(label, &[ext.as_str()]);
    }
    match dialog.blocking_save_file() {
        Some(picked) => Ok(Some(picked.into_path().map_err(|e| e.to_string())?)),
        None => Ok(None),
    }
}

/// Starts a file: its id and path, or None if the dialog was cancelled.
#[tauri::command]
pub async fn stream_create(
    app: tauri::AppHandle,
    streams: tauri::State<'_, Streams>,
    name: String,
    label: String,
    folder: Option<String>,
) -> Result<Option<(u32, String)>, String> {
    let Some(path) = pick_path(&app, &name, &label, folder.as_deref())? else {
        return Ok(None);
    };
    let file = File::create(&path).map_err(|e| format!("Couldn't create {}: {e}", path.display()))?;
    let id = streams.next.fetch_add(1, Ordering::Relaxed) + 1;
    let shown = path.to_string_lossy().to_string();
    streams.open.lock().map_err(|e| e.to_string())?.insert(id, (file, path));
    Ok(Some((id, shown)))
}

/// Writes the request's bytes at `position` (x-meta: { id, position }).
#[tauri::command]
pub fn stream_write(streams: tauri::State<'_, Streams>, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let (bytes, meta) = crate::raw_request(&request)?;
    let id = meta["id"].as_u64().ok_or("No stream id")? as u32;
    let position = meta["position"].as_u64().unwrap_or(0);
    let mut open = streams.open.lock().map_err(|e| e.to_string())?;
    let (file, _) = open.get_mut(&id).ok_or("That file was already closed")?;
    file.seek(SeekFrom::Start(position)).map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())
}

/// Finishes a file; its path.
#[tauri::command]
pub fn stream_close(streams: tauri::State<'_, Streams>, id: u32) -> Result<String, String> {
    let (mut file, path) = streams.open.lock().map_err(|e| e.to_string())?.remove(&id).ok_or("That file was already closed")?;
    file.flush().map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// Gives up on a file and deletes what was written.
#[tauri::command]
pub fn stream_abort(streams: tauri::State<'_, Streams>, id: u32) -> Result<(), String> {
    if let Some((file, path)) = streams.open.lock().map_err(|e| e.to_string())?.remove(&id) {
        drop(file);
        let _ = std::fs::remove_file(path);
    }
    Ok(())
}

/// Opens Explorer with the file selected.
#[tauri::command]
pub fn reveal_file(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{path}"))
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        let _ = path;
    }
    Ok(())
}

/// Picks (or makes) a folder for an image sequence: a dialog for a parent
/// folder, or Videos\Arayashiki; inside it, a new folder named `name`.
/// Returns its id and path, or None if the dialog was cancelled.
#[tauri::command]
pub async fn folder_create(
    app: tauri::AppHandle,
    streams: tauri::State<'_, Streams>,
    name: String,
    folder: Option<String>,
) -> Result<Option<(u32, String)>, String> {
    let parent = match folder.as_deref() {
        Some(f) => known_folder(&app, f)?,
        None => match app.dialog().file().set_title("Where to put the frames").blocking_pick_folder() {
            Some(p) => p.into_path().map_err(|e| e.to_string())?,
            None => return Ok(None),
        },
    };
    let dir = free_path(&parent, &name);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Couldn't create {}: {e}", dir.display()))?;
    let id = streams.next.fetch_add(1, Ordering::Relaxed) + 1;
    let shown = dir.to_string_lossy().to_string();
    streams.folders.lock().map_err(|e| e.to_string())?.insert(id, dir);
    Ok(Some((id, shown)))
}

/// Writes the request's bytes as file `name` (no folders in it) in a folder
/// from `folder_create` (x-meta: { id, name }).
#[tauri::command]
pub fn folder_write(streams: tauri::State<'_, Streams>, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let (bytes, meta) = crate::raw_request(&request)?;
    let id = meta["id"].as_u64().ok_or("No folder id")? as u32;
    let name = safe_name(meta["name"].as_str().unwrap_or("frame"));
    let dir = streams.folders.lock().map_err(|e| e.to_string())?.get(&id).cloned().ok_or("That folder isn't open")?;
    std::fs::write(dir.join(name), bytes).map_err(|e| e.to_string())
}
