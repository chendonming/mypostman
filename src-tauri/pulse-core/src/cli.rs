// ============================================================
// CLI 命令行界面模块
//
// 使用 clap 实现参数解析，支持 request/test/collections/
// environments/export/import 等命令。与 GUI 共享同一份数据文件。
// ============================================================

use clap::{Args, Parser, Subcommand};
use serde::Serialize;
use std::io::IsTerminal;
use std::path::PathBuf;

use crate::{
    analyze_response, execute_http_request, load_collections_data, load_environments_data,
    resolve_data_dir, save_collections_data, save_environments_data,
    substitute_variables, Collection, CollectionData, EnvironmentData, EnvironmentVariable, HeaderInput, RequestInput, ResponseData,
};
use crate::io::{self, ExportFormat};
use crate::test_runner;

// ============================================================
// CLI 参数定义
// ============================================================

/** CLI 顶层参数 */
#[derive(Parser)]
#[command(name = "pulse", version = "0.1.0", about = "Pulse — HTTP 请求调试工具 (CLI 模式)")]
struct Cli {
    /** 全局 JSON 输出模式，所有命令输出 JSON 格式 */
    #[arg(long, global = true, help = "以 JSON 格式输出（默认 human-readable）")]
    json: bool,

    #[command(subcommand)]
    command: Command,
}

/** CLI 子命令 */
#[derive(Subcommand)]
enum Command {
    /** 发送 HTTP 请求并打印响应 */
    #[command(subcommand)]
    Request(RequestCommand),
    /** 运行 YAML 测试脚本 */
    Test(TestArgs),
    /** 管理集合（列出等） */
    #[command(subcommand)]
    Collections(CollectionAction),
    /** 管理环境变量 */
    #[command(subcommand)]
    Env(EnvAction),
    /** 导出数据到文件 */
    Export(ExportArgs),
    /** 从文件导入数据 */
    Import(ImportArgs),
}

/** request 子命令（支持多种请求来源） */
#[derive(Subcommand)]
enum RequestCommand {
    /** 直接发送 HTTP 请求（url + 方法 + 头 + 体） */
    Send(RequestArgs),
    /** 从集合中按名称提取请求并发送 */
    FromCollection(RequestFromCollectionArgs),
    /** 从 JSON 文件读取完整请求配置后发送 */
    FromFile(RequestFromFileArgs),
}

/** request send 子命令参数（原有的 request 参数） */
#[derive(Args)]
struct RequestArgs {
    /** HTTP 方法 */
    #[arg(short = 'm', long, default_value = "GET", help = "HTTP 方法 (GET/POST/PUT/PATCH/DELETE 等)")]
    method: String,

    /** 请求头，支持重复: -H "Key: Value" */
    #[arg(short = 'H', long = "header", help = "请求头，格式 Key: Value（可重复）")]
    header: Vec<String>,

    /** 请求体 */
    #[arg(short = 'b', long = "body", help = "请求体字符串")]
    body: Option<String>,

    /** Content-Type */
    #[arg(short = 't', long = "content-type", help = "Content-Type 头")]
    content_type: Option<String>,

    /** 激活的环境名称 */
    #[arg(short = 'e', long = "env", help = "激活的环境名称（用于 {{key}} 变量替换）")]
    env: Option<String>,

    /** Bearer Token */
    #[arg(long = "auth-bearer", help = "Bearer Token 鉴权")]
    auth_bearer: Option<String>,

    /** 目标 URL */
    #[arg(help = "请求目标 URL")]
    url: String,
}

/** request from-collection 子命令参数 */
#[derive(Args)]
struct RequestFromCollectionArgs {
    /** 集合名称 */
    #[arg(help = "集合名称")]
    collection_name: String,

    /** 请求名称 */
    #[arg(help = "请求名称")]
    request_name: String,

    /** 激活的环境名称 */
    #[arg(short = 'e', long = "env", help = "激活的环境名称（用于 {{key}} 变量替换）")]
    env: Option<String>,
}

/** request from-file 子命令参数 */
#[derive(Args)]
struct RequestFromFileArgs {
    /** 激活的环境名称 */
    #[arg(short = 'e', long = "env", help = "激活的环境名称（用于 {{key}} 变量替换）")]
    env: Option<String>,

