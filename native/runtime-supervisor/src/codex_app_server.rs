//! App Server process boundary reconstructed from the pinned native spawn routine.
//! Connection initialization, RPC dispatch and request caching are not implemented here.
use crate::authenticated_fetch::FetchRuntimeMode;
use std::{env::VarError, process::Stdio};
use tokio::{
    io::BufReader,
    process::{Child, ChildStdin, ChildStdout, Command},
};

pub const APP_SERVER_ARGS: [&str; 3] = ["app-server", "--listen", "stdio://"];

/// Native std::env::var fallback: absent AND non-Unicode values use `codex`.
/// A present empty value is retained; it is not replaced with a guessed path.
pub fn resolve_cli_path(value: Result<String, VarError>) -> String {
    value.unwrap_or_else(|_| "codex".to_owned())
}

pub struct CodexAppServerConnection {
    pub child: Child,
    pub stdin: ChildStdin,
    pub stdout: BufReader<ChildStdout>,
}

impl CodexAppServerConnection {
    /// Caller must parse the runtime mode first; invalid-mode errors belong to
    /// that parser. The native routine rejects gaas-browser before path lookup.
    pub fn spawn(mode: FetchRuntimeMode) -> Result<Self, String> {
        Self::spawn_with_cli_lookup(mode, || std::env::var("CODEX_CLI_PATH"))
    }

    /// Lookup injection permits owned-process tests without changing global env.
    pub fn spawn_with_cli_lookup(
        mode: FetchRuntimeMode,
        lookup: impl FnOnce() -> Result<String, VarError>,
    ) -> Result<Self, String> {
        if matches!(mode, FetchRuntimeMode::GaasBrowser) {
            return Err("Codex app-server is unavailable in gaas-browser runtime mode".into());
        }
        let mut child = Command::new(resolve_cli_path(lookup()))
            .args(APP_SERVER_ARGS)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .map_err(|error| format!("failed to start codex app-server: {error}"))?;
        let stdin = child
            .stdin
            .take()
            .ok_or("codex app-server stdin is unavailable")?;
        let stdout = child
            .stdout
            .take()
            .ok_or("codex app-server stdout is unavailable")?;
        Ok(Self {
            child,
            stdin,
            stdout: BufReader::with_capacity(8192, stdout),
        })
    }
}
