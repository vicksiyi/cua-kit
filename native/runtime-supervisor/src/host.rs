//! Explicit host callbacks. No ambient approval, configuration or credential access.
use serde_json::Value;
use std::{future::Future, pin::Pin, sync::Arc};

pub struct HostRequest {
    pub message: Value,
    pub execution_id: String,
    pub request_meta: Value,
}
pub struct HostReply {
    pub message: Value,
    /// Validated/encoded MCP content supplied by the trusted host adapter.
    pub content: Vec<Value>,
}
impl HostReply {
    pub fn message(message: Value) -> Self {
        Self {
            message,
            content: Vec::new(),
        }
    }
}
pub type HostFuture = Pin<Box<dyn Future<Output = Result<HostReply, String>> + Send>>;
/// The callback future is dropped when its execution is retired. Implementations
/// must propagate cancellation to owned work and not detach side-effect tasks.
pub type HostHandler = Arc<dyn Fn(HostRequest) -> HostFuture + Send + Sync>;