    /** JSON 请求配置文件的路径 */
    #[arg(help = "JSON 请求配置文件路径（包含 method/url/headers/body/content_type 的 RequestInput）")]
    path: String,
}

/** test 子命令参数 */
#[derive(Args)]
struct TestArgs {
    /** 激活的环境名称 */
    #[arg(short = 'e', long = "env", help = "激活的环境名称")]
    env: Option<String>,

    /** YAML 测试脚本路径 */
    #[arg(help = "YAML 测试脚本路径")]
    path: String,
}

/** env 子命令 */
#[derive(Subcommand)]
enum EnvAction {
    /** 列出所有环境 */
    List,
    /** 激活指定名称的环境 */
    Use { name: String },
}

/** collections 子命令 */
#[derive(Subcommand)]
enum CollectionAction {
    /** 列出所有集合 */
    List,
    /** 以树形结构展示所有集合及其请求的方法和 URL */
    Tree,
}

/** export 子命令参数 */
#[derive(Args)]
struct ExportArgs {
    /** 输出文件路径 */
    #[arg(short = 'o', long = "output", help = "输出文件路径（默认自动生成）")]
    output: Option<String>,

    /** 导出格式 */
    #[arg(short = 'f', long = "format", default_value = "json", help = "导出格式 (json|yaml)")]
    format: String,

    /** 按集合名称筛选（可重复） */
    #[arg(short = 'c', long = "collection", help = "按集合名称筛选（可重复，默认全部）")]
    collection: Vec<String>,
}

/** import 子命令参数 */
#[derive(Args)]
struct ImportArgs {
    /** 合并策略 */
    #[arg(short = 's', long = "strategy", default_value = "merge", help = "导入策略 (replace|merge)")]
    strategy: String,

    /** 导入文件路径 */
    #[arg(help = "导入文件路径 (.json/.yaml/.yml)")]
    path: String,
}

// ============================================================
// 结构化输出类型
// ============================================================

/**
 * 统一的结构化 CLI 输出，JSON 模式下所有命令输出此格式
 *
 * 示例：
 *   {"ok": true, "data": { ... }}
 *   {"ok": false, "error": "请求失败: Connection refused", "error_type": "connection", "code": 1}
 */
#[derive(Debug, Serialize)]
pub struct CliOutput<T: Serialize> {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<i32>,
}

/**
 * 带分析的响应数据（用于 JSON 模式输出）
 *
 * 在原有 ResponseData 基础上附加 _analysis 字段，
 * 帮助 AI Agent 理解响应结构。
 */
#[derive(Debug, Serialize)]
struct ResponseWithAnalysis {
    #[serde(flatten)]
    response: ResponseData,
    #[serde(rename = "_analysis")]
    analysis: crate::ResponseAnalysis,
}
impl<T: Serialize> CliOutput<T> {
    /** 创建成功输出 */
    pub fn ok(data: T) -> Self {
        CliOutput {
            ok: true,
            data: Some(data),
            error: None,
            error_type: None,
            code: None,
        }
    }

    /** 创建失败输出（自动推断错误类型） */
    pub fn err(error: String) -> Self {
        let (error_type, code) = classify_error(&error);
        CliOutput {
            ok: false,
            data: None,
            error: Some(error),
            error_type: Some(error_type),
            code: Some(code),
        }
    }
}

/**
 * 根据错误消息推断错误类型和退出码
 */
fn classify_error(error: &str) -> (String, i32) {
    let lower = error.to_lowercase();
    if lower.contains("connection") || lower.contains("dns") || lower.contains("resolve") || lower.contains("connect") || lower.contains("timeout") {
        ("connection".to_string(), 1)
    } else if lower.contains("format") || lower.contains("parse") || lower.contains("invalid") {
        ("format".to_string(), 2)
    } else if lower.contains("not found") || lower.contains("找不到") || lower.contains("不存在") {
        ("not_found".to_string(), 3)
    } else if lower.contains("permission") || lower.contains("denied") || lower.contains("auth") || lower.contains("unauthorized") {
        ("auth".to_string(), 4)
    } else {
        ("unknown".to_string(), 99)
    }
}

