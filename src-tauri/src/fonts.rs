// Fonts for the Meter Maker (src/fonts.js):
//
//   * `fonts_system`: the font families installed on this PC, read from
//     Windows' font registry (for everyone and for this user).
//   * `fonts_google_list`: Google Fonts' catalogue (its own metadata, the
//     list fonts.google.com shows), kept for a day.
//   * `fonts_google_file`: one Google font as a .woff2, its Latin letters, at
//     a weight; with `text`, only those letters (a preview, a few KB). Whole
//     fonts are kept in the cache folder, so a design opens offline.
//
// The webview may only load fonts from the app itself, so the UI gets the
// file's bytes and registers them with the FontFace API.

use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;

use serde::Serialize;
use serde_json::Value;
use tauri::Manager;

const NO_WINDOW: u32 = 0x0800_0000;
// Google serves woff2 only to browsers it knows.
const BROWSER: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/// Weights and styles in a registry name: "Arial Bold Italic" is Arial.
const STYLES: &[&str] = &[
    "Bold", "Italic", "Oblique", "Light", "Semilight", "SemiLight", "Semibold", "SemiBold", "Demibold", "DemiBold", "Black", "Heavy", "Medium",
    "Thin", "Extralight", "ExtraLight", "Ultralight", "UltraLight", "Extrabold", "ExtraBold", "Ultrabold", "UltraBold", "Regular", "Normal", "Book",
];

fn family_of(name: &str) -> Option<String> {
    let base = name.split(" (").next()?.trim();
    let mut words: Vec<&str> = base.split_whitespace().collect();
    while words.len() > 1 && STYLES.contains(words.last()?) {
        words.pop();
    }
    let family = words.join(" ");
    (!family.is_empty() && !family.starts_with('@')).then_some(family)
}

/// The installed font families, sorted, each once.
#[tauri::command]
pub fn fonts_system() -> Vec<String> {
    let mut out = std::collections::BTreeSet::new();
    for key in [
        r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts",
        r"HKCU\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts",
    ] {
        let Ok(o) = Command::new("reg").args(["query", key]).creation_flags(NO_WINDOW).output() else { continue };
        for line in String::from_utf8_lossy(&o.stdout).lines() {
            let Some((name, _)) = line.trim().split_once("    REG_") else { continue };
            // "Cambria & Cambria Math (TrueType)" holds two families.
            for part in name.split(" & ") {
                if let Some(f) = family_of(part) {
                    out.insert(f);
                }
            }
        }
    }
    out.into_iter().collect()
}

