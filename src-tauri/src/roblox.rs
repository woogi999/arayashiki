// Roblox assets, by every route a desktop app has. For an asset ID:
//
//   1. The app's own copy (assets it fetched before), instantly and offline.
//   2. Its details (name, type, creator) from the economy API, which answers
//      without signing in.
//   3. Where Roblox keeps it: asset delivery v2 and v1 (images, decals and
//      public models come back without signing in; most audio since 2025
//      only comes to a signed-in account).
//   4. The bytes: first from the Roblox client's own cache on this machine
//      (%LOCALAPPDATA%\Roblox\rbx-storage), found by content hash through an
//      index built in the background, when Roblox cached the file under
//      the hash the delivery API names (for most assets it caches only a
//      redirect marker there, which can't be traced to the file: see the
//      handbook, section 8); otherwise from Roblox's CDN.
//   5. Decals and models are unwrapped: their XML or binary (LZ4/zstd chunks)
//      names the image or sound they hold, which is fetched in turn.
//   6. For pictures that won't come any other way, the thumbnail API.
//
// When the user has signed in (account.rs), step 3 asks as their account
// first: Roblox answers with what that account may use, nothing more.
//
// Meshes (.mesh, every version) come back as they are; the viewport reads
// them (src/rbxmesh.js).

use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::account::Account;

const KEYRING_SERVICE: &str = "Arayashiki";
const KEYRING_USER: &str = "roblox-open-cloud-key";

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetInfo {
    pub id: String,
    pub name: Option<String>,
    pub type_id: Option<i64>,
    pub type_name: Option<String>,
    pub creator: Option<String>,
    /// Where the bytes came from: "saved", "roblox-cache", "cdn" or "thumbnail".
    pub source: Option<String>,
    /// How its location was found: "signed-in", "asset-delivery".
    pub via: Option<String>,
    pub mime: Option<String>,
    pub size: u64,
    /// The file's name in the app's asset folder.
    pub file: Option<String>,
    /// A decal or model: the image or sound ID inside it.
    pub points_to: Option<String>,
    pub error: Option<String>,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexStatus {
    pub available: bool,
    pub building: bool,
    pub entries: usize,
    pub error: Option<String>,
}

#[derive(Default, Serialize, Deserialize)]
struct SavedIndex {
    max_atime: i64,
    entries: HashMap<String, String>, // content hash → rbx-storage entry id (hex)
}

pub struct Assets {
    dir: PathBuf,
    client: reqwest::Client,
    account: Arc<Account>,
    index: Mutex<SavedIndex>,
    status: Mutex<IndexStatus>,
}

pub type SharedAssets = Arc<Assets>;

fn type_name(id: i64) -> &'static str {
    match id {
        1 => "Image",
        2 => "T-Shirt",
        3 => "Audio",
        4 => "Mesh",
        5 => "Lua",
        8 => "Hat",
        9 => "Place",
        10 => "Model",
        11 => "Shirt",
        12 => "Pants",
        13 => "Decal",
        24 => "Animation",
        38 => "Plugin",
        40 => "MeshPart",
        62 => "Video",
        _ => "Asset",
    }
}

fn roblox_dir() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA").map(|p| PathBuf::from(p).join("Roblox"))
}

fn valid_id(id: &str) -> Result<(), String> {
    if !id.is_empty() && id.len() <= 20 && id.bytes().all(|b| b.is_ascii_digit()) {
        Ok(())
    } else {
        Err("Bad asset id".into())
    }
}

// ─── What a file is, by its first bytes ─────────────────────────────────

fn sniff(b: &[u8]) -> Option<(&'static str, &'static str)> {
    let starts = |m: &[u8]| b.len() >= m.len() && &b[..m.len()] == m;
    if starts(b"\x89PNG") {
        Some(("image/png", "png"))
    } else if starts(b"\xff\xd8\xff") {
        Some(("image/jpeg", "jpg"))
    } else if starts(b"GIF8") {
        Some(("image/gif", "gif"))
    } else if starts(b"RIFF") && b.len() > 12 && &b[8..12] == b"WEBP" {
        Some(("image/webp", "webp"))
    } else if starts(b"RIFF") && b.len() > 12 && &b[8..12] == b"WAVE" {
        Some(("audio/wav", "wav"))
    } else if starts(b"OggS") {
        Some(("audio/ogg", "ogg"))
    } else if starts(b"ID3") || (b.len() > 1 && b[0] == 0xff && (b[1] & 0xe0) == 0xe0) {
        Some(("audio/mpeg", "mp3"))
    } else if starts(b"fLaC") {
        Some(("audio/flac", "flac"))
    } else if starts(b"<roblox!") {
        Some(("application/x-rbxm", "rbxm"))
    } else if starts(b"<roblox") {
        Some(("application/xml", "rbxmx"))
    } else if starts(b"version ") {
        Some(("application/x-roblox-mesh", "mesh"))
    } else if starts(b"\xabKTX") {
        Some(("image/ktx", "ktx"))
    } else {
        None
    }
}

