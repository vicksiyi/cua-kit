//! Native server-side frame writer, reconstructed from 0x100024584..0x100024810.
//! This is not a websocket handshake/parser or a complete proxy transport.
use std::{
    io::{self, Write},
    net::{Shutdown, TcpStream},
    sync::{Arc, Mutex},
};

pub type SharedWriter = Arc<Mutex<TcpStream>>;

/// Whole frames share one mutex. Original code sets FIN and emits an unmasked
/// frame without validating opcode/control length or changing payload bytes.
pub fn write_frame(writer: &SharedWriter, opcode: u8, payload: &[u8]) -> io::Result<()> {
    let mut writer = writer
        .lock()
        .map_err(|_| io::Error::other("WebSocket writer mutex poisoned"))?;
    let mut header = [0u8; 10];
    header[0] = opcode | 0x80;
    let length = payload.len();
    let header_length = if length < 126 {
        header[1] = length as u8;
        2
    } else if length < 65536 {
        header[1] = 126;
        header[2..4].copy_from_slice(&(length as u16).to_be_bytes());
        4
    } else {
        header[1] = 127;
        header[2..10].copy_from_slice(&(length as u64).to_be_bytes());
        10
    };
    writer.write_all(&header[..header_length])?;
    writer.write_all(payload)
}

/// Best effort empty close frame, followed by shutdown of both TCP directions.
/// Like the native helper, errors are ignored and a poisoned lock is not recovered.
pub fn close(writer: &SharedWriter) {
    let _ = write_frame(writer, 8, &[]);
    if let Ok(writer) = writer.lock() {
        let _ = writer.shutdown(Shutdown::Both);
    }
}