// ============================================================
// CLI 入口
// ============================================================

/**
 * CLI 主入口
 *
 * 1. 解析命令行参数
 * 2. 确定数据目录
 * 3. 非 TTY 环境自动启用 JSON 输出（方便 AI Agent 解析）
 * 4. 派发到对应命令处理器
 * 5. 结构化输出（JSON 模式统一样式）
 */
pub fn run() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    // 非 TTY 环境（如管道、子进程、CI）自动启用 JSON 输出
    let json_mode = cli.json || !std::io::stdout().is_terminal();
    let data_dir = resolve_data_dir()?;

    let result = match cli.command {
        Command::Request(cmd) => handle_request(&cmd, &data_dir, json_mode),
        Command::Test(args) => handle_test(&args, &data_dir, json_mode),
        Command::Collections(action) => handle_collections_action(&action, &data_dir, json_mode),
        Command::Env(action) => handle_env_action(&action, &data_dir, json_mode),
        Command::Export(args) => handle_export(&args, &data_dir, json_mode),
        Command::Import(args) => handle_import(&args, &data_dir, json_mode),
    };

    // 在 JSON 模式下，统一包裹为结构化输出
    match result {
        Ok(()) => {}
        Err(e) => {
            if json_mode {
                let output = CliOutput::<serde_json::Value>::err(format!("{}", e));
                println!("{}", serde_json::to_string(&output)?);
            } else {
                eprintln!("错误: {}", e);
            }
            std::process::exit(1);
        }
    }

    Ok(())
}

// ============================================================
// 命令处理器
// ============================================================

/**
 * 获取活跃环境变量列表
 *
 * 如果指定了 env_name，按名称查找并激活该环境；
 * 否则使用数据文件中记录的活跃环境。
 */
fn get_active_variables(
    data_dir: &std::path::Path,
    env_name: Option<&str>,
) -> Vec<EnvironmentVariable> {
    let env_data = load_environments_data(data_dir);

    // 按名称查找
    if let Some(name) = env_name {
        if let Some(env) = env_data.environments.iter().find(|e| e.name == name) {
            return env.variables.iter().filter(|v| v.enabled).cloned().collect();
        }
        // 环境名称未找到也返回空（不报错，安静替换）
        return vec![];
    }

    // 使用活跃环境
    if let Some(active_id) = &env_data.active_id {
        if let Some(env) = env_data.environments.iter().find(|e| &e.id == active_id) {
            return env.variables.iter().filter(|v| v.enabled).cloned().collect();
        }
    }

    vec![]
}

// -------- request 命令 --------

/** 处理 request 子命令调度 */
fn handle_request(
    cmd: &RequestCommand,
    data_dir: &std::path::Path,
    json_mode: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    match cmd {
        RequestCommand::Send(args) => handle_send_request(args, data_dir, json_mode),
        RequestCommand::FromCollection(args) => handle_request_from_collection(args, data_dir, json_mode),
        RequestCommand::FromFile(args) => handle_request_from_file(args, data_dir, json_mode),
    }
}

/**
 * 执行请求的公共逻辑：变量替换 → HTTP 调用 → 输出
 *
 * 被 send/from-collection/from-file 三个命令共用
 */
fn execute_and_print_request(
    input: RequestInput,
    variables: &[EnvironmentVariable],
    json_mode: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let url = substitute_variables(&input.url, variables);
    let substituted_headers: Vec<HeaderInput> = input
        .headers
        .iter()
        .map(|h| HeaderInput {
            key: substitute_variables(&h.key, variables),
            value: substitute_variables(&h.value, variables),
            enabled: h.enabled,
        })
        .collect();
    let body = input
        .body
        .as_ref()
        .map(|b| substitute_variables(b, variables));
    let content_type = input
        .content_type
        .as_ref()
        .map(|ct| substitute_variables(ct, variables));

    let exec_input = RequestInput {
        method: input.method,
        url: url.clone(),
        headers: substituted_headers,
        body,
        content_type,
    };

    let rt = tokio::runtime::Runtime::new()?;
    let result = rt.block_on(execute_http_request(exec_input))?;

    // 在 JSON 模式下，使用结构化输出包裹（含响应分析）
    if json_mode {
        let analysis = analyze_response(&result.body);
        let wrapped = ResponseWithAnalysis {
            response: result,
            analysis,
        };
        let output = CliOutput::ok(&wrapped);
        println!("{}", serde_json::to_string(&output)?);
    } else {
        print_response(&result);
    }

    Ok(())
}