/// zstd and gzip bodies (Roblox's CDN and cache store some compressed).
fn unwrap_compression(bytes: Vec<u8>) -> Vec<u8> {
    if bytes.starts_with(&[0x28, 0xb5, 0x2f, 0xfd]) {
        if let Ok(out) = zstd::decode_all(&bytes[..]) {
            return out;
        }
    }
    if bytes.starts_with(&[0x1f, 0x8b]) {
        let mut out = Vec::new();
        if flate2::read::GzDecoder::new(&bytes[..]).read_to_end(&mut out).is_ok() {
            return out;
        }
    }
    bytes
}

// ─── The Roblox client's cache ──────────────────────────────────────────

/// An rbx-storage entry is "RBXH", a version, the URL it was fetched from,
/// a few fields (status, lengths, a checksum) and then the body.
fn entry_url(head: &[u8]) -> Option<&[u8]> {
    if !head.starts_with(b"RBXH") || head.len() < 12 {
        return None;
    }
    let len = u32::from_le_bytes(head[8..12].try_into().ok()?) as usize;
    head.get(12..12 + len)
}

/// The content hash a CDN URL names: its last path segment (32 hex digits).
fn content_hash(url: &str) -> Option<String> {
    let path = url.split('?').next()?;
    let last = path.rsplit('/').next()?;
    (last.len() == 32 && last.bytes().all(|b| b.is_ascii_hexdigit())).then(|| last.to_ascii_lowercase())
}

fn entry_body(data: &[u8]) -> Option<Vec<u8>> {
    let url_len = entry_url(data)?.len();
    let start = 12 + url_len;
    // The layout seen so far puts the body 25 bytes after the URL; if it
    // doesn't start with a known signature there, look for one nearby.
    let known = |b: &[u8]| sniff(b).is_some() || b.starts_with(&[0x28, 0xb5, 0x2f, 0xfd]) || b.starts_with(&[0x1f, 0x8b]);
    let at = if data.get(start + 25..).map_or(false, known) {
        start + 25
    } else {
        (start..(start + 512).min(data.len())).find(|&i| known(&data[i..]))?
    };
    Some(unwrap_compression(data[at..].to_vec()))
}

impl Assets {
    pub fn new(dir: PathBuf, account: Arc<Account>) -> Self {
        let _ = fs::create_dir_all(&dir);
        let index = fs::read(dir.join("roblox-cache-index.json"))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        let client = reqwest::Client::builder()
            .user_agent(concat!("Arayashiki/", env!("CARGO_PKG_VERSION")))
            .timeout(Duration::from_secs(20))
            .redirect(reqwest::redirect::Policy::limited(5))
            .build()
            .expect("an HTTP client");
        Assets { dir, client, account, index: Mutex::new(index), status: Mutex::new(IndexStatus::default()) }
    }

    pub fn status(&self) -> IndexStatus {
        let mut s = self.status.lock().unwrap().clone();
        s.entries = self.index.lock().unwrap().entries.len();
        s.available = roblox_dir().map_or(false, |d| d.join("rbx-storage.db").exists());
        s
    }

    /// Indexes the Roblox cache by content hash (only entries newer than
    /// the last run's), on the calling thread. Returns how many it added.
    pub fn build_index(&self) -> Result<usize, String> {
        {
            let mut s = self.status.lock().unwrap();
            if s.building {
                return Ok(0);
            }
            s.building = true;
            s.error = None;
        }
        let result = self.scan_cache();
        let mut s = self.status.lock().unwrap();
        s.building = false;
        if let Err(e) = &result {
            s.error = Some(e.clone());
        }
        result
    }

