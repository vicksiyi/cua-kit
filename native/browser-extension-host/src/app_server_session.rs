//! Single persistent-process WebSocket session. Process-map selection and HTTP
//! authentication belong to the owner. Ordering from 0x100027a80..0x100028180.
use crate::{
    app_server_configuration::LoadedLaunchConfiguration,
    app_server_http::{write_upgrade, HttpRequest, PrefixedTcpReader},
    app_server_input::forward_runtime_frames,
    app_server_output::{detach_writer, SharedOutput},
    app_server_process::ensure_runtime_started,
    app_server_websocket::{close, write_frame, SharedWriter},
};
use std::{
    io,
    net::TcpStream,
    sync::{Arc, Mutex},
};

/// Publish writer and drain pending requests atomically, then close the replaced
/// connection and replay outside the state lock. Native replay failure drops
/// the remaining queue but leaves the newly stored writer for later cleanup.
pub fn attach_and_replay(state: &SharedOutput, writer: &SharedWriter) -> io::Result<()> {
    let (old, pending) = {
        let mut state = state
            .lock()
            .map_err(|_| io::Error::other("app-server process state mutex poisoned"))?;
        let old = state.writer.replace(writer.clone());
        let pending = std::mem::take(&mut state.replay.pending_requests);
        (old, pending)
    };
    if let Some(old) = old {
        close(&old);
    }
    for message in pending {
        write_frame(writer, 1, message.as_bytes())?;
    }
    Ok(())
}

/// Request must already have passed token/origin/upgrade validation. Do not
/// expose this function directly as an unauthenticated network entry point.
pub fn run_session(
    stream: TcpStream,
    request: HttpRequest,
    state: &SharedOutput,
    config: &LoadedLaunchConfiguration,
) -> io::Result<()> {
    run_runtime_session(
        stream,
        request,
        state,
        &crate::app_server_runtime_state::ProxyRuntimeState::from(config),
    )
}

pub fn run_runtime_session(
    mut stream: TcpStream,
    request: HttpRequest,
    state: &SharedOutput,
    runtime: &crate::app_server_runtime_state::ProxyRuntimeState,
) -> io::Result<()> {
    let key = request
        .headers
        .get("sec-websocket-key")
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "missing WebSocket key"))?;
    ensure_runtime_started(state, runtime)?;
    write_upgrade(&mut stream, key)?;
    let writer = Arc::new(Mutex::new(stream.try_clone()?));
    attach_and_replay(state, &writer)?;
    let result = forward_runtime_frames(
        PrefixedTcpReader::new(stream, request.remaining),
        state,
        runtime,
        &writer,
    );
    detach_writer(state, &writer);
    result
}
