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
