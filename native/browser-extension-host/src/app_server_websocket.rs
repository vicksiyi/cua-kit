//! Native server-side frame writer, reconstructed from 0x100024584..0x100024810.
//! Client frame decoding follows 0x100024ae8..0x100024c0c.
//! Handshake and complete proxy session dispatch are separate responsibilities.
use std::{
    io::{self, Read, Write},
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

/// Decoded single frame. The original decoder discards FIN/RSV bits and does
/// not validate UTF-8, canonical length encodings, or control-frame size here.
#[derive(Debug, PartialEq, Eq)]
pub struct ClientFrame {
    pub opcode: u8,
    pub payload: Vec<u8>,
}

pub fn read_client_frame(reader: &mut impl Read) -> io::Result<ClientFrame> {
    let mut header = [0; 2];
    reader.read_exact(&mut header)?;
    let length = match header[1] & 0x7f {
        126 => {
            let mut extended = [0; 2];
            reader.read_exact(&mut extended)?;
            u16::from_be_bytes(extended) as u64
        }
        127 => {
            let mut extended = [0; 8];
            reader.read_exact(&mut extended)?;
            let length = u64::from_be_bytes(extended);
            if length > 67_108_864 {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "WebSocket message exceeded maximum allowed size",
                ));
            }
            length
        }
        length => length as u64,
    };
    if header[1] & 0x80 == 0 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "client WebSocket frame was not masked",
        ));
    }
    let mut mask = [0; 4];
    reader.read_exact(&mut mask)?;
    let mut payload = vec![0; length as usize];
    reader.read_exact(&mut payload)?;
    for (index, byte) in payload.iter_mut().enumerate() {
        *byte ^= mask[index % 4];
    }
    Ok(ClientFrame {
        opcode: header[0] & 0x0f,
        payload,
    })
}
