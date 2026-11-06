//! Native launch-field resolution reconstructed from AppServerHostConfig::load
//! (pinned ARM64 host, 0x10001e4d8..0x10001ebfc). This is the resolution stage,
//! not a schema-2 registry selector or a raw JSON parser.
use std::ffi::OsString;

#[derive(Clone, Default, PartialEq, Eq)]
pub struct LaunchFields {
    pub codex_cli_path: Option<String>,
    pub extension_id: Option<String>,
    pub node_path: Option<String>,
    pub browser_client_path: Option<String>,
    pub codex_home: Option<String>,
    pub node_repl_path: Option<String>,
    pub proxy_host: Option<String>,
    pub proxy_port: Option<u16>,
}
#[derive(Clone, PartialEq, Eq)]
pub struct ResolvedLaunchFields {
    pub codex_cli_path: String,
    pub extension_id: Option<String>,
    pub node_path: String,
    pub browser_client_path: Option<String>,
    pub codex_home: Option<String>,
    pub node_repl_path: Option<String>,
    pub proxy_host: String,
    pub proxy_port: u16,
}

/// Original non_empty_env uses env::var (invalid Unicode is absent), trims
/// Unicode whitespace, then returns None for an empty result. It differs from
/// the JS config writer, which checks trim but preserves the original string.
fn non_empty(value: Option<OsString>) -> Option<String> {
    value?
        .into_string()
        .ok()
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty())
}

impl LaunchFields {
    /// The caller supplies only the trusted environment lookup. No ambient env
    /// scan or forwarding of model credentials is performed by this resolver.
    pub fn resolve(
        self,
        mut environment: impl FnMut(&str) -> Option<OsString>,
    ) -> ResolvedLaunchFields {
        let mut get = |key| non_empty(environment(key));
        ResolvedLaunchFields {
            codex_cli_path: get("CODEX_CLI_PATH")
                .or(self.codex_cli_path)
                .unwrap_or_else(|| "codex".into()),
            extension_id: get("CODEX_EXTENSION_ID").or(self.extension_id),
            node_path: get("CODEX_BROWSER_USE_NODE_PATH")
                .or(self.node_path)
                .unwrap_or_else(|| "node".into()),
            browser_client_path: get("CODEX_BROWSER_CLIENT_PATH").or(self.browser_client_path),
            codex_home: get("CODEX_HOME").or(self.codex_home),
            node_repl_path: get("CODEX_NODE_REPL_PATH").or(self.node_repl_path),
            proxy_host: get("CODEX_APP_SERVER_PROXY_HOST")
                .or(self.proxy_host)
                .unwrap_or_else(|| "127.0.0.1".into()),
            // The binary parses u16, and on invalid/overflow input falls back to
            // the selected configuration's port, then zero; it does not error.
            proxy_port: get("CODEX_APP_SERVER_PROXY_PORT")
                .and_then(|value| value.parse::<u16>().ok())
                .or(self.proxy_port)
                .unwrap_or(0),
        }
    }
}
