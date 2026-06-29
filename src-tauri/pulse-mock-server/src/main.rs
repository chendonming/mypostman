// ============================================================
// Pulse Mock 服务器（独立二进制）
//
// 轻量级 HTTP 模拟服务器，监听端口 18789，用于测试 Pulse 的
// 请求/断言功能。无需 Tauri 或 Vite，直接运行即可。
// ============================================================

use axum::{
    extract::Path,
    http::{HeaderMap, HeaderValue, StatusCode},
    routing::{delete, get, post, put},
    Json, Router,
};
use serde_json::{json, Value};
use std::net::SocketAddr;
use tokio::net::TcpListener;

/** Mock 服务器监听端口 */
const MOCK_PORT: u16 = 18789;

/** 单次请求返回数据的最大条数限制 */
const MAX_MOCK_COUNT: u64 = 10_000;

/** 生成单条 Mock 数据（复杂嵌套结构） */
fn generate_mock_item(id: u64) -> Value {
    json!({
        "id": id,
        "name": format!("Item {}", id),
        "email": format!("user{}@test.com", id),
        "status": if id % 3 == 0 { "inactive" } else { "active" },
        "createdAt": format!("2024-01-{:02}T00:00:00Z", (id % 28 + 1)),
        "profile": {
            "age": 20 + (id % 40),
            "avatar": format!("https://example.com/avatars/{}.png", id),
            "address": {
                "city": match id % 5 {
                    0 => "Beijing",
                    1 => "Shanghai",
                    2 => "Shenzhen",
                    3 => "Guangzhou",
                    _ => "Hangzhou",
                },
                "country": "China"
            }
        },
        "tags": ["tag1", "tag2"],
        "score": 50.0 + (id % 50) as f64,
        "deleted": false
    })
}

/** 向响应头注入 X-Mock-Server 标识 */
fn mock_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert("X-Mock-Server", HeaderValue::from_static("true"));
    headers
}

// ============================================================
// 路由处理函数
// ============================================================

/**
 * GET /mock/api/get/{count}
 *
 * 返回 count 条 Mock 数据。
 *   边界测试：
 *   - count=0   → 空数组
 *   - count=1   → 单条
 *   - count>10000 → 400 错误
 */
async fn handle_get(Path(count): Path<u64>) -> Result<(HeaderMap, Json<Value>), (StatusCode, Json<Value>)> {
    if count > MAX_MOCK_COUNT {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": format!("Count exceeds maximum limit of {}", MAX_MOCK_COUNT),
                "max_allowed": MAX_MOCK_COUNT,
                "requested": count
            })),
        ));
    }

    let items: Vec<Value> = (0..count).map(|i| generate_mock_item(i + 1)).collect();
    let mut headers = mock_headers();
    headers.insert("X-Mock-Count", HeaderValue::from_str(&count.to_string()).unwrap());

    Ok((headers, Json(json!({
        "success": true,
        "total": count,
        "items": items
    }))))
}

/**
 * POST /mock/api/data
 *
 * 回显请求体，附加生成 ID。
 *   边界测试：
 *   - 空请求体 → 400
 */
async fn handle_post(
    headers: HeaderMap,
    body: Option<Json<Value>>,
) -> Result<(HeaderMap, Json<Value>), (StatusCode, Json<Value>)> {
    let content_len = headers
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(0);

    if content_len == 0 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": "Request body is empty",
                "usage": "Send a JSON body to POST /mock/api/data"
            })),
        ));
    }

    let received = body.unwrap_or(Json(json!(null)));

    let mut resp_headers = mock_headers();
    resp_headers.insert("X-Mock-Resource", HeaderValue::from_static("created"));

    Ok((resp_headers, Json(json!({
        "success": true,
        "id": 10001,
        "received": received.0,
        "status": "created"
    }))))
}

/**
 * PUT /mock/api/data/{id}
 *
 * 模拟更新资源，回显请求体。
 *   边界：id=0 视为无效返回 400
 */
async fn handle_put(
    Path(id): Path<u64>,
    body: Option<Json<Value>>,
) -> Result<(HeaderMap, Json<Value>), (StatusCode, Json<Value>)> {
    if id == 0 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": "Invalid ID: ID must be greater than 0"
            })),
        ));
    }

    let received = body.unwrap_or(Json(json!(null)));

    let mut headers = mock_headers();
    headers.insert("X-Mock-Resource", HeaderValue::from_static("updated"));

    Ok((headers, Json(json!({
        "success": true,
        "id": id,
        "updated": received.0,
        "status": "updated"
    }))))
}

/**
 * DELETE /mock/api/data/{id}
 *
 * 模拟删除资源。
 *   边界：id=0 返回 400
 */
async fn handle_delete(
    Path(id): Path<u64>,
) -> Result<(HeaderMap, Json<Value>), (StatusCode, Json<Value>)> {
    if id == 0 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": "Invalid ID: ID must be greater than 0"
            })),
        ));
    }

    let mut headers = mock_headers();
    headers.insert("X-Mock-Resource", HeaderValue::from_static("deleted"));

    Ok((headers, Json(json!({
        "success": true,
        "id": id,
        "status": "deleted"
    }))))
}

/** 构建 axum 路由表 */
fn create_router() -> Router {
    Router::new()
        .route("/mock/api/get/:count", get(handle_get))
        .route("/mock/api/data", post(handle_post))
        .route("/mock/api/data/:id", put(handle_put))
        .route("/mock/api/data/:id", delete(handle_delete))
}

/**
 * 启动 Mock HTTP 服务器
 *
 * 监听 127.0.0.1:18789，提供模拟 REST API 端点。
 * 启动成功后在 stderr 打印就绪信息。
 */
#[tokio::main]
async fn main() {
    let addr = SocketAddr::from(([127, 0, 0, 1], MOCK_PORT));
    let app = create_router();

    let listener = match TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[mock-server] ❌ 绑定端口失败 http://{addr}: {e}");
            eprintln!("[mock-server]    端口 {MOCK_PORT} 可能已被占用，请检查");
            return;
        }
    };

    println!("[mock-server] ✅ Ready at http://{addr}");
    println!("[mock-server]    端口: {MOCK_PORT}");
    println!("[mock-server]    Endpoints:");
    println!("[mock-server]       GET    /mock/api/get/:count");
    println!("[mock-server]       POST   /mock/api/data");
    println!("[mock-server]       PUT    /mock/api/data/:id");
    println!("[mock-server]       DELETE /mock/api/data/:id");

    if let Err(e) = axum::serve(listener, app).await {
        eprintln!("[mock-server] ❌ 服务器运行失败: {e}");
    }
}
