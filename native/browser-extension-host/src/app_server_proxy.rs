//! Proxy preparation recovered from inlined AppServerProxy::start in ensure.
//! Listener ownership and manager lifecycle stages are reconstructed separately.
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
    pub host: String,
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
        host: config.launch.proxy_host.clone(),
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
    pub host: String,
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
            host,
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
            host,
            port,
            token,
            origin,
            runtime,
            processes,
            runtime_session_id,
        }
    }
}

/// Process portion of AppServerManager::shutdown. Take the proxy first, take
/// the entire map under lock, release it, then stop each process best effort.
/// A poisoned map yields an empty local map; native shutdown does not recover it.
/// Asset cleanup follows this stage in the manager and is not performed here.
pub fn shutdown_proxy(slot: &mut Option<AppServerProxy>) {
    if let Some(proxy) = slot.take() {
        let processes = proxy
            .processes
            .lock()
            .map(|mut processes| std::mem::take(&mut *processes))
            .unwrap_or_default();
        for (_, process) in processes {
            let _ = crate::app_server_output::stop_process(&process);
        }
    }
}

impl AppServerProxy {
    /// Existing-proxy branch of manager ensure. Keep the runtime lock while
    /// replacing origin, matching native lock order and poison propagation.
    /// Updating configuration alone does not restart children or rotate IDs.
    pub fn update_configuration(&self, config: &LoadedLaunchConfiguration) {
        let mut runtime = self
            .runtime
            .lock()
            .expect("app-server proxy state mutex poisoned");
        *runtime = ProxyRuntimeState::from(config);
        let mut origin = self
            .origin
            .lock()
            .expect("app-server proxy allowed origin mutex poisoned");
        *origin = config
            .launch
            .extension_id
            .as_ref()
            .map(|id| format!("chrome-extension://{id}"));
    }
}

impl AppServerProxy {
    /// Explicit restart stage of manager ensure, after configuration refresh.
    /// Retain the selected map entry; the next input starts its replacement child.
    pub fn restart_client(&self, params: Option<&serde_json::Value>) -> Result<(), RuntimeError> {
        let client = params
            .and_then(|v| v.get("clientId"))
            .and_then(serde_json::Value::as_str)
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .unwrap_or("default");
        let stopped = (|| -> std::io::Result<()> {
            let process = self
                .processes
                .lock()
                .map_err(|_| std::io::Error::other("app-server process map mutex poisoned"))?
                .get(client)
                .cloned();
            if let Some(process) = process {
                crate::app_server_output::stop_process(&process)?;
            }
            Ok(())
        })();
        stopped.map_err(|error| {
            runtime_error(format!(
                "Failed to restart Codex app-server for client {client}: {error}"
            ))
        })?;
        let mut session = self
            .runtime_session_id
            .lock()
            .map_err(|_| runtime_error("runtime session id mutex poisoned".into()))?;
        *session = uuid::Uuid::new_v4().to_string();
        Ok(())
    }
}

impl AppServerProxy {
    /// Native ensure formats the originally bound host, actual port and token
    /// directly. It does not add a slash, encode the token or append clientId.
    pub fn local_app_server_url(&self) -> String {
        format!("ws://{}:{}?token={}", self.host, self.port, self.token)
    }

    pub fn runtime_session_id(&self) -> String {
        self.runtime_session_id
            .lock()
            .expect("app-server proxy runtime session id mutex poisoned")
            .clone()
    }
}

impl AppServerProxy {
    /// Release the shared runtime lock before consulting the persisted defaults.
    pub fn runtime_config(&self) -> serde_json::Value {
        let snapshot = self
            .runtime
            .lock()
            .expect("app-server proxy state mutex poisoned")
            .clone();
        snapshot.response_value()
    }
}
