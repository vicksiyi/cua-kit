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