/** 处理 request send 子命令：直接指定 URL + 参数发送请求 */
fn handle_send_request(
    args: &RequestArgs,
    data_dir: &std::path::Path,
    json_mode: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let variables = get_active_variables(data_dir, args.env.as_deref());

    // 解析请求头
    let mut headers: Vec<HeaderInput> = Vec::new();
    for h in &args.header {
        if let Some(pos) = h.find(':') {
            let key = h[..pos].trim().to_string();
            let value = h[pos + 1..].trim().to_string();
            headers.push(HeaderInput { key, value, enabled: true });
        } else {
            eprintln!("警告: 忽略无效的请求头格式 '{}'（应为 Key: Value）", h);
        }
    }

    // 注入 Bearer Token（如果指定）
    if let Some(token) = &args.auth_bearer {
        headers.push(HeaderInput {
            key: "Authorization".to_string(),
            value: format!("Bearer {}", token),
            enabled: true,
        });
    }

    let method = args.method.to_uppercase();
    let input = RequestInput {
        method: method.clone(),
        url: args.url.clone(),
        headers,
        body: args.body.clone(),
        content_type: args.content_type.clone(),
    };

    execute_and_print_request(input, &variables, json_mode)
}

/** 处理 request from-collection 子命令：从集合中按名称提取请求并发送 */
fn handle_request_from_collection(
    args: &RequestFromCollectionArgs,
    data_dir: &std::path::Path,
    json_mode: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let variables = get_active_variables(data_dir, args.env.as_deref());

    // 1. 加载集合数据
    let collections = load_collections_data(data_dir);
    if collections.collections.is_empty() {
        return Err("集合数据为空或格式不正确".into());
    }

    // 2. 按集合名称查找
    let collection = collections.collections.iter()
        .find(|c| c.name == args.collection_name)
        .ok_or_else(|| format!("未找到名为 '{}' 的集合", args.collection_name))?;

    // 3. 在集合中按请求名称查找
    let request = collection.requests.iter()
        .find(|r| r.name == args.request_name)
        .ok_or_else(|| format!("在集合 '{}' 中未找到名为 '{}' 的请求", args.collection_name, args.request_name))?;

    // 4. 从 CollectionItem 构建 RequestInput
    let method = request.method.to_uppercase();
    let url = request.url.clone();

    let headers: Vec<HeaderInput> = request.headers.iter()
        .filter(|h| h.enabled)
        .map(|h| HeaderInput {
            key: h.key.clone(),
            value: h.value.clone(),
            enabled: true,
        })
        .collect();

    let body = request.body.clone();
    let content_type = request.content_type.clone();

    let input = RequestInput {
        method,
        url,
        headers,
        body,
        content_type,
    };

    execute_and_print_request(input, &variables, json_mode)
}

/** 处理 request from-file 子命令：从 JSON 文件读取请求配置后发送 */
fn handle_request_from_file(
    args: &RequestFromFileArgs,
    data_dir: &std::path::Path,
    json_mode: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let variables = get_active_variables(data_dir, args.env.as_deref());

    // 1. 读取文件
    let content = std::fs::read_to_string(&args.path)
        .map_err(|e| format!("无法读取请求配置文件 '{}': {}", args.path, e))?;

    // 2. 反序列化为 RequestInput
    let input: RequestInput = serde_json::from_str(&content)
        .map_err(|e| format!("请求配置文件格式错误: {}", e))?;

    execute_and_print_request(input, &variables, json_mode)
}

// -------- test 命令 --------

