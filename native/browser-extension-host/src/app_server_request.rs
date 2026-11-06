//! AppServerManager::ensure constraint decoding and configuration-load ordering.
use crate::{
    app_server_configuration::load_configuration, app_server_error::RuntimeError,
    app_server_manifest::ProtocolRequirements, app_server_proxy::AppServerProxy,
    app_server_response::ensure_loaded,
};
use serde_json::Value;
use std::{ffi::OsString, path::Path};

#[derive(Default)]
pub struct EnsureConstraints<'a> {
    pub extension_build_channel: Option<&'a str>,
    pub extension_id: Option<&'a str>,
    pub native_host_name: Option<&'a str>,
    pub protocols: ProtocolRequirements,
}
impl<'a> EnsureConstraints<'a> {
    pub fn parse(params: Option<&'a Value>) -> Self {
        let constraints = params.and_then(|p| p.get("constraints"));
        let text = |key: &str| {
            constraints
                .and_then(|v| v.get(key))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
        };
        let number = |key: &str| constraints.and_then(|v| v.get(key)).and_then(Value::as_u64);
        Self {
            extension_build_channel: text("extensionBuildChannel"),
            extension_id: text("extensionId"),
            native_host_name: text("nativeHostName"),
            protocols: ProtocolRequirements {
                app_server: number("requiredAppServerProtocolVersion"),
                native_host: number("requiredNativeHostProtocolVersion"),
            },
        }
    }
}

/// Reload configuration before touching an existing proxy, including restart.
/// Explicit environment/executable inputs permit tests without personal config.
pub fn ensure_with_environment(
    slot: &mut Option<AppServerProxy>,
    params: Option<&Value>,
    restart: bool,
    executable: Option<&Path>,
    environment: impl FnMut(&str) -> Option<OsString>,
) -> Result<Value, RuntimeError> {
    let constraints = EnsureConstraints::parse(params);
    let config = load_configuration(
        executable,
        constraints.native_host_name,
        constraints.extension_id,
        constraints.extension_build_channel,
        &constraints.protocols,
        environment,
    )?;
    ensure_loaded(slot, &config, params, restart)
}
