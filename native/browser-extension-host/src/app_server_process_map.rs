//! Process-map selection from proxy_websocket_to_persistent_app_server.
use crate::{
    app_server_configuration::LoadedLaunchConfiguration,
    app_server_http::{read_validated_request, request_query_param},
    app_server_output::{OutputState, SharedOutput},
    app_server_session::run_session,
};
use std::{
    collections::HashMap,
    io,
    net::TcpStream,
    sync::{Arc, Mutex},
};

pub type ProcessMap = Arc<Mutex<HashMap<String, SharedOutput>>>;

/// Missing or empty first clientId uses "default". Values are raw, case
/// sensitive, untrimmed, and not percent decoded, as with native query parsing.
pub fn client_id(path: &str) -> &str {
    request_query_param(path, "clientId")
        .filter(|id| !id.is_empty())
        .unwrap_or("default")
}

pub fn select_process(processes: &ProcessMap, path: &str) -> io::Result<SharedOutput> {
    let mut processes = processes
        .lock()
        .map_err(|_| io::Error::other("app-server process map mutex poisoned"))?;
    Ok(processes
        .entry(client_id(path).to_owned())
        .or_insert_with(|| Arc::new(Mutex::new(OutputState::default())))
        .clone())
}

/// Connection-level composition. A rejected request never creates a process-map
/// entry. Selection releases the map lock before spawning or doing socket I/O.
/// Entries persist after disconnect and failed spawn; lifecycle owner stops them.
pub fn handle_connection(
    mut stream: TcpStream,
    processes: &ProcessMap,
    config: &LoadedLaunchConfiguration,
    expected_token: &str,
    expected_origin: Option<&str>,
) -> io::Result<()> {
    let Some(request) = read_validated_request(&mut stream, expected_token, expected_origin)?
    else {
        return Ok(());
    };
    let state = select_process(processes, &request.path)?;
    run_session(stream, request, &state, config)
}

pub type SharedRuntime = Arc<Mutex<crate::app_server_runtime_state::ProxyRuntimeState>>;

/// Native request handler snapshots shared runtime after request validation,
/// before selecting/starting the process. Existing sessions retain their snapshot.
pub fn handle_shared_connection(
    mut stream: TcpStream,
    processes: &ProcessMap,
    runtime: &SharedRuntime,
    expected_token: &str,
    expected_origin: Option<&str>,
) -> io::Result<()> {
    let Some(request) = read_validated_request(&mut stream, expected_token, expected_origin)?
    else {
        return Ok(());
    };
    let snapshot = runtime
        .lock()
        .expect("app-server proxy state mutex poisoned")
        .clone();
    let state = select_process(processes, &request.path)?;
    crate::app_server_session::run_runtime_session(stream, request, &state, &snapshot)
}