/** 处理 test 子命令：运行 YAML 测试脚本 */
fn handle_test(
    args: &TestArgs,
    data_dir: &std::path::Path,
    json_mode: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    // 1. 读取 YAML 文件
    let content = std::fs::read_to_string(&args.path)
        .map_err(|e| format!("无法读取测试脚本文件 '{}': {}", args.path, e))?;

    // 2. 获取活跃环境变量
    let variables = get_active_variables(data_dir, args.env.as_deref());

    // 3. 创建 tokio 运行时执行测试
    let rt = tokio::runtime::Runtime::new()?;
    let result = rt.block_on(test_runner::run_test_script_internal(&content, &variables));

    // 4. 打印输出（JSON 模式下使用结构化输出）
    if json_mode {
        let output = CliOutput::ok(&result);
        println!("{}", serde_json::to_string(&output)?);
    } else {
        print_test_result(&result);
    }

    Ok(())
}

// -------- collections 命令 --------

/** 处理 collections 子命令：列出所有集合 */
fn handle_list_collections(
    data_dir: &std::path::Path,
    json_mode: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let collections = load_collections_data(data_dir);

    if json_mode {
        let output = CliOutput::ok(&collections);
        println!("{}", serde_json::to_string(&output)?);
    } else {
        print_collections(&collections);
    }

    Ok(())
}

// -------- env 命令 --------

/** 处理 collections 子命令 */
fn handle_collections_action(
    action: &CollectionAction,
    data_dir: &std::path::Path,
    json_mode: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    match action {
        CollectionAction::List => handle_list_collections(data_dir, json_mode),
        CollectionAction::Tree => handle_collection_tree(data_dir, json_mode),
    }
}

/**
 * 处理 collection tree 子命令：以树形结构展示所有集合及其请求
 *
 * JSON 输出格式：
 * {
 *   "collections": [
 *     {"name": "用户API", "requests": [
 *       {"name": "获取用户列表", "method": "GET", "url": "{{base_url}}/users"}
 *     ]}
 *   ]
 * }
 */
fn handle_collection_tree(
    data_dir: &std::path::Path,
    json_mode: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let collections = load_collections_data(data_dir);
    let mut tree_items = Vec::new();

    for col in &collections.collections {
        let mut requests_info = Vec::new();
        for req in &col.requests {
            requests_info.push(serde_json::json!({
                "name": req.name,
                "method": req.method,
                "url": req.url,
            }));
        }

        tree_items.push(serde_json::json!({
            "name": col.name,
            "requests": requests_info,
        }));
    }

    let tree_output = serde_json::json!({ "collections": tree_items });

    if json_mode {
        let output = CliOutput::ok(&tree_output);
        println!("{}", serde_json::to_string(&output)?);
    } else {
        println!("集合树结构:");
        for col in &tree_items {
            let name = col["name"].as_str().unwrap_or("");
            println!("  {}:", name);
            if let Some(reqs) = col["requests"].as_array() {
                if reqs.is_empty() {
                    println!("    (无请求)");
                } else {
                    for req in reqs {
                        let method = req["method"].as_str().unwrap_or("");
                        let url = req["url"].as_str().unwrap_or("");
                        let rname = req["name"].as_str().unwrap_or("");
                        println!("    {} {}  {}", method, url, rname);
                    }
                }
            }
        }
    }

    Ok(())
}

/** 处理 env 子命令：列出环境或激活环境 */
fn handle_env_action(
    action: &EnvAction,
    data_dir: &std::path::Path,
    json_mode: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    match action {
        EnvAction::List => {
            let env_data = load_environments_data(data_dir);
            if json_mode {
                let output = CliOutput::ok(&env_data);
                println!("{}", serde_json::to_string(&output)?);
            } else {
                print_environments(&env_data);
            }
        }
        EnvAction::Use { name } => {
            let mut env_data = load_environments_data(data_dir);
            if let Some(env) = env_data.environments.iter().find(|e| e.name == *name) {
                env_data.active_id = Some(env.id.clone());
                save_environments_data(data_dir, &env_data)?;
                if json_mode {
                    let data = serde_json::json!({
                        "status": "ok",
                        "active_environment": name
                    });
                    let output = CliOutput::ok(&data);
                    println!("{}", serde_json::to_string(&output)?);
                } else {
                    println!("已激活环境: {}", name);
                }
            } else {
                return Err(format!("未找到名为 '{}' 的环境", name).into());
            }
        }
    }
    Ok(())
}

// -------- export 命令 --------

