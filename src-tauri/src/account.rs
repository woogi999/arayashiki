// Signing in with Roblox the way a browser does: Arayashiki opens Roblox's
// own login page (https://www.roblox.com/login) in a separate window, the
// user signs in there as they would in any browser (captcha, 2-step and all),
// and the app keeps the session Roblox gives that window. Afterwards its
// requests to Roblox carry that session, as the website's own requests do.
//
// That session (the .ROBLOSECURITY cookie) is full access to the account,
// so it's handled narrowly:
//   * the login window has its own browser profile, apart from the editor's,
//     no access to the app's commands, and its browsing data is wiped as
//     soon as the session is taken;
//   * the session is kept in Windows Credential Manager, never written to a
//     file, never handed to the editor's page (it only ever sees the name
//     and picture);
//   * it's only ever sent over HTTPS to *.roblox.com;
//   * signing out logs the session out on Roblox's side too.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

const KEYRING_SERVICE: &str = "Arayashiki";
const KEYRING_SESSION: &str = "roblox-session";
const LOGIN_URL: &str = "https://www.roblox.com/login";
const LOGIN_WINDOW: &str = "roblox-login";
pub const COOKIE: &str = ".ROBLOSECURITY";

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: String,
    /// Display name.
    pub name: String,
    pub username: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub signed_in: bool,
    pub user: Option<User>,
    pub waiting: bool,
}

pub struct Account {
    config_path: PathBuf,
    user: Mutex<Option<User>>,
    waiting: AtomicBool,
    cancel: Arc<AtomicBool>,
    client: reqwest::Client,
}

fn entry() -> Option<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_SESSION).ok()
}

/// The saved session, if any.
fn session() -> Option<String> {
    entry()?.get_password().ok().filter(|s| !s.is_empty())
}

fn save_session(value: Option<&str>) {
    if let Some(e) = entry() {
        let _ = match value {
            Some(v) => e.set_password(v),
            None => e.delete_credential(),
        };
    }
}

/// True for the only URLs the session may be sent to.
fn is_roblox(url: &str) -> bool {
    url::Url::parse(url)
        .ok()
        .filter(|u| u.scheme() == "https")
        .and_then(|u| u.host_str().map(|h| h == "roblox.com" || h.ends_with(".roblox.com")))
        .unwrap_or(false)
}

impl Account {
    pub fn new(config_dir: PathBuf) -> Self {
        let _ = std::fs::create_dir_all(&config_dir);
        let config_path = config_dir.join("account.json");
        let user = std::fs::read(&config_path).ok().and_then(|b| serde_json::from_slice(&b).ok());
        Account {
            config_path,
            user: Mutex::new(user),
            waiting: AtomicBool::new(false),
            cancel: Arc::new(AtomicBool::new(false)),
            client: reqwest::Client::builder()
                // What the website's own requests look like.
                .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Arayashiki")
                .timeout(Duration::from_secs(20))
                .build()
                .expect("an HTTP client"),
        }
    }

    fn remember(&self, user: Option<User>) {
        *self.user.lock().unwrap() = user.clone();
        match user {
            Some(u) => {
                if let Ok(json) = serde_json::to_vec_pretty(&u) {
                    let _ = std::fs::write(&self.config_path, json);
                }
            }
            None => {
                let _ = std::fs::remove_file(&self.config_path);
            }
        }
    }

    pub fn status(&self) -> Status {
        let signed_in = session().is_some();
        Status {
            signed_in,
            user: if signed_in { self.user.lock().unwrap().clone() } else { None },
            waiting: self.waiting.load(Ordering::SeqCst),
        }
    }

    /// The session, for a request to `url`, if that's a Roblox URL.
    pub fn cookie_for(&self, url: &str) -> Option<String> {
        is_roblox(url).then(session).flatten().map(|s| format!("{COOKIE}={s}"))
    }

    /// A GET to Roblox as the signed-in user.
    pub async fn get(&self, url: &str, headers: &[(&str, &str)]) -> Option<reqwest::Response> {
        let cookie = self.cookie_for(url)?;
        let mut r = self.client.get(url).header(reqwest::header::COOKIE, cookie);
        for (k, v) in headers {
            r = r.header(*k, *v);
        }
        r.send().await.ok()
    }

    /// A multipart POST to Roblox as the signed-in user. Roblox answers the
    /// first try with a CSRF token to repeat it with, as it does the website.
    pub async fn post_form(
        &self,
        url: &str,
        form: impl Fn() -> reqwest::multipart::Form,
    ) -> Result<reqwest::Response, String> {
        let cookie = self.cookie_for(url).ok_or("Sign in with Roblox first.")?;
        let send = |token: Option<String>| {
            let mut r = self.client.post(url).header(reqwest::header::COOKIE, cookie.clone()).multipart(form());
            if let Some(t) = token {
                r = r.header("x-csrf-token", t);
            }
            r.send()
        };
        let first = send(None).await.map_err(|e| e.to_string())?;
        if first.status().as_u16() == 403 {
            if let Some(token) = first.headers().get("x-csrf-token").and_then(|v| v.to_str().ok()).map(str::to_string) {
                return send(Some(token)).await.map_err(|e| e.to_string());
            }
        }
        Ok(first)
    }

