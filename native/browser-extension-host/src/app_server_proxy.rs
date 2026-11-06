//! Proxy preparation recovered from inlined AppServerProxy::start in ensure.
//! Thread ownership, manager reuse/update and shutdown are not implemented here.
use crate::{
    app_server_configuration::LoadedLaunchConfiguration,
    app_server_error::{RuntimeError, RuntimeErrorKind},
    app_server_listener::SharedOrigin,
    app_server_process_map::{ProcessMap, SharedRuntime},
    app_server_runtime_state::ProxyRuntimeState,
};
use std::{
    net::TcpListener,
    sync::{Arc, Mutex},
};

pub struct PreparedProxy {
    pub listener: TcpListener,
    pub port: u16,
    pub token: String,
    pub origin: SharedOrigin,
    pub runtime: SharedRuntime,
    pub processes: ProcessMap,
}
fn runtime_error(message: String) -> RuntimeError {
    RuntimeError {
        kind: RuntimeErrorKind::Runtime,
        message,
    }
}

/// Any failed nonzero-port bind retries on the same host with port zero. The
/// requested port is kept in fallback-failure text, as in the native formatter.
pub fn bind_listener(host: &str, port: u16) -> Result<TcpListener, RuntimeError> {
    match TcpListener::bind((host, port)) {
        Ok(listener) => Ok(listener),
        Err(error) if port != 0 => {
            eprintln!("extension-host: failed to bind Codex app-server proxy to {host}:{port}: {error}; using an available port");
            TcpListener::bind((host,0)).map_err(|error|runtime_error(format!("Failed to bind Codex app-server proxy to {host}:{port} or an available fallback port: {error}")))
        }
        Err(error) => Err(runtime_error(format!(
            "Failed to bind Codex app-server proxy to {host}:{port}: {error}"
        ))),
    }
}

pub fn prepare(config: &LoadedLaunchConfiguration) -> Result<PreparedProxy, RuntimeError> {
    let listener = bind_listener(&config.launch.proxy_host, config.launch.proxy_port)?;
    let port = listener
        .local_addr()
        .map_err(|error| {
            runtime_error(format!(
                "Failed to read Codex app-server proxy address: {error}"
            ))
        })?
        .port();
    let runtime = Arc::new(Mutex::new(ProxyRuntimeState::from(config)));
    // Native code uses two UUID v4 values formatted with uuid::fmt::Simple.
    let token = format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    );
    let origin = config
        .launch
        .extension_id
        .as_ref()
        .map(|id| format!("chrome-extension://{id}"));
    Ok(PreparedProxy {
        listener,
        port,
        token,
        origin: Arc::new(Mutex::new(origin)),
        runtime,
        processes: Arc::new(Mutex::new(Default::default())),
    })
}

/// Native proxy handle: listener ownership moves into a detached thread, so
/// dropping this handle does not close the listener. Manager shutdown must be
/// reconstructed separately; do not infer a listener stop from this Drop.
pub struct AppServerProxy {
    pub port: u16,
    pub token: String,
    pub origin: SharedOrigin,
    pub runtime: SharedRuntime,
    pub processes: ProcessMap,
    pub runtime_session_id: Arc<Mutex<String>>,
}
impl PreparedProxy {
    pub fn start(self) -> AppServerProxy {
        let runtime_session_id = Arc::new(Mutex::new(uuid::Uuid::new_v4().to_string()));
        let PreparedProxy {
            listener,
            port,
            token,
            origin,
            runtime,
            processes,
        } = self;
        let thread_runtime = runtime.clone();
        let thread_token = token.clone();
        let thread_origin = origin.clone();
        let thread_processes = processes.clone();
        drop(std::thread::spawn(move || {
            crate::app_server_listener::run_proxy_listener(
                listener,
                thread_runtime,
                thread_token,
                thread_origin,
                thread_processes,
            );
        }));
        AppServerProxy {
            port,
            token,
            origin,
            runtime,
            processes,
            runtime_session_id,
        }
    }
}
