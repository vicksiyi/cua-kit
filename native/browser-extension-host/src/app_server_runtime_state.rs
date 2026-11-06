//! AppServerHostConfig::proxy_runtime_state projection, pinned macOS build.
use crate::app_server_configuration::LoadedLaunchConfiguration;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProxyRuntimeState {
    pub codex_cli_path: String,
    pub node_path: String,
    pub platform: String,
    pub browser_client_path: Option<String>,
    pub browser_service_path: Option<String>,
    pub codex_home: Option<String>,
    pub node_repl_path: Option<String>,
}
impl From<&LoadedLaunchConfiguration> for ProxyRuntimeState {
    fn from(config: &LoadedLaunchConfiguration) -> Self {
        let launch = &config.launch;
        Self {
            codex_cli_path: launch.codex_cli_path.clone(),
            node_path: launch.node_path.clone(),
            platform: "darwin".to_owned(),
            browser_client_path: launch.browser_client_path.clone(),
            browser_service_path: config
                .selection
                .selected
                .configuration
                .browser_service_path
                .clone(),
            codex_home: launch.codex_home.clone(),
            node_repl_path: launch.node_repl_path.clone(),
        }
    }
}

impl ProxyRuntimeState {
    /// Manager ensure serializes a snapshot, not the launch configuration or
    /// process health. Optional paths remain explicit nulls; strings are raw.
    pub fn response_value(&self) -> serde_json::Value {
        serde_json::json!({
            "browserClientPath": self.browser_client_path,
            "browserServicePath": self.browser_service_path,
            "codexCliPath": self.codex_cli_path,
            "desktopAgentModeDefaults": desktop_agent_mode_defaults(self.codex_home.as_deref()),
            "nodePath": self.node_path,
            "nodeReplPath": self.node_repl_path,
            "platform": self.platform,
        })
    }
}

/// Only the configured home is consulted. No home produces null; an unreadable
/// or malformed state file produces two empty maps. Map contents are cloned as
/// JSON without filtering their values or exposing other persisted state.
pub fn desktop_agent_mode_defaults(home: Option<&str>) -> serde_json::Value {
    use serde_json::{json, Value};
    let Some(home) = home else {
        return Value::Null;
    };
    let state =
        std::fs::read_to_string(std::path::Path::new(home).join(".codex-global-state.json"))
            .ok()
            .and_then(|text| serde_json::from_str::<Value>(&text).ok());
    let atoms = state
        .as_ref()
        .and_then(|v| v.get("electron-persisted-atom-state"))
        .and_then(Value::as_object);
    let map = |key: &str| {
        atoms
            .and_then(|v| v.get(key))
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default()
    };
    json!({
        "agentModesByHostId": map("agent-mode-by-host-id"),
        "preferredNonFullAccessModesByHostId": map("preferred-non-full-access-agent-mode-by-host-id"),
    })
}
