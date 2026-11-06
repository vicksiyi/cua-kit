//! Successful manager ensure payload (0x100018a6c..0x100019e0c).
//! Metadata must already be materialized by the configuration loader. Raw
//! optional registry fields are deliberately not defaulted at this boundary.
use crate::app_server_proxy::AppServerProxy;
use serde_json::{json, Value};

pub struct SelectedRuntimeMetadata<'a> {
    pub entry_id: &'a str,
    pub app_server_protocol_version: u64,
    pub app_version: &'a str,
    pub channel: &'a str,
    pub cli_version: &'a str,
    pub native_host_protocol_version: u64,
    pub native_host_version: &'a str,
}

/// Build payload only; JSON-RPC envelope and configuration selection are caller
/// responsibilities. Preserve native order of reading session then runtime.
pub fn ensure_response(proxy: &AppServerProxy, metadata: &SelectedRuntimeMetadata<'_>) -> Value {
    let endpoint = proxy.local_app_server_url();
    let session = proxy.runtime_session_id();
    let selected = json!({
        "appServerProtocolVersion": metadata.app_server_protocol_version,
        "appVersion": metadata.app_version,
        "channel": metadata.channel,
        "cliVersion": metadata.cli_version,
        "nativeHostProtocolVersion": metadata.native_host_protocol_version,
        "nativeHostVersion": metadata.native_host_version,
    });
    let runtime = proxy.runtime_config();
    json!({
        "entryId": metadata.entry_id,
        "localAppServerUrl": endpoint,
        "runtimeSessionId": session,
        "selected": selected,
        "runtimeConfig": runtime,
    })
}
