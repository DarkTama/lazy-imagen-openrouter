//! Native provider HTTP: injects the API key from the OS keyring so JS never
//! holds it. Never logs keys or bodies.

use std::collections::HashMap;
use std::time::Duration;

use serde::Serialize;

use crate::keys::{self, SecretStore};

const MAX_BODY: usize = 50 * 1024 * 1024;

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FetchResult {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
}

#[derive(Debug)]
pub(crate) struct Prepared {
    pub method: reqwest::Method,
    pub url: reqwest::Url,
    pub headers: Vec<(String, String)>,
}

pub fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("client init failed: {e}"))
}

pub(crate) fn prepare_request(
    url: &str,
    method: &str,
    headers: &HashMap<String, String>,
    key: Option<&str>,
) -> Result<Prepared, String> {
    let url = reqwest::Url::parse(url).map_err(|_| "invalid url".to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("unsupported url scheme".into());
    }
    let method = match method.to_ascii_uppercase().as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        _ => return Err("method not allowed".into()),
    };
    let mut out: Vec<(String, String)> = headers
        .iter()
        .filter(|(k, _)| {
            !matches!(
                k.to_ascii_lowercase().as_str(),
                "authorization" | "host" | "content-length"
            )
        })
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    if let Some(k) = key.filter(|k| !k.is_empty()) {
        out.push(("Authorization".into(), format!("Bearer {k}")));
    }
    Ok(Prepared { method, url, headers: out })
}

/// key_override (from JS, pre-save tests) wins over the stored key.
pub(crate) fn resolve_key(
    store: &dyn SecretStore,
    provider_id: Option<&str>,
    key_override: Option<&str>,
) -> Result<Option<String>, String> {
    if let Some(k) = key_override.filter(|k| !k.is_empty()) {
        return Ok(Some(k.to_string()));
    }
    match provider_id {
        Some(id) => {
            keys::validate_provider_id(id)?;
            Ok(store.get(id)?.filter(|k| !k.is_empty()))
        }
        None => Ok(None),
    }
}

pub(crate) async fn execute(
    client: &reqwest::Client,
    prepared: Prepared,
    body: Option<String>,
) -> Result<FetchResult, String> {
    let mut req = client.request(prepared.method, prepared.url);
    for (k, v) in &prepared.headers {
        req = req.header(k.as_str(), v.as_str());
    }
    if let Some(b) = body {
        req = req.body(b);
    }
    let resp = req.send().await.map_err(|e| format!("network: {}", e.without_url()))?;
    let status = resp.status().as_u16();
    let mut headers = HashMap::new();
    for (k, v) in resp.headers() {
        if let Ok(v) = v.to_str() {
            headers.insert(k.as_str().to_string(), v.to_string());
        }
    }
    if resp.content_length().is_some_and(|l| l > MAX_BODY as u64) {
        return Err("response too large".into());
    }
    let bytes = resp.bytes().await.map_err(|e| format!("network: {}", e.without_url()))?;
    if bytes.len() > MAX_BODY {
        return Err("response too large".into());
    }
    Ok(FetchResult { status, headers, body: String::from_utf8_lossy(&bytes).into_owned() })
}

#[tauri::command]
pub async fn provider_fetch(
    client: tauri::State<'_, reqwest::Client>,
    provider_id: Option<String>,
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
    key_override: Option<String>,
) -> Result<FetchResult, String> {
    let key = resolve_key(&keys::KeyringStore, provider_id.as_deref(), key_override.as_deref())?;
    let prepared = prepare_request(&url, &method, &headers, key.as_deref())?;
    execute(&client, prepared, body).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::io::{Read, Write};

    #[derive(Default)]
    struct MemStore(RefCell<HashMap<String, String>>);
    impl SecretStore for MemStore {
        fn get(&self, id: &str) -> Result<Option<String>, String> {
            Ok(self.0.borrow().get(id).cloned())
        }
        fn set(&self, id: &str, key: &str) -> Result<(), String> {
            self.0.borrow_mut().insert(id.into(), key.into());
            Ok(())
        }
        fn delete(&self, id: &str) -> Result<(), String> {
            self.0.borrow_mut().remove(id);
            Ok(())
        }
    }

    fn hm(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn rejects_bad_scheme_and_method() {
        let h = HashMap::new();
        assert!(prepare_request("file:///etc/passwd", "GET", &h, None).is_err());
        assert!(prepare_request("ftp://x/y", "GET", &h, None).is_err());
        assert!(prepare_request("not a url", "GET", &h, None).is_err());
        assert!(prepare_request("https://x/y", "DELETE", &h, None).is_err());
        assert!(prepare_request("http://x/y", "post", &h, None).is_ok());
    }

    #[test]
    fn filters_headers_and_injects_auth() {
        let h = hm(&[("AUTHORIZATION", "Bearer leak"), ("Host", "evil"), ("Content-Length", "9"), ("Content-Type", "application/json")]);
        let p = prepare_request("https://x/y", "POST", &h, Some("k")).unwrap();
        assert_eq!(p.headers.len(), 2);
        assert!(p.headers.contains(&("Content-Type".into(), "application/json".into())));
        assert!(p.headers.contains(&("Authorization".into(), "Bearer k".into())));
        let p = prepare_request("https://x/y", "GET", &h, None).unwrap();
        assert!(!p.headers.iter().any(|(k, _)| k.eq_ignore_ascii_case("authorization")));
    }

    #[test]
    fn key_resolution() {
        let s = MemStore::default();
        s.set("p", "stored").unwrap();
        assert_eq!(resolve_key(&s, Some("p"), None).unwrap().as_deref(), Some("stored"));
        assert_eq!(resolve_key(&s, Some("p"), Some("ov")).unwrap().as_deref(), Some("ov"));
        assert_eq!(resolve_key(&s, None, Some("ov")).unwrap().as_deref(), Some("ov"));
        assert_eq!(resolve_key(&s, Some("q"), None).unwrap(), None);
        assert_eq!(resolve_key(&s, None, None).unwrap(), None);
        assert!(resolve_key(&s, Some("bad id"), None).is_err());
    }

    #[test]
    fn local_server_passthrough() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let t = std::thread::spawn(move || {
            let (mut sock, _) = listener.accept().unwrap();
            let mut buf = Vec::new();
            let mut chunk = [0u8; 1024];
            loop {
                let n = sock.read(&mut chunk).unwrap();
                buf.extend_from_slice(&chunk[..n]);
                if n == 0 || buf.windows(4).any(|w| w == b"\r\n\r\n") {
                    break;
                }
            }
            let body = "{\"err\":\"teapot\"}";
            let resp = format!(
                "HTTP/1.1 418 I'm a teapot\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(), body
            );
            sock.write_all(resp.as_bytes()).unwrap();
            String::from_utf8_lossy(&buf).into_owned()
        });
        let client = build_client().unwrap();
        let p = prepare_request(
            &format!("http://127.0.0.1:{port}/v1/x"),
            "GET",
            &hm(&[("Authorization", "Bearer leak")]),
            Some("k"),
        )
        .unwrap();
        let r = tauri::async_runtime::block_on(execute(&client, p, None)).unwrap();
        assert_eq!(r.status, 418);
        assert_eq!(r.body, "{\"err\":\"teapot\"}");
        assert_eq!(r.headers.get("content-type").map(String::as_str), Some("application/json"));
        let req = t.join().unwrap().to_ascii_lowercase();
        assert!(req.contains("authorization: bearer k"));
        assert!(!req.contains("leak"));
    }
}
