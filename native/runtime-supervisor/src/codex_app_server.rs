//! App Server process boundary reconstructed from the pinned native spawn routine.
//! Initialization and client-level connection reuse remain separate responsibilities.
use crate::authenticated_fetch::FetchRuntimeMode;
use std::{env::VarError, process::Stdio};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader, Lines},
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
    pub stdout: Lines<BufReader<ChildStdout>>,
    next_request_id: usize,
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
            stdout: BufReader::with_capacity(8192, stdout).lines(),
            next_request_id: 0,
        })
    }
}

/// Preserve a server-provided string message (including empty), otherwise use
/// the native fallback. Error codes/data are not appended by this helper.
pub fn app_server_error_message(error: &serde_json::Value, method: &str) -> String {
    error
        .get("message")
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned)
        .unwrap_or_else(|| format!("codex app-server rejected {method}"))
}

impl CodexAppServerConnection {
    /// Native newline-delimited request protocol. IDs are decimal strings, not
    /// JSON numbers. Each ignored line starts a fresh 30-second next-line wait.
    /// This is not a whole-request deadline, and writes are not timed here.
    pub async fn send_request(
        &mut self,
        method: &str,
        params: Option<serde_json::Value>,
    ) -> Result<serde_json::Value, String> {
        self.next_request_id = self.next_request_id.wrapping_add(1);
        let id = self.next_request_id.to_string();
        let mut request = serde_json::json!({"id":id,"method":method});
        if let Some(params) = params {
            request["params"] = params;
        }
        let bytes = serde_json::to_vec(&request)
            .map_err(|error| format!("failed to serialize codex app-server request: {error}"))?;
        self.stdin
            .write_all(&bytes)
            .await
            .map_err(|error| format!("failed to write codex app-server request: {error}"))?;
        // Original 'flush' branch writes the newline; no separate poll_flush call.
        self.stdin
            .write_all(b"\n")
            .await
            .map_err(|error| format!("failed to flush codex app-server request: {error}"))?;
        loop {
            let line =
                tokio::time::timeout(std::time::Duration::from_secs(30), self.stdout.next_line())
                    .await
                    .map_err(|_| format!("timed out waiting for {method} from codex app-server"))?
                    .map_err(|error| format!("failed to read codex app-server response: {error}"))?
                    .ok_or_else(|| format!("codex app-server exited before returning {method}"))?;
            if line.is_empty() {
                continue;
            }
            let response: serde_json::Value = serde_json::from_str(&line)
                .map_err(|error| format!("codex app-server returned invalid JSON: {error}"))?;
            if response.get("id").and_then(serde_json::Value::as_str) != Some(id.as_str()) {
                continue;
            }
            if let Some(error) = response.get("error") {
                return Err(app_server_error_message(error, method));
            }
            return Ok(response
                .get("result")
                .cloned()
                .unwrap_or(serde_json::Value::Null));
        }
    }
}
