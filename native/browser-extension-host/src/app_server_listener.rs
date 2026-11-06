//! Native blocking incoming loop and detached connection workers.
//! Binding, token/origin construction and owner shutdown are separate stages.
use crate::app_server_process_map::{handle_shared_connection, ProcessMap, SharedRuntime};
use std::{
    io,
    net::{TcpListener, TcpStream},
    sync::{Arc, Mutex},
};

pub type SharedOrigin = Arc<Mutex<Option<String>>>;

pub fn run_proxy_listener(
    listener: TcpListener,
    runtime: SharedRuntime,
    token: String,
    origin: SharedOrigin,
    processes: ProcessMap,
) {
    dispatch_incoming(listener.incoming(), runtime, token, origin, processes);
}

/// Same loop factored over Incoming's iterator contract so accept failures and
/// finite inputs can be verified without introducing a different shutdown loop.
pub fn dispatch_incoming(
    incoming: impl IntoIterator<Item = io::Result<TcpStream>>,
    runtime: SharedRuntime,
    token: String,
    origin: SharedOrigin,
    processes: ProcessMap,
) {
    for accepted in incoming {
        let Ok(stream) = accepted else {
            continue;
        };
        let runtime = runtime.clone();
        let token = token.clone();
        let origin = origin.clone();
        let processes = processes.clone();
        drop(std::thread::spawn(move || {
            // Snapshot origin before reading the HTTP request. Runtime is instead
            // snapshotted by the handler after request validation.
            let expected_origin = origin
                .lock()
                .expect("app-server proxy allowed origin mutex poisoned")
                .clone();
            if let Err(error) = handle_shared_connection(
                stream,
                &processes,
                &runtime,
                &token,
                expected_origin.as_deref(),
            ) {
                eprintln!("extension-host: Codex app-server proxy connection failed: {error}");
            }
        }));
    }
}
