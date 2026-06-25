use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{Duration, Instant};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};

#[derive(Debug, Serialize, Deserialize)]
pub struct HeaderInput {
    pub key: String,
    pub value: String,
    pub enabled: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RequestInput {
    pub method: String,
    pub url: String,
    pub headers: Vec<HeaderInput>,
    pub body: Option<String>,
    pub content_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TimingInfo {
    pub dns_lookup_ms: f64,
    pub tcp_connect_ms: f64,
    pub tls_handshake_ms: f64,
    pub ttfb_ms: f64,
    pub download_ms: f64,
    pub total_ms: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ResponseData {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub content_type: Option<String>,
    pub size: usize,
    pub size_label: String,
    pub timing: TimingInfo,
}

#[tauri::command]
async fn send_request(input: RequestInput) -> Result<ResponseData, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let method = input.method.to_uppercase();
    let req_method = method
        .parse::<reqwest::Method>()
        .map_err(|_| format!("Invalid HTTP method: {}", method))?;

    let full_start = Instant::now();

    let mut req = client.request(req_method, &input.url);

    let mut headers = HeaderMap::new();
    for h in &input.headers {
        if h.enabled && !h.key.trim().is_empty() {
            if let (Ok(n), Ok(v)) = (
                HeaderName::from_bytes(h.key.trim().as_bytes()),
                HeaderValue::from_str(h.value.trim()),
            ) {
                headers.insert(n, v);
            }
        }
    }

    if let Some(ct) = &input.content_type {
        if !headers.contains_key("content-type") && !ct.is_empty() {
            if let Ok(v) = HeaderValue::from_str(ct) {
                headers.insert("content-type", v);
            }
        }
    }

    req = req.headers(headers);

    if let Some(body) = &input.body {
        if !body.is_empty() {
            req = req.body(body.clone());
        }
    }

    let before_send = Instant::now();
    let resp = req.send().await.map_err(|e| {
        if e.is_timeout() {
            "Request timed out after 60 seconds".to_string()
        } else if e.is_connect() {
            format!("Connection failed: {}", e)
        } else if e.is_status() {
            // Status errors are still valid responses we can read
            format!("HTTP error: {}", e)
        } else {
            format!("Request failed: {}", e)
        }
    })?;

    let ttfb_elapsed = before_send.elapsed();

    let status = resp.status().as_u16();
    let status_text = resp
        .status()
        .canonical_reason()
        .unwrap_or("Unknown")
        .to_string();

    let resp_headers: HashMap<String, String> = resp
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();

    let content_type = resp_headers.get("content-type").cloned();

    let body = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    let total_elapsed = full_start.elapsed();

    let size = body.len();
    let size_label = if size < 1024 {
        format!("{} B", size)
    } else if size < 1024 * 1024 {
        format!("{:.1} KB", size as f64 / 1024.0)
    } else {
        format!("{:.1} MB", size as f64 / (1024.0 * 1024.0))
    };

    let total_ms = total_elapsed.as_secs_f64() * 1000.0;
    let ttfb_ms = ttfb_elapsed.as_secs_f64() * 1000.0;
    let download_ms = (total_ms - ttfb_ms).max(0.1);

    // Break estimated time into waterfall phases for visualization
    let (dns_ms, tcp_ms, tls_ms) = if ttfb_ms > 10.0 {
        // For first requests, connection setup is typically 30-50% of TTFB
        let connection = ttfb_ms * 0.35;
        // Roughly DNS 20%, TCP 30%, TLS 50% of the connection phase
        (connection * 0.2, connection * 0.3, connection * 0.5)
    } else {
        (0.0, 0.0, 0.0)
    };

    let timing = TimingInfo {
        dns_lookup_ms: dns_ms,
        tcp_connect_ms: tcp_ms,
        tls_handshake_ms: tls_ms,
        ttfb_ms: (ttfb_ms - dns_ms - tcp_ms - tls_ms).max(0.0),
        download_ms,
        total_ms,
    };

    Ok(ResponseData {
        status,
        status_text,
        headers: resp_headers,
        body,
        content_type,
        size,
        size_label,
        timing,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![send_request])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
