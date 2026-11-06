//! Replay bookkeeping extracted from forward_app_server_to_attached_client.
//! Caller owns the state mutex, current generation and actual websocket writer.
use serde_json::Value;

pub const INITIALIZE_ID: &str = "__codex_sidepanel_initialize__";

/// Native forwarding removes all trailing CR/LF, not general whitespace.
pub fn payload(line: &str) -> Option<&str> {
    let line = line.trim_end_matches(['\r', '\n']);
    (!line.is_empty()).then_some(line)
}

#[derive(Default)]
pub struct OutputReplay {
    pub initialize_response: Option<String>,
    pub pending_requests: Vec<String>,
}
impl OutputReplay {
    /// Called before selecting the attached writer. Presence of result matters,
    /// including null; presence of method (even null) disqualifies the response.
    pub fn observe_initialize(
        &mut self,
        line: &str,
        current_generation: u64,
        reader_generation: u64,
    ) {
        if current_generation != reader_generation {
            return;
        }
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            return;
        };
        if value.get("id").and_then(Value::as_str) == Some(INITIALIZE_ID)
            && value.get("method").is_none()
            && value.get("result").is_some()
        {
            self.initialize_response = Some(line.to_owned());
        }
    }

    /// Used only when no writer was selected. Retains the first 128 requests;
    /// notifications/responses/malformed data and stale generations are ignored.
    /// An ID's presence suffices; its type and value are not validated here.
    pub fn buffer_unattached(
        &mut self,
        line: &str,
        current_generation: u64,
        reader_generation: u64,
    ) -> bool {
        if current_generation != reader_generation || self.pending_requests.len() >= 128 {
            return false;
        }
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            return false;
        };
        if value.get("method").and_then(Value::as_str).is_some() && value.get("id").is_some() {
            self.pending_requests.push(line.to_owned());
            true
        } else {
            false
        }
    }
}

use crate::app_server_websocket::{write_frame, SharedWriter};
use std::sync::{Arc, Mutex};

/// Output-related subset of AppServerProcessState. Lifecycle fields remain with
/// the process owner; generation must be updated there when replacing a child.
#[derive(Default)]
pub struct OutputState {
    pub generation: u64,
    pub replay: OutputReplay,
    pub writer: Option<SharedWriter>,
}
pub type SharedOutput = Arc<Mutex<OutputState>>;

pub fn detach_writer(state: &SharedOutput, expected: &SharedWriter) {
    if let Ok(mut state) = state.lock() {
        if state
            .writer
            .as_ref()
            .is_some_and(|writer| Arc::ptr_eq(writer, expected))
        {
            state.writer = None;
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum Delivery {
    Empty,
    Sent,
    Buffered,
    Dropped,
    WriteFailed,
}

/// Compose the native per-line path. Socket writes occur outside the state lock.
/// On write failure detach only that writer; do not requeue the failed frame.
/// The outcome lets the eventual reader reproduce diagnostic logging separately.
pub fn deliver_line(state: &SharedOutput, generation: u64, line: &str) -> Delivery {
    let Some(line) = payload(line) else {
        return Delivery::Empty;
    };
    if let Ok(mut state) = state.lock() {
        let current = state.generation;
        state.replay.observe_initialize(line, current, generation);
    }
    let writer = state.lock().ok().and_then(|state| {
        if state.generation == generation {
            state.writer.clone()
        } else {
            None
        }
    });
    if let Some(writer) = writer {
        if write_frame(&writer, 1, line.as_bytes()).is_err() {
            detach_writer(state, &writer);
            return Delivery::WriteFailed;
        }
        return Delivery::Sent;
    }
    if let Ok(mut state) = state.lock() {
        let current = state.generation;
        if state.replay.buffer_unattached(line, current, generation) {
            return Delivery::Buffered;
        }
    }
    Delivery::Dropped
}

/// Native read loop: one UTF-8 line per frame, including a final unterminated
/// line. EOF succeeds; read/UTF-8 error ends the loop. Owner handles diagnostics,
/// generation-guarded lifecycle cleanup and then child wait after this returns.
pub fn forward_lines(
    reader: impl std::io::Read,
    state: &SharedOutput,
    generation: u64,
    mut on_delivery: impl FnMut(Delivery),
) -> std::io::Result<()> {
    use std::io::BufRead;
    let mut reader = std::io::BufReader::with_capacity(8192, reader);
    let mut line = String::new();
    loop {
        line.clear();
        if reader.read_line(&mut line)? == 0 {
            return Ok(());
        }
        on_delivery(deliver_line(state, generation, &line));
    }
}
