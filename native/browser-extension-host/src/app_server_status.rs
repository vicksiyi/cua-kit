//! Status projection evidenced in AppServerManager::status (0x10001a87c).
//! This reads proxy presence, not child-process health, and never starts a runtime.
use serde_json::{json, Value};

/// `Some` must come from an existing proxy's runtime_session_id, not a cached PID
/// or configuration entry. Empty session strings are preserved by the original.
/// Lifecycle ownership and dispatcher integration are implemented separately.
pub fn status(proxy_runtime_session_id: Option<&str>) -> Value {
    match proxy_runtime_session_id {
        None => json!({"phase": "idle"}),
        Some(id) => json!({"phase": "connected", "runtimeSessionId": id}),
    }
}