    async fn who(&self, cookie: &str) -> Result<User, String> {
        let r = self
            .client
            .get("https://users.roblox.com/v1/users/authenticated")
            .header(reqwest::header::COOKIE, format!("{COOKIE}={cookie}"))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !r.status().is_success() {
            return Err("Roblox says that session isn't signed in.".into());
        }
        let v: serde_json::Value = r.json().await.map_err(|e| e.to_string())?;
        Ok(User {
            id: v["id"].as_i64().map(|i| i.to_string()).ok_or("Roblox sent no user")?,
            name: v["displayName"].as_str().unwrap_or_default().to_string(),
            username: v["name"].as_str().unwrap_or_default().to_string(),
        })
    }

    /// Checks the saved session is still signed in; forgets it if not.
    pub async fn refresh_user(&self) -> Option<User> {
        let cookie = session()?;
        match self.who(&cookie).await {
            Ok(user) => {
                self.remember(Some(user.clone()));
                Some(user)
            }
            Err(_) => {
                save_session(None);
                self.remember(None);
                None
            }
        }
    }

    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }

    /// Opens Roblox's login page in its own window and waits for the user to
    /// sign in there (up to ten minutes, or until they close the window).
    pub async fn sign_in(&self, app: tauri::AppHandle) -> Result<User, String> {
        if let Some(old) = app.get_webview_window(LOGIN_WINDOW) {
            let _ = old.set_focus();
            return Err("The Roblox sign-in window is already open.".into());
        }
        let profile = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("roblox-login");
        let window = WebviewWindowBuilder::new(&app, LOGIN_WINDOW, WebviewUrl::External(LOGIN_URL.parse().unwrap()))
            .title("Sign in to Roblox · Arayashiki")
            .inner_size(480.0, 760.0)
            .center()
            .data_directory(profile)
            .build()
            .map_err(|e| format!("Couldn't open the sign-in window: {e}"))?;
        self.cancel.store(false, Ordering::SeqCst);
        self.waiting.store(true, Ordering::SeqCst);
        let deadline = Instant::now() + Duration::from_secs(600);
        let site: url::Url = "https://www.roblox.com".parse().unwrap();
        let result = loop {
            tokio_sleep(Duration::from_millis(700)).await;
            if self.cancel.load(Ordering::SeqCst) {
                break Err("Sign-in cancelled.".to_string());
            }
            if Instant::now() > deadline {
                break Err("Timed out waiting for the sign-in (10 minutes).".to_string());
            }
            // Closed by the user?
            if app.get_webview_window(LOGIN_WINDOW).is_none() {
                break Err("The sign-in window was closed.".to_string());
            }
            let w = window.clone();
            let site = site.clone();
            let cookies = tauri::async_runtime::spawn_blocking(move || w.cookies_for_url(site)).await;
            let Ok(Ok(cookies)) = cookies else { continue };
            if let Some(c) = cookies.iter().find(|c| c.name() == COOKIE && !c.value().is_empty()) {
                break Ok(c.value().to_string());
            }
        };
        self.waiting.store(false, Ordering::SeqCst);
        // Wipe the login window's profile: the app keeps the session itself.
        if let Some(w) = app.get_webview_window(LOGIN_WINDOW) {
            let _ = w.clear_all_browsing_data();
            let _ = w.close();
        }
        let cookie = result?;
        let user = self.who(&cookie).await?;
        save_session(Some(&cookie));
        self.remember(Some(user.clone()));
        Ok(user)
    }

    /// Logs the session out on Roblox's side, and forgets it here.
    pub async fn sign_out(&self) {
        if let Some(cookie) = session() {
            let url = "https://auth.roblox.com/v2/logout";
            let send = |token: Option<String>| {
                let mut r = self.client.post(url).header(reqwest::header::COOKIE, format!("{COOKIE}={cookie}")).header("Content-Length", "0");
                if let Some(t) = token {
                    r = r.header("x-csrf-token", t);
                }
                r.send()
            };
            // Roblox answers the first POST with the CSRF token to repeat it with.
            if let Ok(first) = send(None).await {
                if let Some(token) = first.headers().get("x-csrf-token").and_then(|v| v.to_str().ok()).map(str::to_string) {
                    let _ = send(Some(token)).await;
                }
            }
        }
        save_session(None);
        self.remember(None);
    }
}

pub(crate) async fn tokio_sleep(d: Duration) {
    let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(d)).await;
}
