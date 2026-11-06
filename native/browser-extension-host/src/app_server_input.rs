//! Native forward_websocket_to_app_server (0x100024a94..0x100025498).
//! Caller supplies the handshake-preserved reader and this connection's writer.
use crate::{
    app_server_configuration::LoadedLaunchConfiguration,
    app_server_output::{SharedOutput, INITIALIZE_ID},
    app_server_process::ensure_runtime_started,
    app_server_websocket::{read_client_frame, write_frame, SharedWriter},
};
use std::io::{self, Read, Write};

pub fn forward_frames(
    reader: impl Read,
    state: &SharedOutput,
    config: &LoadedLaunchConfiguration,
    writer: &SharedWriter,
) -> io::Result<()> {
    forward_runtime_frames(
        reader,
        state,
        &crate::app_server_runtime_state::ProxyRuntimeState::from(config),
        writer,
    )
}

pub fn forward_runtime_frames(
    mut reader: impl Read,
    state: &SharedOutput,
    runtime: &crate::app_server_runtime_state::ProxyRuntimeState,
    writer: &SharedWriter,
) -> io::Result<()> {
    loop {
        let frame = match read_client_frame(&mut reader) {
            Ok(frame) => frame,
            Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => return Ok(()),
            Err(error) => return Err(error),
        };
        match frame.opcode {
            0..=2 => {
                let initialize = serde_json::from_slice::<serde_json::Value>(&frame.payload)
                    .ok()
                    .is_some_and(|value| {
                        value.get("id").and_then(|v| v.as_str()) == Some(INITIALIZE_ID)
                            && value.get("method").and_then(|v| v.as_str()) == Some("initialize")
                    });
                if initialize {
                    let cached = state
                        .lock()
                        .map_err(|_| io::Error::other("app-server process state mutex poisoned"))?
                        .replay
                        .initialize_response
                        .clone();
                    if let Some(cached) = cached {
                        write_frame(writer, 1, cached.as_bytes())?;
                        continue;
                    }
                }
                ensure_runtime_started(state, runtime)?;
                let mut state = state
                    .lock()
                    .map_err(|_| io::Error::other("app-server process state mutex poisoned"))?;
                let stdin = state
                    .stdin
                    .as_mut()
                    .ok_or_else(|| io::Error::other("Codex app-server stdin is unavailable"))?;
                // Preserve even malformed JSON/binary bytes and append one newline.
                // Both writes hold the process lock; failure drops only stdin.
                if let Err(error) = stdin
                    .write_all(&frame.payload)
                    .and_then(|_| stdin.write_all(b"\n"))
                {
                    state.stdin = None;
                    return Err(error);
                }
            }
            8 => {
                let _ = write_frame(writer, 8, &frame.payload);
                return Ok(());
            }
            9 => write_frame(writer, 10, &frame.payload)?,
            10 => {}
            opcode => {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!("unsupported WebSocket opcode {opcode}"),
                ))
            }
        }
    }
}
