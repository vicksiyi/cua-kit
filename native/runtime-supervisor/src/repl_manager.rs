//! Execution routing between the recovered kernel and trusted worker.
//! This migration slice deliberately rejects host operations not yet composed.
use crate::native_pipe::NativePipeHost;
use crate::process_port::{ProcessSpec, ProcessWorker};
use serde_json::{json, Value};
use std::{collections::HashSet, path::PathBuf, time::Duration};
use tokio::{
    sync::{mpsc, oneshot},
    time::Instant,
};
use uuid::Uuid;

struct Pair {
    kernel: ProcessWorker,
    trusted: ProcessWorker,
    pipes: NativePipeHost,
    pipe_events: mpsc::Receiver<Value>,
    pipe_seen: HashSet<String>,
}
pub struct ReplManager {
    kernel: ProcessSpec,
    trusted: ProcessSpec,
    services: HashSet<String>,
    pipe_paths: Vec<PathBuf>,
    pair: Option<Pair>,
    /// Set before dispatch; a dropped execution future must not reuse its state.
    dirty: bool,
    closed: bool,
}
impl ReplManager {
    pub fn new(kernel: ProcessSpec, trusted: ProcessSpec, services: HashSet<String>) -> Self {
        Self {
            kernel,
            trusted,
            services,
            pipe_paths: Vec::new(),
            pair: None,
            dirty: false,
            closed: false,
        }
    }
    pub fn with_pipe_paths(mut self, paths: Vec<PathBuf>) -> Result<Self, String> {
        if paths.iter().any(|path| !path.is_absolute()) {
            return Err("Native pipe paths must be absolute".into());
        }
        self.pipe_paths = paths;
        Ok(self)
    }
    pub async fn reset(&mut self) -> Result<(), String> {
        self.dirty = true;
        if let Some(mut pair) = self.pair.take() {
            pair.pipes.close().await;
            let (kernel, trusted) = tokio::join!(pair.kernel.close(), pair.trusted.close());
            kernel.and(trusted)?;
        }
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
            let mut kernel = ProcessWorker::start(self.kernel.clone()).await?;
            let trusted = match ProcessWorker::start(self.trusted.clone()).await {
                Ok(worker) => worker,
                Err(error) => {
                    let _ = kernel.close().await;
                    return Err(error);
                }
            };
            let (events, pipe_events) = mpsc::channel(64);
            let pipes = NativePipeHost::new(self.pipe_paths.clone(), events)?;
            self.pair = Some(Pair {
                kernel,
                trusted,
                pipes,
                pipe_events,
                pipe_seen: HashSet::new(),
            });
        }
        Ok(())
    }
    pub async fn execute(
        &mut self,
        code: &str,
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
        let execution = route(pair, services, code, timeout, request_meta, cancel).await;
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
    code: &str,
    timeout: Duration,
    request_meta: Value,
    cancel: Option<oneshot::Receiver<()>>,
) -> Result<Value, String> {
    let id = Uuid::new_v4().to_string();
    let cancellation = cancelled(cancel);
    tokio::pin!(cancellation);
    let mut remaining = timeout;
    let mut deadline = Some(Instant::now() + remaining);
    let request = json!({"type":"exec","id":id,"code":code,"request_meta":request_meta,"form_elicitation_supported":false});
    tokio::select! {
        biased;
        _=&mut cancellation=>return Err("Execution cancelled; worker state discarded".into()),
        _=tokio::time::sleep_until(deadline.unwrap())=>return Err("Execution timed out; worker state discarded".into()),
        sent=pair.kernel.send(&request)=>sent?,
    }
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
            message=pair.kernel.next_message()=>(false,message?),
            message=pair.trusted.next_message()=>(true,message?),
            event=pair.pipe_events.recv()=>{
                let event=event.ok_or("Native pipe event channel closed")?;
                pair.trusted.send(&event).await?;
                continue;
            },
        };
        let message = message.ok_or("Worker exited during execution")?;
        let kind = message["type"]
            .as_str()
            .ok_or("Worker message has no type")?;
        match (trusted, kind) {
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
                rpc.insert(rpc_id.to_string());
                let mut forward = message.clone();
                forward["type"] = json!(if kind == "trusted_service_request" {
                    "service"
                } else {
                    "run_hooks"
                });
                forward["request_meta"] = request_meta.clone();
                forward["form_elicitation_supported"] = json!(false);
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
            (true, "suspend_timeout" | "resume_timeout") => {
                if message["exec_id"] != id || rpc.is_empty() {
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