/** 处理 export 子命令：导出数据到文件 */
fn handle_export(
    args: &ExportArgs,
    data_dir: &std::path::Path,
    json_mode: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    // 1. 解析导出格式
    let export_fmt = ExportFormat::from_str(&args.format)?;

    // 2. 读取集合和环境数据
    let collections = load_collections_data(data_dir);
    let environments = load_environments_data(data_dir);

    // 3. 按集合名称筛选
    let filtered_collections = if args.collection.is_empty() {
        collections
    } else {
        let items: Vec<Collection> = collections.collections
            .into_iter()
            .filter(|c| args.collection.contains(&c.name))
            .collect();
        CollectionData { collections: items }
    };

    // 4. 构建导出信封
    let now_iso = crate::chrono_now_iso();
    let export_data = io::build_export_data(&filtered_collections, &environments, &now_iso);

    // 5. 序列化
    let content = io::serialize_export(&export_data, export_fmt)?;

    // 6. 确定输出路径
    let output_path = match &args.output {
        Some(path) => PathBuf::from(path),
        None => {
            let default_name = format!(
                "pulse-export-{}.{}",
                now_iso.replace(':', "-").split('.').next().unwrap_or("unknown"),
                export_fmt.to_extension()
            );
            PathBuf::from(&default_name)
        }
    };

    // 7. 写入文件
    std::fs::write(&output_path, &content)
        .map_err(|e| format!("无法写入文件 '{}': {}", output_path.display(), e))?;

    if json_mode {
        let data = serde_json::json!({
            "status": "ok",
            "file": output_path.display().to_string(),
            "format": args.format,
            "collections": filtered_collections.collections.len(),
            "environments": environments.environments.len(),
        });
        let output = CliOutput::ok(&data);
        println!("{}", serde_json::to_string(&output)?);
    } else {
        let collection_count = filtered_collections.collections.len();
        println!("导出成功!");
        println!("  文件: {}", output_path.display());
        println!("  格式: {}", args.format);
        println!("  集合数: {}", collection_count);
        println!("  环境数: {}", environments.environments.len());
    }

    Ok(())
}

// -------- import 命令 --------

/** 处理 import 子命令：从文件导入数据 */
fn handle_import(
    args: &ImportArgs,
    data_dir: &std::path::Path,
    json_mode: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    // 1. 检测格式
    let import_fmt = ExportFormat::from_extension(&args.path)?;

    // 2. 读取文件
    let content = std::fs::read_to_string(&args.path)
        .map_err(|e| format!("无法读取导入文件 '{}': {}", args.path, e))?;

    // 3. 反序列化和验证
    let import_data = io::deserialize_import(&content, import_fmt)?;
    io::validate_import(&import_data)?;

    // 4. 创建数据目录
    std::fs::create_dir_all(data_dir)
        .map_err(|e| format!("无法创建数据目录: {}", e))?;

    // 5. 读取现有数据
    let existing_collections = load_collections_data(data_dir);
    let existing_environments = load_environments_data(data_dir);

    // 6. 按策略合并
    let (final_collections, final_environments) = match args.strategy.as_str() {
        "replace" => (import_data.collections, import_data.environments),
        "merge" => (
            io::merge_collections(&existing_collections, &import_data.collections),
            io::merge_environments(&existing_environments, &import_data.environments),
        ),
        _ => return Err(format!("未知策略 '{}'，请使用 'replace' 或 'merge'", args.strategy).into()),
    };

    // 7. 写入文件
    save_collections_data(data_dir, &final_collections)?;
    save_environments_data(data_dir, &final_environments)?;

    let collections_count = final_collections.collections.len();
    let environments_count = final_environments.environments.len();

    if json_mode {
        let data = serde_json::json!({
            "status": "ok",
            "strategy": args.strategy,
            "collections": collections_count,
            "environments": environments_count,
        });
        let output = CliOutput::ok(&data);
        println!("{}", serde_json::to_string(&output)?);
    } else {
        println!("导入成功!");
        println!("  策略: {}", args.strategy);
        println!("  集合数: {}", collections_count);
        println!("  环境数: {}", environments_count);
    }

    Ok(())
}

// ============================================================
// 输出格式化辅助函数
// ============================================================

