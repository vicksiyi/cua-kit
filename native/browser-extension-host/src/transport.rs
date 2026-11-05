//! Native-endian length-prefixed JSON shared by stdio and Unix stream transports.
//! Frame policy is explicitly supplied by the host, not inferred from vendor symbols.
use serde_json::Value;
use std::io::{self, Read};

pub fn encode(message: &Value, max_frame_bytes: usize) -> io::Result<Vec<u8>> {
    let payload = serde_json::to_vec(message)?;
    if payload.len() > max_frame_bytes || payload.len() > u32::MAX as usize {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "native host frame exceeds limit",
        ));
    }
    let mut frame = Vec::with_capacity(4 + payload.len());
    frame.extend_from_slice(&(payload.len() as u32).to_ne_bytes());
    frame.extend_from_slice(&payload);
    Ok(frame)
}

/// None means EOF at a frame boundary. Partial headers/bodies are errors, never
/// silently accepted as completed messages. The size check precedes allocation.
pub fn receive(reader: &mut impl Read, max_frame_bytes: usize) -> io::Result<Option<Value>> {
    let mut header = [0_u8; 4];
    loop {
        match reader.read(&mut header[..1]) {
            Ok(0) => return Ok(None),
            Ok(_) => break,
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(error),
        }
    }
    reader.read_exact(&mut header[1..])?;
    let length = u32::from_ne_bytes(header) as usize;
    if length > max_frame_bytes {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "native host frame exceeds limit",
        ));
    }
    let mut bytes = vec![0; length];
    reader.read_exact(&mut bytes)?;
    serde_json::from_slice(&bytes).map(Some).map_err(|_| {
        // Never include page data, tokens or the original JSON in diagnostics.
        io::Error::new(io::ErrorKind::InvalidData, "invalid native host JSON frame")
    })
}
