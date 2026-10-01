// Updates, from the project's GitHub releases (github.com/woogi999/arayashiki):
//
//   * `update_check` asks GitHub's API for the latest release and says
//     whether it's newer than this build, with its notes and installer.
//   * `update_download` fetches that installer into the temp folder,
//     reporting progress on a channel.
//   * `update_install` starts the installer and closes the app, so its files
//     aren't in use while they're replaced.
//
// Only this repository's release downloads are fetched, and only setup .exe
// files run.

use std::path::PathBuf;

use serde::Serialize;
use serde_json::Value;
use tauri::ipc::Channel;

const REPO: &str = "woogi999/arayashiki";

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

#[derive(Serialize)]
pub struct Installer {
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
    installer: Option<Installer>,
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
            })
        }
        403 | 429 => return Err("GitHub is limiting requests from this network for now. Try again in a while.".into()),
        s => return Err(format!("GitHub answered {s}.")),
    }
    let release: Value = response.json().await.map_err(|e| e.to_string())?;
    let tag = release["tag_name"].as_str().unwrap_or_default().to_string();
    let latest = tag.trim_start_matches(['v', 'V']).to_string();
    let installer = release["assets"].as_array().and_then(|assets| {
        assets.iter().find_map(|a| {
            let name = a["name"].as_str()?;
            let url = a["browser_download_url"].as_str()?;
            (name.to_lowercase().ends_with("-setup.exe") && url.starts_with(&download_prefix())).then(|| Installer {
                name: name.to_string(),
                size: a["size"].as_u64().unwrap_or(0),
                url: url.to_string(),
            })
        })
    });
    Ok(UpdateInfo {
        newer: version_parts(&latest) > version_parts(&current),
        current,
        latest,
        name: release["name"].as_str().filter(|n| !n.is_empty()).unwrap_or(&tag).to_string(),
        notes: release["body"].as_str().unwrap_or_default().to_string(),
        page: release["html_url"].as_str().unwrap_or_default().to_string(),
        published: release["published_at"].as_str().map(String::from),
        installer,
    })
}

#[derive(Clone, Serialize)]
pub struct Progress {
    got: u64,
    total: u64,
}

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
    use std::io::Write;
    let name = check_installer(&url)?;
    let mut response = client()?
        .get(&url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("The download failed: {e}"))?;
    let total = response.content_length().unwrap_or(0);
    let dir = std::env::temp_dir().join("arayashiki-update");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(&name);
    let part = dir.join(format!("{name}.part"));
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
    std::fs::rename(&part, &path).map_err(|e| e.to_string())?;
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
        assert!(check_installer("https://github.com/someone/else/releases/download/v1/x-setup.exe").is_err());
        assert!(check_installer("https://github.com/woogi999/arayashiki/releases/download/v1/readme.txt").is_err());
    }
}