/** 打印 HTTP 响应（human-readable） */
fn print_response(resp: &ResponseData) {
    println!("Status:     {} {}", resp.status, resp.status_text);
    println!("Time:       {:.0}ms", resp.timing.total_ms);
    println!("Size:       {}", resp.size_label);
    if let Some(ref ct) = resp.content_type {
        println!("Type:       {}", ct);
    }
    println!();

    if !resp.body.is_empty() {
        println!("{}", resp.body);
    }
}

/** 打印测试结果（human-readable） */
fn print_test_result(result: &test_runner::TestRunResult) {
    println!("测试脚本: {}             耗时: {}ms",
        result.script_name,
        // 计算两端时间差（毫秒）
        {
            let start = parse_iso_time(&result.started_at);
            let end = parse_iso_time(&result.completed_at);
            if end > start { end - start } else { 0u64 }
        }
    );
    println!();

    for (_, step) in result.steps.iter().enumerate() {
        let icon = if step.passed { "✓" } else { "✗" };
        let status_str = if step.status > 0 {
            format!("{} {}", step.status, step.status_text)
        } else if let Some(ref err) = step.error {
            format!("ERR: {}", err)
        } else {
            "—".to_string()
        };

        println!("  {} {} {}  {}   {:.0}ms",
            icon, step.method, step.url, status_str, step.duration_ms
        );

        for assertion in &step.assertion_results {
            let a_icon = if assertion.passed { "✓" } else { "✗" };
            println!("    {} {}", a_icon, assertion.expression);
            if !assertion.passed {
                if assertion.error.is_some() {
                    println!("      错误: {}", assertion.error.as_ref().unwrap());
                } else {
                    let expected = assertion.expected_value.as_deref().unwrap_or("");
                    let actual = assertion.actual_value.as_deref().unwrap_or("");
                    println!("      期望: {} 实际: {}", expected, actual);
                }
            }
        }
    }

    println!();
    println!("结果: {}/{} 通过",
        result.passed_steps, result.total_steps
    );
}

/** 打印集合列表（human-readable） */
fn print_collections(cd: &CollectionData) {
    if cd.collections.is_empty() {
        println!("(无集合)");
        return;
    }

    println!("集合列表:");
    for col in &cd.collections {
        println!("  {} ({} 个请求)", col.name, col.requests.len());
    }
}

/** 打印环境列表（human-readable） */
fn print_environments(env_data: &EnvironmentData) {
    if env_data.environments.is_empty() {
        println!("(无环境)");
        return;
    }

    println!("环境列表:");
    for env in &env_data.environments {
        let active_mark = if Some(&env.id) == env_data.active_id.as_ref() {
            " [活跃]"
        } else {
            ""
        };
        println!("  {}{} ({} 个变量)", env.name, active_mark, env.variables.len());
    }
}

/** 解析 ISO 8601 时间字符串为 Unix 毫秒时间戳 */
fn parse_iso_time(iso: &str) -> u64 {
    // 简单解析 "YYYY-MM-DDTHH:MM:SS.000Z" 格式
    if iso.len() < 19 {
        return 0;
    }
    let year = iso[0..4].parse::<i64>().unwrap_or(0);
    let month = iso[5..7].parse::<u64>().unwrap_or(1);
    let day = iso[8..10].parse::<u64>().unwrap_or(1);
    let hour = iso[11..13].parse::<u64>().unwrap_or(0);
    let min = iso[14..16].parse::<u64>().unwrap_or(0);
    let sec = iso[17..19].parse::<u64>().unwrap_or(0);

    // 简化为秒数计算（从 1970 起的天数计算，不考虑闰秒）
    let days_from_1970 = |y: i64, m: u64, d: u64| -> u64 {
        let mut total = 0u64;
        for yr in 1970..y {
            total += if (yr % 4 == 0 && yr % 100 != 0) || (yr % 400 == 0) { 366 } else { 365 };
        }
        let month_days = if (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0) {
            [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        } else {
            [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        };
        for i in 0..(m as usize - 1) {
            total += month_days[i] as u64;
        }
        total += d - 1;
        total
    };

    let days = days_from_1970(year, month, day);
    (days * 86400 + hour * 3600 + min * 60 + sec) * 1000
}