    fn scan_cache(&self) -> Result<usize, String> {
        let base = roblox_dir().ok_or("No LOCALAPPDATA")?;
        let db = base.join("rbx-storage.db");
        if !db.exists() {
            return Err("Roblox's cache isn't on this computer.".into());
        }
        let since = self.index.lock().unwrap().max_atime;
        let uri = format!("file:{}?mode=ro&immutable=1", db.to_string_lossy().replace('\\', "/"));
        let conn = rusqlite::Connection::open_with_flags(
            uri,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_URI | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("select id, substr(content, 1, 1024), content is null, atime from files where atime > ?1")
            .map_err(|e| e.to_string())?;
        let rows: Vec<(Vec<u8>, Option<Vec<u8>>, bool, i64)> = stmt
            .query_map([since], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .collect();
        let max_atime = rows.iter().map(|r| r.3).max().unwrap_or(since);
        // Reading tens of thousands of small file headers: spread it out.
        let storage = base.join("rbx-storage");
        let threads = std::thread::available_parallelism().map_or(4, |n| n.get()).min(12);
        let chunk = rows.len().div_ceil(threads.max(1)).max(1);
        let found: Vec<(String, String)> = std::thread::scope(|scope| {
            let handles: Vec<_> = rows
                .chunks(chunk)
                .map(|part| {
                    let storage = &storage;
                    scope.spawn(move || {
                        let mut out = Vec::new();
                        for (id, inline, in_file, _) in part {
                            let hex: String = id.iter().map(|b| format!("{b:02x}")).collect();
                            let head = if *in_file {
                                let mut buf = vec![0u8; 1024];
                                match fs::File::open(storage.join(&hex[..2]).join(&hex)) {
                                    Ok(mut f) => {
                                        let n = f.read(&mut buf).unwrap_or(0);
                                        buf.truncate(n);
                                        buf
                                    }
                                    Err(_) => continue,
                                }
                            } else {
                                inline.clone().unwrap_or_default()
                            };
                            if let Some(url) = entry_url(&head) {
                                if let Some(hash) = content_hash(&String::from_utf8_lossy(url)) {
                                    out.push((hash, hex));
                                }
                            }
                        }
                        out
                    })
                })
                .collect();
            handles.into_iter().flat_map(|h| h.join().unwrap_or_default()).collect()
        });
        let added = found.len();
        let mut index = self.index.lock().unwrap();
        index.entries.extend(found);
        index.max_atime = max_atime;
        if let Ok(json) = serde_json::to_vec(&*index) {
            let _ = fs::write(self.dir.join("roblox-cache-index.json"), json);
        }
        Ok(added)
    }

    /// The body the Roblox client cached for a content hash, if it has it.
    fn from_roblox_cache(&self, hash: &str) -> Option<Vec<u8>> {
        let hex = self.index.lock().unwrap().entries.get(hash)?.clone();
        let base = roblox_dir()?;
        let file = base.join("rbx-storage").join(&hex[..2]).join(&hex);
        let data = fs::read(&file).ok().or_else(|| {
            // Small entries live inside the database itself.
            let uri = format!("file:{}?mode=ro&immutable=1", base.join("rbx-storage.db").to_string_lossy().replace('\\', "/"));
            let conn = rusqlite::Connection::open_with_flags(
                uri,
                rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_URI,
            )
            .ok()?;
            let id: Vec<u8> = (0..hex.len()).step_by(2).filter_map(|i| u8::from_str_radix(&hex[i..i + 2], 16).ok()).collect();
            conn.query_row("select content from files where id = ?1", [id], |r| r.get::<_, Option<Vec<u8>>>(0)).ok()?
        })?;
        entry_body(&data)
    }

    /// The Roblox client's cached copy of what `location` serves, when it
    /// cached the file itself under that content hash. (For some assets
    /// Roblox caches only a redirect there, with no target and the file
    /// under a CDN URL we can't work out; those come from the CDN.)
    async fn cached_body(&self, location: &str) -> Option<Vec<u8>> {
        self.from_roblox_cache(&content_hash(location)?)
    }

    // ─── The web ────────────────────────────────────────────────────────

    async fn details(&self, id: &str) -> Option<(String, i64, Option<String>)> {
        let url = format!("https://economy.roblox.com/v2/assets/{id}/details");
        let v: serde_json::Value = self.client.get(url).send().await.ok()?.json().await.ok()?;
        let name = v["Name"].as_str()?.to_string();
        let type_id = v["AssetTypeId"].as_i64().unwrap_or(0);
        let creator = v["Creator"]["Name"].as_str().map(str::to_string);
        Some((name, type_id, creator))
    }

    /// Where Roblox keeps the asset's file, and which route said so.
    async fn locate(&self, id: &str) -> Result<(String, &'static str), String> {
        let first_location = |v: &serde_json::Value| {
            v["location"]
                .as_str()
                .or_else(|| v["locations"][0]["location"].as_str())
                .map(str::to_string)
        };
        let mut why = String::from("Roblox didn't say where it is.");
        // Signed in: ask as the account, as the website does. Roblox gives
        // the account what it's allowed to use, nothing more.
        if let Some(r) = self.account.get(&format!("https://assetdelivery.roblox.com/v2/assetId/{id}"), &[]).await {
            let status = r.status().as_u16();
            let v: serde_json::Value = r.json().await.unwrap_or_default();
            if let Some(loc) = first_location(&v) {
                return Ok((loc, "signed-in"));
            }
            why = format!(
                "Your account isn't allowed this asset ({status}{}); its owner hasn't made it public.",
                v["errors"][0]["message"].as_str().map(|m| format!(": {m}")).unwrap_or_default()
            );
        }
        for url in [
            format!("https://assetdelivery.roblox.com/v2/assetId/{id}"),
            format!("https://assetdelivery.roblox.com/v1/assetId/{id}"),
        ] {
            match self.client.get(url).send().await {
                Ok(r) => {
                    let status = r.status().as_u16();
                    let v: serde_json::Value = r.json().await.unwrap_or_default();
                    if let Some(loc) = first_location(&v) {
                        return Ok((loc, "asset-delivery"));
                    }
                    let message = v["errors"][0]["message"].as_str().unwrap_or_default();
                    let code = v["errors"][0]["code"].as_i64().unwrap_or(0);
                    if status == 401 || status == 403 || code == 401 || message.contains("Authentication") {
                        why = "Roblox only hands this to signed-in requests (most audio does this): sign in with Roblox.".into();
                    } else if !message.is_empty() {
                        why = message.to_string();
                    }
                }
                Err(e) => why = format!("Roblox couldn't be reached: {e}"),
            }
        }
        Err(why)
    }

    async fn download(&self, url: &str) -> Result<Vec<u8>, String> {
        let r = self.client.get(url).send().await.map_err(|e| e.to_string())?;
        if !r.status().is_success() {
            return Err(format!("The CDN answered {}", r.status().as_u16()));
        }
        Ok(unwrap_compression(r.bytes().await.map_err(|e| e.to_string())?.to_vec()))
    }

    async fn thumbnail(&self, id: &str) -> Option<Vec<u8>> {
        let url = format!("https://thumbnails.roblox.com/v1/assets?assetIds={id}&size=420x420&format=Png&isCircular=false");
        let v: serde_json::Value = self.client.get(url).send().await.ok()?.json().await.ok()?;
        let entry = &v["data"][0];
        if entry["state"] != "Completed" {
            return None;
        }
        self.download(entry["imageUrl"].as_str()?).await.ok()
    }

    // ─── The pipeline ───────────────────────────────────────────────────

    fn meta_path(&self, id: &str) -> PathBuf {
        self.dir.join(format!("{id}.json"))
    }

    fn saved(&self, id: &str) -> Option<AssetInfo> {
        let info: AssetInfo = serde_json::from_slice(&fs::read(self.meta_path(id)).ok()?).ok()?;
        match &info.file {
            // A decal or model: kept only as a pointer to what's inside.
            Some(f) if f.is_empty() && info.points_to.is_some() => Some(info),
            Some(f) if !f.is_empty() && self.dir.join(f).exists() => Some(info),
            _ => None,
        }
    }

    fn keep(&self, info: &AssetInfo) {
        if let Ok(json) = serde_json::to_vec_pretty(info) {
            let _ = fs::write(self.meta_path(&info.id), json);
        }
    }

    /// Just the details (name, type, creator), without the file.
    pub async fn describe(&self, id: &str) -> Result<AssetInfo, String> {
        valid_id(id)?;
        if let Some(info) = self.saved(id) {
            return Ok(info);
        }
        let mut info = AssetInfo { id: id.to_string(), ..Default::default() };
        if let Some((name, type_id, creator)) = self.details(id).await {
            info.name = Some(name);
            info.type_id = Some(type_id);
            info.type_name = Some(type_name(type_id).into());
            info.creator = creator;
        }
        Ok(info)
    }

    /// A model's own file (an accessory's .rbxm), not unwrapped: kept as
    /// `<id>.model` beside the other downloads.
    pub async fn model(&self, id: &str) -> Result<Vec<u8>, String> {
        valid_id(id)?;
        let path = self.dir.join(format!("{id}.model"));
        if let Ok(bytes) = fs::read(&path) {
            return Ok(bytes);
        }
        let (location, _) = self.locate(id).await?;
        let bytes = match self.cached_body(&location).await {
            Some(b) => b,
            None => self.download(&location).await?,
        };
        if !matches!(sniff(&bytes), Some((_, "rbxm" | "rbxmx"))) {
            return Err("That asset isn't a model.".into());
        }
        let _ = fs::create_dir_all(&self.dir);
        fs::write(&path, &bytes).map_err(|e| e.to_string())?;
        Ok(bytes)
    }

    /// Fetches an asset by every route, keeps it, and says where it came from.
    pub async fn fetch(&self, id: &str, depth: u8) -> Result<AssetInfo, String> {
        valid_id(id)?;
        if let Some(info) = self.saved(id) {
            if let Some(inner) = info.points_to.clone().filter(|_| depth == 0) {
                return Box::pin(self.fetch(&inner, 1)).await.map(|mut i| {
                    i.points_to = Some(inner);
                    i
                });
            }
            return Ok(AssetInfo { source: Some("saved".into()), ..info });
        }
        let mut info = self.describe(id).await?;
        let mut bytes = None;
        match self.locate(id).await {
            Ok((location, via)) => {
                info.via = Some(via.into());
                if let Some(b) = self.cached_body(&location).await {
                    info.source = Some("roblox-cache".into());
                    bytes = Some(b);
                } else {
                    match self.download(&location).await {
                        Ok(b) => {
                            info.source = Some("cdn".into());
                            bytes = Some(b);
                        }
                        Err(e) => info.error = Some(e),
                    }
                }
            }
            Err(e) => info.error = Some(e),
        }

        // A decal or a model: find the image or sound inside and fetch that.
        if let Some(b) = &bytes {
            if matches!(sniff(b), Some((_, "rbxm" | "rbxmx"))) {
                if let Some(inner) = inner_asset(b).filter(|inner| inner != id && depth == 0) {
                    info.points_to = Some(inner.clone());
                    info.file = None;
                    self.keep(&AssetInfo { file: Some(String::new()), ..info.clone() });
                    return Box::pin(self.fetch(&inner, 1)).await.map(|mut i| {
                        i.points_to = Some(inner);
                        i
                    });
                }
            }
        }
        // Pictures that wouldn't come any other way: the thumbnail.
        let is_picture = matches!(info.type_id, Some(1 | 13)) || info.type_id.is_none();
        if bytes.is_none() && is_picture {
            if let Some(b) = self.thumbnail(id).await {
                info.source = Some("thumbnail".into());
                bytes = Some(b);
            }
        }
        let Some(bytes) = bytes else {
            return Ok(info);
        };
        let (mime, ext) = sniff(&bytes).unwrap_or(("application/octet-stream", "bin"));
        let file = format!("{id}.{ext}");
        fs::write(self.dir.join(&file), &bytes).map_err(|e| e.to_string())?;
        info.mime = Some(mime.into());
        info.size = bytes.len() as u64;
        info.file = Some(file);
        info.error = None;
        self.keep(&info);
        Ok(info)
    }

    /// A user's avatar: body colours, avatar type, clothing (shirt, pants,
    /// T-shirt, face) and headshot and full-body pictures. All public.
    pub async fn avatar(&self, user_id: &str) -> Result<serde_json::Value, String> {
        valid_id(user_id)?;
        let get = |url: String| async move {
            self.client.get(url).send().await.ok()?.json::<serde_json::Value>().await.ok()
        };
        let avatar = get(format!("https://avatar.roblox.com/v2/avatar/users/{user_id}/avatar"))
            .await
            .ok_or("Roblox didn't send the avatar.")?;
        let picture = |kind: &'static str, size: &'static str| {
            let url = format!("https://thumbnails.roblox.com/v1/users/{kind}?userIds={user_id}&size={size}&format=Png");
            async move { get(url).await.and_then(|v| v["data"][0]["imageUrl"].as_str().map(str::to_string)) }
        };
        let clothing: Vec<serde_json::Value> = avatar["assets"]
            .as_array()
            .map(|list| {
                list.iter()
                    .filter(|a| matches!(a["assetType"]["id"].as_i64(), Some(2 | 11 | 12 | 18)))
                    .map(|a| serde_json::json!({ "id": a["id"].to_string(), "name": a["name"], "type": a["assetType"]["name"] }))
                    .collect()
            })
            .unwrap_or_default();
        // Hats, hair, and the face, neck, shoulder, front, back and waist
        // accessories: their models are read by the UI (src/accessories.js).
        let accessories: Vec<serde_json::Value> = avatar["assets"]
            .as_array()
            .map(|list| {
                list.iter()
                    .filter(|a| matches!(a["assetType"]["id"].as_i64(), Some(8 | 41..=47)))
                    .map(|a| serde_json::json!({ "id": a["id"].to_string(), "name": a["name"], "type": a["assetType"]["name"] }))
                    .collect()
            })
            .unwrap_or_default();
        Ok(serde_json::json!({
            "userId": user_id,
            "avatarType": avatar["playerAvatarType"],
            "bodyColors": avatar["bodyColor3s"],
            "clothing": clothing,
            "accessories": accessories,
            "headshot": picture("avatar-headshot", "150x150").await,
            "fullBody": picture("avatar", "420x420").await,
        }))
    }

    // ─── Uploading ──────────────────────────────────────────────────────
    // A picture goes up as a decal owned by the signed-in account, the way
    // Creator Hub uploads one. Roblox makes the decal, and the
    // image a game draws, in the background: the upload is polled until it's
    // done, then the decal is read back for its image ID.

    /// Creates an asset on the signed-in account (Roblox's user-auth Assets
    /// API) and waits for it: (its asset ID, its moderation state). Types:
    /// "Decal" (png, jpeg, bmp, tga), "Audio" (mp3, ogg, wav, flac),
    /// "Model" (fbx, gltf, glb).
    async fn create_asset(&self, bytes: Vec<u8>, asset_type: &str, file_name: &str, mime: &str, name: &str, description: &str) -> Result<(String, Option<String>), String> {
        let user = self.account.status().user.ok_or("Sign in with Roblox first: uploads go to your account.")?;
        let request = serde_json::json!({
            "assetType": asset_type,
            "displayName": name.chars().take(50).collect::<String>(),
            "description": description.chars().take(1000).collect::<String>(),
            "creationContext": { "creator": { "userId": user.id } },
        })
        .to_string();
        let (file_name, mime) = (file_name.to_string(), mime.to_string());
        let form = || {
            reqwest::multipart::Form::new().text("request", request.clone()).part(
                "fileContent",
                reqwest::multipart::Part::bytes(bytes.clone()).file_name(file_name.clone()).mime_str(&mime).expect("a mime type"),
            )
        };
        const SIGNED_IN: &str = "https://apis.roblox.com/assets/user-auth/v1";
        let signed_in_url = format!("{SIGNED_IN}/assets");
        let created = self.retrying(|| self.account.post_form(&signed_in_url, &form)).await?;
        if !created.status().is_success() {
            return Err(reason(created).await);
        }
        let mut operation: serde_json::Value = created.json().await.map_err(|e| e.to_string())?;
        let mut tries = 0;
        while operation["done"] != true {
            tries += 1;
            if tries > 90 {
                return Err("Roblox is taking too long with the upload.".into());
            }
            crate::account::tokio_sleep(Duration::from_millis((1000 + tries * 250).min(3000))).await;
            let path = operation["path"]
                .as_str()
                .map(str::to_string)
                .or_else(|| operation["operationId"].as_str().map(|id| format!("operations/{id}")))
                .ok_or("Roblox didn't say how to follow the upload.")?;
            let url = format!("{SIGNED_IN}/{path}");
            let polled = self.account.get(&url, &[]).await.ok_or("Signed out of Roblox during the upload.")?;
            if !polled.status().is_success() {
                return Err(reason(polled).await);
            }
            operation = polled.json().await.map_err(|e| e.to_string())?;
        }
        if let Some(message) = operation["error"]["message"].as_str() {
            return Err(message.to_string());
        }
        let id = operation["response"]["assetId"]
            .as_str()
            .map(str::to_string)
            .or_else(|| operation["response"]["assetId"].as_i64().map(|i| i.to_string()))
            .ok_or("Roblox didn't make the asset.")?;
        let moderation = operation["response"]["moderationResult"]["moderationState"].as_str().map(str::to_string);
        Ok((id, moderation))
    }

    /// A sound (for an SFX node's ID) or a 3D model (for a Mesh VISUAL: the
    /// mesh and texture IDs inside the model Roblox makes of it).
    pub async fn upload_media(&self, kind: &str, bytes: Vec<u8>, file_name: &str, name: &str, description: &str) -> Result<serde_json::Value, String> {
        let ext = file_name.rsplit('.').next().unwrap_or("").to_lowercase();
        match kind {
            "audio" => {
                let mime = match ext.as_str() {
                    "mp3" => "audio/mpeg",
                    "ogg" => "audio/ogg",
                    "wav" => "audio/wav",
                    "flac" => "audio/flac",
                    _ => return Err("Audio goes up as mp3, ogg, wav or flac.".into()),
                };
                let (id, moderation) = self.create_asset(bytes, "Audio", file_name, mime, name, description).await?;
                Ok(serde_json::json!({ "kind": "audio", "soundId": id, "moderation": moderation }))
            }
            "model" => {
                let mime = match ext.as_str() {
                    "fbx" => "model/fbx",
                    "glb" => "model/gltf-binary",
                    "gltf" => "model/gltf+json",
                    _ => return Err("A model goes up as fbx, glb or gltf.".into()),
                };
                let (id, moderation) = self.create_asset(bytes, "Model", file_name, mime, name, description).await?;
                // The model Roblox made holds MeshParts: their mesh and texture.
                let mut found = (None, None);
                for attempt in 0..10u64 {
                    if attempt > 0 {
                        crate::account::tokio_sleep(Duration::from_millis(1500 * attempt)).await;
                    }
                    if let Ok(model) = self.model(&id).await {
                        found = mesh_ids(&model);
                        if found.0.is_some() {
                            break;
                        }
                    }
                }
                Ok(serde_json::json!({ "kind": "model", "modelId": id, "meshId": found.0, "textureId": found.1, "moderation": moderation }))
            }
            _ => Err(format!("Unknown kind {kind}")),
        }
    }

    pub async fn upload_decal(&self, png: Vec<u8>, name: &str, description: &str) -> Result<Uploaded, String> {
        let (decal_id, moderation) = self.create_asset(png, "Decal", "step.png", "image/png", name, description).await?;
        // A new decal takes a moment to be readable.
        let mut last = String::from("Couldn't find the picture behind that decal.");
        for attempt in 0..10u64 {
            if attempt > 0 {
                crate::account::tokio_sleep(Duration::from_millis(1500 * attempt)).await;
            }
            match self.image_of_decal(&decal_id).await {
                Ok(image_id) => {
                    self.keep(&AssetInfo {
                        id: decal_id.clone(),
                        name: Some(name.to_string()),
                        type_id: Some(13),
                        type_name: Some("Decal".into()),
                        file: Some(String::new()),
                        points_to: Some(image_id.clone()),
                        ..Default::default()
                    });
                    return Ok(Uploaded { decal_id, image_id, moderation });
                }
                Err(e) => last = e,
            }
        }
        Err(last)
    }

    /// The image a decal shows, read from the decal itself (never cached:
    /// a decal Roblox is still making isn't kept half-done).
    async fn image_of_decal(&self, decal_id: &str) -> Result<String, String> {
        let (location, _) = self.locate(decal_id).await?;
        let bytes = self.download(&location).await?;
        inner_asset(&bytes).filter(|id| id != decal_id).ok_or_else(|| "The decal isn't ready yet.".to_string())
    }

    /// Sends, waiting and trying again while Roblox says to slow down.
    async fn retrying<F, Fut>(&self, send: F) -> Result<reqwest::Response, String>
    where
        F: Fn() -> Fut,
        Fut: std::future::Future<Output = Result<reqwest::Response, String>>,
    {
        let mut attempt = 0u32;
        loop {
            let r = send().await?;
            if r.status().as_u16() != 429 || attempt >= 6 {
                return Ok(r);
            }
            let after = r.headers().get("retry-after").and_then(|v| v.to_str().ok()).and_then(|v| v.parse::<u64>().ok());
            crate::account::tokio_sleep(Duration::from_secs(after.unwrap_or(1 << attempt).min(30))).await;
            attempt += 1;
        }
    }

    pub fn read(&self, id: &str) -> Result<Vec<u8>, String> {
        valid_id(id)?;
        let info = self.saved(id).ok_or("Not fetched yet")?;
        let path: &Path = &self.dir.join(info.file.unwrap_or_default());
        fs::read(path).map_err(|e| e.to_string())
    }

    pub fn clear(&self) -> Result<usize, String> {
        let mut n = 0;
        for entry in fs::read_dir(&self.dir).map_err(|e| e.to_string())?.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name != "roblox-cache-index.json" && fs::remove_file(entry.path()).is_ok() {
                n += 1;
            }
        }
        Ok(n)
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Uploaded {
    pub decal_id: String,
    /// What a game draws: the ID a VISUAL's TEXTURE wants.
    pub image_id: String,
    pub moderation: Option<String>,
}

/// What Roblox said went wrong, in its own words where it gave any.
async fn reason(r: reqwest::Response) -> String {
    let status = r.status().as_u16();
    let v: serde_json::Value = r.json().await.unwrap_or_default();
    v["message"]
        .as_str()
        .or_else(|| v["errors"][0]["message"].as_str())
        .map(str::to_string)
        .unwrap_or_else(|| format!("Roblox answered {status}"))
}

/// The first asset ID a model or decal file refers to (its Texture,
/// SoundId…), from XML or from a binary model's LZ4/zstd chunks.
fn inner_asset(bytes: &[u8]) -> Option<String> {
    let text = if bytes.starts_with(b"<roblox!") { binary_model_text(bytes) } else { String::from_utf8_lossy(bytes).to_string() };
    let re = regex::Regex::new(r"(?i)(?:rbxassetid://|roblox\.com/asset/?\?id=)(\d+)").ok()?;
    re.captures(&text).map(|c| c[1].to_string())
}

/// The first MeshId and TextureID in a model (a MeshPart's or a SpecialMesh's).
fn mesh_ids(bytes: &[u8]) -> (Option<String>, Option<String>) {
    let text = if bytes.starts_with(b"<roblox!") { binary_model_text(bytes) } else { String::from_utf8_lossy(bytes).to_string() };
    let find = |prop: &str| {
        regex::Regex::new(&format!(r"(?is){prop}.{{0,80}}?(?:rbxassetid://|roblox\.com/asset/?\?id=)(\d+)"))
            .ok()
            .and_then(|re| re.captures(&text).map(|c| c[1].to_string()))
    };
    (find("MeshId"), find("TextureI[dD]"))
}

fn binary_model_text(bytes: &[u8]) -> String {
    let mut out = String::new();
    let mut at = 32; // the file header
    while at + 16 <= bytes.len() {
        let name = &bytes[at..at + 4];
        let packed = u32::from_le_bytes(bytes[at + 4..at + 8].try_into().unwrap()) as usize;
        let size = u32::from_le_bytes(bytes[at + 8..at + 12].try_into().unwrap()) as usize;
        let data_at = at + 16;
        let stored = if packed == 0 { size } else { packed };
        let Some(data) = bytes.get(data_at..data_at + stored) else { break };
        let chunk = if packed == 0 {
            data.to_vec()
        } else if data.starts_with(&[0x28, 0xb5, 0x2f, 0xfd]) {
            zstd::decode_all(data).unwrap_or_default()
        } else {
            lz4_flex::block::decompress(data, size).unwrap_or_default()
        };
        out.push_str(&String::from_utf8_lossy(&chunk));
        at = data_at + stored;
        if name == b"END\0" {
            break;
        }
    }
    out
}

// A key saved by an older version (the Open Cloud key, since removed) is
// deleted from Windows' Credential Manager rather than left behind.
pub fn forget_old_key() {
    if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER) {
        let _ = entry.delete_credential();
    }
}
