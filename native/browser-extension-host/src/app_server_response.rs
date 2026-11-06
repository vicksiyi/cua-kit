//! Successful manager ensure payload (0x100018a6c..0x100019e0c).
//! Metadata defaults are recovered from the final native configuration load.
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

impl<'a> From<&'a crate::app_server_manifest::RawManifestConfiguration>
    for SelectedRuntimeMetadata<'a>
{
    fn from(raw: &'a crate::app_server_manifest::RawManifestConfiguration) -> Self {
        Self {
            entry_id: raw.entry_id.as_deref().unwrap_or("env"),
            app_server_protocol_version: raw.app_server_protocol_version.unwrap_or(2),
            app_version: raw.app_version.as_deref().unwrap_or("0.0.0"),
            channel: raw.channel.as_deref().unwrap_or("unknown"),
            cli_version: raw.cli_version.as_deref().unwrap_or("0.0.0"),
            native_host_protocol_version: raw.native_host_protocol_version.unwrap_or(2),
            native_host_version: raw.native_host_version.as_deref().unwrap_or("0.0.0"),
        }
    }
}

/// Manager ensure stage after successful configuration load. Preserve an
/// existing proxy even when host/port configuration changes. New proxies enter
/// the same refresh/restart path. No child is eagerly launched by ensure.
pub fn ensure_loaded(
    slot: &mut Option<AppServerProxy>,
    config: &crate::app_server_configuration::LoadedLaunchConfiguration,
    params: Option<&Value>,
    restart: bool,
) -> Result<Value, crate::app_server_error::RuntimeError> {
    if slot.is_none() {
        *slot = Some(crate::app_server_proxy::prepare(config)?.start());
    }
    let proxy = slot.as_ref().expect("proxy was initialized");
    proxy.update_configuration(config);
    if restart {
        proxy.restart_client(params)?;
    }
    let metadata = SelectedRuntimeMetadata::from(&config.selection.selected.configuration);
    Ok(ensure_response(proxy, &metadata))
}