fn cache(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("fonts");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(BROWSER)
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct GoogleFont {
    family: String,
    category: String,
    popularity: u64,
    weights: Vec<String>,
}

/// Google Fonts' families, most popular first.
#[tauri::command]
pub async fn fonts_google_list(app: tauri::AppHandle) -> Result<Vec<GoogleFont>, String> {
    let path = cache(&app)?.join("google.json");
    let fresh = std::fs::metadata(&path)
        .and_then(|m| m.modified())
        .map(|t| t.elapsed().map(|e| e.as_secs() < 86_400).unwrap_or(false))
        .unwrap_or(false);
    let text = if fresh {
        std::fs::read_to_string(&path).map_err(|e| e.to_string())?
    } else {
        match client()?.get("https://fonts.google.com/metadata/fonts").send().await.and_then(|r| r.error_for_status()) {
            Ok(r) => {
                let t = r.text().await.map_err(|e| e.to_string())?;
                let _ = std::fs::write(&path, &t);
                t
            }
            // Offline: last time's list, if there is one.
            Err(e) => std::fs::read_to_string(&path).map_err(|_| format!("Google Fonts couldn't be reached: {e}"))?,
        }
    };
    let json: Value = serde_json::from_str(text.trim_start_matches(")]}'").trim()).map_err(|e| e.to_string())?;
    let mut list: Vec<GoogleFont> = json["familyMetadataList"]
        .as_array()
        .ok_or("Google Fonts' list wasn't as expected.")?
        .iter()
        .filter_map(|f| {
            Some(GoogleFont {
                family: f["family"].as_str()?.to_string(),
                category: f["category"].as_str().unwrap_or("").to_string(),
                popularity: f["popularity"].as_u64().unwrap_or(u64::MAX),
                weights: f["fonts"].as_object().map(|o| o.keys().cloned().collect()).unwrap_or_default(),
            })
        })
        .collect();
    list.sort_by_key(|f| f.popularity);
    Ok(list)
}

fn safe(family: &str) -> Result<(), String> {
    if family.is_empty() || family.len() > 80 || !family.chars().all(|c| c.is_alphanumeric() || c == ' ' || c == '-') {
        return Err("That isn't a Google Fonts family.".into());
    }
    Ok(())
}

/// The woff2 a css2 stylesheet points at: its Latin part, else the first.
fn woff2_of(css: &str) -> Option<String> {
    let mut first = None;
    let mut latin = None;
    let mut label = "";
    for chunk in css.split("@font-face") {
        if let Some(c) = chunk.trim().strip_prefix("/*") {
            label = c.split("*/").next().unwrap_or("").trim();
        }
        let url = chunk.split("url(").nth(1).and_then(|s| s.split(')').next()).map(|u| u.trim_matches(['"', '\'']).to_string());
        if let Some(u) = url {
            first.get_or_insert(u.clone());
            if label == "latin" {
                latin = Some(u);
            }
        }
        // The label for the next block is at the end of this one.
        if let Some(i) = chunk.rfind("/*") {
            label = chunk[i + 2..].split("*/").next().unwrap_or("").trim();
        }
    }
    latin.or(first)
}

/// One Google font's file, as bytes: `weight` ("400", "700"…), `italic`, and
/// with `text`, only those letters.
#[tauri::command]
pub async fn fonts_google_file(app: tauri::AppHandle, family: String, weight: String, italic: bool, text: Option<String>) -> Result<tauri::ipc::Response, String> {
    safe(&family)?;
    let weight: u32 = weight.parse().map_err(|_| "A weight is a number, like 400.")?;
    let file = cache(&app)?.join("google").join(format!("{}-{weight}{}.woff2", family.replace(' ', "_"), if italic { "i" } else { "" }));
    if text.is_none() {
        if let Ok(bytes) = std::fs::read(&file) {
            return Ok(tauri::ipc::Response::new(bytes));
        }
    }
    let spec = if italic { format!("ital,wght@1,{weight}") } else { format!("wght@{weight}") };
    let mut url = url::Url::parse("https://fonts.googleapis.com/css2").map_err(|e| e.to_string())?;
    url.query_pairs_mut().append_pair("family", &format!("{family}:{spec}")).append_pair("display", "swap");
    if let Some(t) = &text {
        url.query_pairs_mut().append_pair("text", t);
    }
    let http = client()?;
    let css = http
        .get(url.as_str())
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("Google Fonts couldn't be reached: {e}"))?
        .text()
        .await
        .map_err(|e| e.to_string())?;
    let src = woff2_of(&css).ok_or("Google Fonts sent no font file.")?;
    if !src.starts_with("https://fonts.gstatic.com/") {
        return Err("That font file isn't Google's.".into());
    }
    let bytes = http.get(&src).send().await.and_then(|r| r.error_for_status()).map_err(|e| e.to_string())?.bytes().await.map_err(|e| e.to_string())?.to_vec();
    if text.is_none() {
        if let Some(dir) = file.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(&file, &bytes);
    }
    Ok(tauri::ipc::Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn families_from_registry_names() {
        assert_eq!(family_of("Arial Bold Italic (TrueType)").as_deref(), Some("Arial"));
        assert_eq!(family_of("Arial Narrow (TrueType)").as_deref(), Some("Arial Narrow"));
        assert_eq!(family_of("Segoe UI Semibold (TrueType)").as_deref(), Some("Segoe UI"));
        assert_eq!(family_of("Impact (TrueType)").as_deref(), Some("Impact"));
    }

    #[test]
    fn the_latin_file() {
        let css = "/* cyrillic */\n@font-face { src: url(https://fonts.gstatic.com/a.woff2) format('woff2'); }\n/* latin */\n@font-face { src: url(https://fonts.gstatic.com/b.woff2) format('woff2'); }";
        assert_eq!(woff2_of(css).as_deref(), Some("https://fonts.gstatic.com/b.woff2"));
        assert_eq!(woff2_of("@font-face { src: url(https://fonts.gstatic.com/c.woff2); }").as_deref(), Some("https://fonts.gstatic.com/c.woff2"));
    }
}
