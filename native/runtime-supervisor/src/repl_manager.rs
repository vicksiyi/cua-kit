//! Execution routing between the recovered kernel and trusted worker.
//! This migration slice deliberately rejects host operations not yet composed.
use crate::background_host::BackgroundHost;
use crate::host::{HostHandler, HostReply, HostRequest};
use crate::native_pipe::NativePipeHost;
use crate::native_service::{NativeService, NativeServiceOptions};
use crate::process_port::{ProcessSpec, ProcessWorker};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    time::Duration,
};
use tokio::{
    sync::{mpsc, oneshot},
    task::JoinSet,
    time::Instant,
};
use uuid::Uuid;

struct Pair {
    kernel: ProcessWorker,
    trusted: ProcessWorker,
    pipes: NativePipeHost,
    pipe_events: mpsc::Receiver<Value>,
    pipe_seen: HashSet<String>,
    background: BackgroundHost,
}
pub struct ReplManager {
    kernel: ProcessSpec,
    trusted: ProcessSpec,
    services: HashSet<String>,
    pipe_paths: Vec<PathBuf>,
    endpoint_roots: Vec<PathBuf>,
    allowed_module_dirs: HashSet<PathBuf>,
    module_dirs: HashSet<PathBuf>,
    host_handler: Option<HostHandler>,
    form_elicitation: bool,
    pair: Option<Pair>,
    native_options: Option<NativeServiceOptions>,
    native_service: Option<NativeService>,
    /// Set before dispatch; a dropped execution future must not reuse its state.
    dirty: bool,
    closed: bool,
    ended_turns: HashMap<(String, String), Value>,
}
impl ReplManager {
    pub fn new(kernel: ProcessSpec, trusted: ProcessSpec, services: HashSet<String>) -> Self {
        Self {
            kernel,
            trusted,
            services,
            pipe_paths: Vec::new(),
            endpoint_roots: Vec::new(),
            allowed_module_dirs: HashSet::new(),
            module_dirs: HashSet::new(),
            host_handler: None,
            form_elicitation: false,
            pair: None,
            native_options: None,
            native_service: None,
            dirty: false,
            closed: false,
            ended_turns: HashMap::new(),
        }
    }
    pub fn with_native_service(mut self, options: Option<NativeServiceOptions>) -> Self {
        self.native_options = options;
        self
    }
    pub fn with_module_directories(mut self, paths: Vec<PathBuf>) -> Result<Self, String> {
        for path in paths {
            if !path.is_absolute() {
                return Err("Module directory must be absolute".into());
            }
            let path = path
                .canonicalize()
                .map_err(|_| "Module directory unavailable")?;
            if !path.is_dir() || path.file_name().is_none_or(|name| name != "node_modules") {
                return Err("Expected an absolute node_modules directory".into());
            }
            self.allowed_module_dirs.insert(path);
        }
        Ok(self)
    }
    pub fn set_host_handler(&mut self, handler: HostHandler, form: bool) {
        self.host_handler = Some(handler);
        self.form_elicitation = form;
    }
    pub async fn add_node_module_directory(&mut self, path: &str) -> Result<(), String> {
        if self.closed {
            return Err("Supervisor session is closed".into());
        }
        if !PathBuf::from(path).is_absolute() {
            return Err("Expected an absolute node_modules directory".into());
        }
        let path = PathBuf::from(path)
            .canonicalize()
            .map_err(|_| "Module directory unavailable")?;
        if !path.is_dir() || !self.allowed_module_dirs.contains(&path) {
            return Err("Module directory is not authorized".into());
        }
        if self.dirty {
            self.reset().await?;
        }
        if let Some(pair) = self.pair.as_mut() {
            pair.kernel
                .send(&json!({"type":"add_node_module_dir","path":path}))
                .await?;
        }
        self.module_dirs.insert(path);
        Ok(())
    }
    pub fn with_host_handler(mut self, handler: HostHandler, form_elicitation: bool) -> Self {
        self.host_handler = Some(handler);
        self.form_elicitation = form_elicitation;
        self
    }
    pub fn with_pipe_paths(mut self, paths: Vec<PathBuf>) -> Result<Self, String> {
        if paths.iter().any(|path| !path.is_absolute()) {
            return Err("Native pipe paths must be absolute".into());
        }
        self.pipe_paths = paths;
        Ok(self)
    }
    pub fn with_endpoint_roots(mut self, roots: Vec<PathBuf>) -> Result<Self, String> {
        self.endpoint_roots = crate::registered_endpoints::validate_roots(roots)?;
        Ok(self)
    }
    /// Process transport events between tool calls. Incoming work interrupts only
    /// the observation wait, never a half-completed write. Shutdown can retire it.
    pub async fn idle_once(
        &mut self,
        wake: &tokio::sync::Notify,
        shutdown: &tokio_util::sync::CancellationToken,
    ) -> Result<(), String> {
        if self.closed || self.dirty || self.pair.is_none() {
            return Ok(());
        }
        let pair = self.pair.as_mut().unwrap();
        let event = tokio::select! {
            biased;
            _=shutdown.cancelled()=>return Ok(()),
            _=wake.notified()=>return Ok(()),
            _=tokio::time::sleep(Duration::from_secs(1))=>return Ok(()),
            message=pair.kernel.next_message()=>(0,message?),
            message=pair.trusted.next_message()=>(1,message?),
            message=pair.pipe_events.recv()=>(2,message),
            message=pair.background.next(), if pair.background.pending()=>(3,Some(message?)),
        };
        self.dirty = true;
        let dispatch = async {
            let (side, message) = event;
            let message = message.ok_or("Worker transport ended between calls")?;
            match (side, message["type"].as_str()) {
                (2 | 3, _) => pair.trusted.send(&message).await,
                (1, Some("authenticated_fetch")) => {
                    if let Some(response) = pair.background.start(message) {
                        pair.trusted.send(&response).await?;
                    }
                    Ok(())
                }
                (1, Some("native_pipe_request")) => {
                    let id = message["id"]
                        .as_str()
                        .filter(|id| !id.is_empty())
                        .ok_or("Invalid native pipe request identity")?;
                    if pair.pipe_seen.len() >= 65536 || !pair.pipe_seen.insert(id.to_string()) {
                        return Err("Duplicate or excessive native pipe request identities".into());
                    }
                    let response = match pair.pipes.request(&message).await {
                        Ok(result) => {
                            json!({"type":"native_pipe_response","id":id,"ok":true,"result":result})
                        }
                        Err(error) => {
                            json!({"type":"native_pipe_response","id":id,"ok":false,"error":error})
                        }
                    };
                    pair.trusted.send(&response).await
                }
                (0, Some("submitted_code_complete" | "exec_redacted_source"))
                | (1, Some("response_meta_trace" | "otel_log")) => Ok(()),
                _ => Err("Unsupported worker message between calls".into()),
            }
        };
        let result = tokio::select! {
            biased;
            _=shutdown.cancelled()=>Err("Background operation cancelled".into()),
            result=tokio::time::timeout(Duration::from_secs(30),dispatch)=>result.map_err(|_|"Background transport operation timed out".to_string())?,
        };
        if result.is_ok() {
            self.dirty = false;
        }
        result
    }
    pub async fn reset(&mut self) -> Result<(), String> {
        self.dirty = true;
        let workers = if let Some(mut pair) = self.pair.take() {
            pair.background.close().await;
            pair.pipes.close().await;
            let (kernel, trusted) = tokio::join!(pair.kernel.close(), pair.trusted.close());
            kernel.and(trusted)
        } else {
            Ok(())
        };
        let service = if let Some(mut service) = self.native_service.take() {
            service.close().await
        } else {
            Ok(())
        };
        workers.and(service)?;
        self.dirty = false;
        Ok(())
    }
    pub async fn close(&mut self) -> Result<(), String> {
        self.closed = true;
        self.reset().await
    }
    async fn prepare(&mut self) -> Result<(), String> {
        if self.closed {
            return Err("Supervisor session is closed".into());
        }
        if self.dirty {
            self.reset().await?;
        }
        if self.pair.is_none() {
            self.dirty = true;
            if let Some(options) = self.native_options.as_ref() {
                self.native_service = Some(NativeService::spawn(options).await?);
                if let Err(error) = self.native_service.as_mut().unwrap().wait_ready().await {
                    let _ = self.reset().await;
                    return Err(error);
                }
            }
            let mut trusted_spec = self.trusted.clone();
            let mut pipe_paths = self.pipe_paths.clone();
            if let Some(service) = self.native_service.as_ref() {
                trusted_spec.env.insert(
                    "SKY_CUA_SERVICE_NATIVE_PIPE_PATH".into(),
                    service.socket_path.to_string_lossy().into_owned(),
                );
                pipe_paths.push(service.socket_path.clone());
            }
            let mut kernel = match ProcessWorker::start_kernel(self.kernel.clone()).await {
                Ok(worker) => worker,
                Err(error) => {
                    let _ = self.reset().await;
                    return Err(error);
                }
            };
            let trusted = match ProcessWorker::start(trusted_spec).await {
                Ok(worker) => worker,
                Err(error) => {
                    let _ = kernel.close().await;
                    let _ = self.reset().await;
                    return Err(error);
                }
            };
            for path in &self.module_dirs {
                if let Err(error) = kernel
                    .send(&json!({"type":"add_node_module_dir","path":path}))
                    .await
                {
                    let mut trusted = trusted;
                    let _ = tokio::join!(kernel.close(), trusted.close());
                    let _ = self.reset().await;
                    return Err(error);
                }
            }
            let (events, pipe_events) = mpsc::channel(64);
            let pipes = NativePipeHost::new(pipe_paths, events)?
                .with_endpoint_roots(self.endpoint_roots.clone())?;
            self.pair = Some(Pair {
                kernel,
                trusted,
                pipes,
                pipe_events,
                pipe_seen: HashSet::new(),
                background: BackgroundHost::default(),
            });
            self.dirty = false;
        }
        Ok(())
    }
    pub async fn execute(
        &mut self,
        code: &str,
        timeout: Duration,
        request_meta: Value,
        cancel: Option<oneshot::Receiver<()>>,
    ) -> Result<Value, String> {
        self.run(
            json!({"type":"exec","code":code}),
            timeout,
            request_meta,
            cancel,
        )
        .await
    }
    /// Host-only lifecycle API, never exposed as a submitted-code capability.
    pub async fn turn_ended(
        &mut self,
        event: Value,
        timeout: Duration,
        request_meta: Value,
        cancel: Option<oneshot::Receiver<()>>,
    ) -> Result<Value, String> {
        if self.closed {
            return Err("Supervisor session is closed".into());
        }
        let fields = ["hook_event_name", "session_id", "turn_id"];
        let object = event.as_object().ok_or("Invalid turn-ended event")?;
        if object.len() != 3
            || fields.iter().any(|field| {
                !object
                    .get(*field)
                    .and_then(Value::as_str)
                    .is_some_and(|value| !value.is_empty())
            })
        {
            return Err("Invalid turn-ended event".into());
        }
        let key = (
            event["session_id"].as_str().unwrap().to_string(),
            event["turn_id"].as_str().unwrap().to_string(),
        );
        if let Some(result) = self.ended_turns.get(&key) {
            return Ok(result.clone());
        }
        let result = self
            .run(
                json!({"type":"turn_ended","event":event}),
                timeout,
                request_meta,
                cancel,
            )
            .await?;
        self.ended_turns.insert(key, result.clone());
        Ok(result)
    }
    async fn run(
        &mut self,
        operation: Value,
        timeout: Duration,
        request_meta: Value,
        mut cancel: Option<oneshot::Receiver<()>>,
    ) -> Result<Value, String> {
        if cancel
            .as_mut()
            .is_some_and(|receiver| receiver.try_recv().is_ok())
        {
            return Err("Execution cancelled before launch".into());
        }
        if timeout.is_zero() {
            return Err("Invalid execution deadline".into());
        }
        self.prepare().await?;
        self.dirty = true;
        let services = &self.services;
        let pair = self.pair.as_mut().unwrap();
        let execution = route(
            pair,
            services,
            self.host_handler.as_ref(),
            self.form_elicitation,
            operation,
            timeout,
            request_meta,
            cancel,
        )
        .await;
        match execution {
            Ok(result) => {
                self.dirty = false;
                Ok(result)
            }
            Err(error) => {
                let cleanup = self.reset().await;
                Err(match cleanup {
                    Ok(()) => error,
                    Err(cleanup) => format!("{error}; worker retirement: {cleanup}"),
                })
            }
        }
    }
}
async fn cancelled(receiver: Option<oneshot::Receiver<()>>) {
    if let Some(receiver) = receiver {
        if receiver.await.is_ok() {
            return;
        }
    }
    std::future::pending::<()>().await
}
async fn route(
    pair: &mut Pair,
    services: &HashSet<String>,
    host_handler: Option<&HostHandler>,
    form_elicitation: bool,
    mut request: Value,
    timeout: Duration,
    request_meta: Value,
    cancel: Option<oneshot::Receiver<()>>,
) -> Result<Value, String> {
    let id = Uuid::new_v4().to_string();
    let cancellation = cancelled(cancel);
    tokio::pin!(cancellation);
    let mut remaining = timeout;
    let mut deadline = Some(
        Instant::now()
            .checked_add(remaining)
            .ok_or("Execution timeout is too large")?,
    );
    let lifecycle = request["type"] == "turn_ended";
    pair.background.register(
        id.clone(),
        request_meta.clone(),
        lifecycle,
        host_handler.cloned(),
    );
    request["id"] = json!(id);
    request["request_meta"] = request_meta.clone();
    request["form_elicitation_supported"] = json!(form_elicitation);
    let destination = if lifecycle {
        &mut pair.trusted
    } else {
        &mut pair.kernel
    };
    tokio::select! {
        biased;
        _=&mut cancellation=>return Err("Execution cancelled; worker state discarded".into()),
        _=tokio::time::sleep_until(deadline.unwrap())=>return Err("Execution timed out; worker state discarded".into()),
        sent=destination.send(&request)=>sent?,
    }
    let mut response_meta: Option<serde_json::Map<String, Value>> = None;
    let mut host_tasks: JoinSet<(bool, String, Result<HostReply, String>)> = JoinSet::new();
    let mut host_seen = HashSet::new();
    let mut content = Vec::<Value>::new();
    let mut content_bytes = 0usize;
    let mut rpc = HashSet::new();
    let mut depth = 0usize;
    loop {
        let expiry = async {
            match deadline {
                Some(at) => tokio::time::sleep_until(at).await,
                None => std::future::pending::<()>().await,
            }
        };
        let (trusted, message) = tokio::select! {
            biased;
            _=&mut cancellation=>return Err("Execution cancelled; worker state discarded".into()),
            _=expiry=>return Err("Execution timed out; worker state discarded".into()),
            completed=host_tasks.join_next(), if !host_tasks.is_empty()=>{
                let (trusted,request_id,result)=completed.ok_or("Missing host task")?.map_err(|e|e.to_string())?;
                let mut response=match result {
                    Ok(reply)=>{
                        if !reply.message.is_object(){return Err("Host reply must be an object".into());}
                        for item in reply.content {
                            let bytes=serde_json::to_vec(&item).map_err(|e|e.to_string())?.len();
                            if content.len()>=64 || content_bytes.saturating_add(bytes)>crate::limits::MAX_EXECUTION_CONTENT_BYTES{return Err("Execution content budget exceeded".into());}
                            content_bytes+=bytes;content.push(item);
                        }
                        reply.message
                    },
                    Err(error)=>json!({"ok":false,"error":error}),
                };
                response["id"]=json!(request_id);
                let destination=if trusted{&mut pair.trusted}else{&mut pair.kernel};
                destination.send(&response).await?;
                continue;
            },
            response=pair.background.next(), if pair.background.pending()=>{
                pair.trusted.send(&response?).await?;
                continue;
            },
            message=pair.kernel.next_message()=>(false,message?),
            message=pair.trusted.next_message()=>(true,message?),
            event=pair.pipe_events.recv()=>{
                let event=event.ok_or("Native pipe event channel closed")?;
                pair.trusted.send(&event).await?;
                continue;
            },
        };
        let mut message = message.ok_or("Worker exited during execution")?;
        let kind = message["type"]
            .as_str()
            .ok_or("Worker message has no type")?;
        if !trusted && lifecycle {
            return Err("Kernel message during host lifecycle operation".into());
        }
        match (trusted, kind) {
            (true, "authenticated_fetch") => {
                if let Some(response) = pair.background.start(message) {
                    pair.trusted.send(&response).await?;
                }
            }
            (false, "emit_image" | "emit_audio")
            | (
                true,
                "emit_image" | "emit_audio" | "elicit" | "config_action" | "launch_services_action",
            ) => {
                let request_id = message["id"]
                    .as_str()
                    .filter(|value| !value.is_empty())
                    .ok_or("Invalid host request identity")?;
                if message["exec_id"] != id || (trusted && !lifecycle && rpc.is_empty()) {
                    return Err("Uncorrelated host operation".into());
                }
                if host_seen.len() >= 65536 || !host_seen.insert((trusted, request_id.to_string()))
                {
                    return Err("Duplicate or excessive host request identities".into());
                }
                let request_id = request_id.to_string();
                let handler = host_handler.cloned();
                let context = HostRequest {
                    message,
                    execution_id: id.clone(),
                    request_meta: request_meta.clone(),
                };
                host_tasks.spawn(async move {
                    let result = match handler {
                        Some(handler) => handler(context).await,
                        None => Err("Host operation is not configured".into()),
                    };
                    (trusted, request_id, result)
                });
            }
            (true, "turn_ended_result") => {
                if !lifecycle || message["id"] != id || depth != 0 || !rpc.is_empty() {
                    return Err("Turn-ended response identity mismatch".into());
                }
                if let Some(meta) = response_meta {
                    message["response_meta"] = Value::Object(meta);
                }
                if !host_tasks.is_empty() {
                    return Err(
                        "Operation completed with outstanding host requests; outcome unknown"
                            .into(),
                    );
                }
                let items = message
                    .as_object_mut()
                    .unwrap()
                    .entry("content_items")
                    .or_insert_with(|| json!([]));
                items
                    .as_array_mut()
                    .ok_or("Invalid worker content items")?
                    .append(&mut content);
                return Ok(message);
            }
            (true, "native_pipe_request") => {
                let request_id = message["id"]
                    .as_str()
                    .filter(|id| !id.is_empty())
                    .ok_or("Invalid native pipe request identity")?;
                if pair.pipe_seen.len() >= 65536 || !pair.pipe_seen.insert(request_id.to_string()) {
                    return Err("Duplicate or excessive native pipe request identities".into());
                }
                let result = tokio::select! {
                    biased;
                    _=&mut cancellation=>return Err("Execution cancelled; worker state discarded".into()),
                    _=async {match deadline {Some(at)=>tokio::time::sleep_until(at).await,None=>std::future::pending::<()>().await}}=>return Err("Execution timed out; worker state discarded".into()),
                    result=pair.pipes.request(&message)=>result,
                };
                let response = match result {
                    Ok(result) => {
                        json!({"type":"native_pipe_response","id":request_id,"ok":true,"result":result})
                    }
                    Err(error) => {
                        json!({"type":"native_pipe_response","id":request_id,"ok":false,"error":error})
                    }
                };
                pair.trusted.send(&response).await?;
            }
            (false, "exec_result") => {
                if message["id"] != id || !rpc.is_empty() || depth != 0 {
                    return Err("Execution result correlation mismatch".into());
                }
                if let Some(meta) = response_meta {
                    message["response_meta"] = Value::Object(meta);
                }
                if !host_tasks.is_empty() {
                    return Err(
                        "Operation completed with outstanding host requests; outcome unknown"
                            .into(),
                    );
                }
                let items = message
                    .as_object_mut()
                    .unwrap()
                    .entry("content_items")
                    .or_insert_with(|| json!([]));
                items
                    .as_array_mut()
                    .ok_or("Invalid worker content items")?
                    .append(&mut content);
                return Ok(message);
            }
            (false, "trusted_service_request" | "trusted_service_hooks") => {
                let rpc_id = message["id"].as_str().ok_or("Missing RPC identity")?;
                if message["exec_id"] != id || rpc.contains(rpc_id) {
                    return Err("Invalid trusted RPC correlation".into());
                }
                if kind == "trusted_service_request"
                    && !message["service"]
                        .as_str()
                        .is_some_and(|service| services.contains(service))
                {
                    pair.kernel.send(&json!({"id":rpc_id,"ok":false,"error":"Trusted service is not configured"})).await?;
                    continue;
                }
                pair.background.allow(&id);
                rpc.insert(rpc_id.to_string());
                let mut forward = message.clone();
                forward["type"] = json!(if kind == "trusted_service_request" {
                    "service"
                } else {
                    "run_hooks"
                });
                forward["request_meta"] = request_meta.clone();
                forward["form_elicitation_supported"] = json!(form_elicitation);
                pair.trusted.send(&forward).await?;
            }
            (true, "trusted_service_response") => {
                let rpc_id = message["id"]
                    .as_str()
                    .ok_or("Missing trusted response identity")?;
                if !rpc.remove(rpc_id) || (rpc.is_empty() && depth != 0) {
                    return Err(
                        "Uncorrelated trusted response or unbalanced suspended timeout".into(),
                    );
                }
                pair.kernel.send(&message).await?;
            }
            (true, "response_meta") => {
                if message["id"] != id || (!lifecycle && rpc.is_empty()) {
                    return Err("Uncorrelated response metadata".into());
                }
                let value = message["response_meta"]
                    .as_object()
                    .ok_or("Invalid response metadata")?;
                let merged = response_meta.get_or_insert_with(serde_json::Map::new);
                merged.extend(value.clone());
                if serde_json::to_vec(merged).map_err(|e| e.to_string())?.len() > 8 * 1024 * 1024 {
                    return Err("Response metadata budget exceeded".into());
                }
            }
            (true, "suspend_timeout" | "resume_timeout") => {
                if message["exec_id"] != id || (!lifecycle && rpc.is_empty()) {
                    return Err("Uncorrelated timeout control".into());
                }
                if kind == "suspend_timeout" {
                    if depth == 0 {
                        remaining = deadline.unwrap().saturating_duration_since(Instant::now());
                        if remaining.is_zero() {
                            return Err("Execution timed out; worker state discarded".into());
                        }
                        deadline = None;
                    }
                    depth = depth.checked_add(1).ok_or("Timeout nesting overflow")?;
                } else {
                    if depth == 0 {
                        return Err("Unbalanced timeout resume".into());
                    }
                    depth -= 1;
                    if depth == 0 {
                        deadline = Some(Instant::now() + remaining);
                    }
                }
            }
            (false, "submitted_code_complete" | "exec_redacted_source")
            | (true, "response_meta_trace" | "otel_log") => {}
            _ => {
                return Err(format!(
                    "Unsupported {} worker operation: {kind}",
                    if trusted { "trusted" } else { "kernel" }
                ))
            }
        }
    }
}
