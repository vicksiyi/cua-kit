//! HTTP transport input from handle_proxy_connection, 0x100022dc0..0x100022ed4.
//! Parsing, token verification and upgrade response are separate stages.
use std::io::{self, Read};
use std::net::TcpStream;

pub struct HeaderBytes {
    /// Includes the terminating CRLF CRLF. No UTF-8 conversion at this stage.
    pub headers: Vec<u8>,
    pub remaining: Vec<u8>,
}

pub fn read_headers(reader: &mut impl Read) -> io::Result<HeaderBytes> {
    let mut bytes = Vec::new();
    let mut chunk = [0; 4096];
    loop {
        let length = reader.read(&mut chunk)?;
        if length == 0 {
            return Err(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                "connection closed before HTTP headers completed",
            ));
        }
        bytes.extend_from_slice(&chunk[..length]);
        if let Some(position) = bytes.windows(4).position(|window| window == b"\r\n\r\n") {
            let remaining = bytes.split_off(position + 4);
            return Ok(HeaderBytes {
                headers: bytes,
                remaining,
            });
        }
        // The native limit is checked only after searching the newly read chunk.
        // An ending delimiter in the chunk crossing 64KiB is therefore accepted.
        if bytes.len() > 65536 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "HTTP headers exceeded 64KiB",
            ));
        }
    }
}

/// Bytes read beyond the HTTP delimiter must precede subsequent socket data.
/// Read semantics recovered from default_read_exact<PrefixedTcpReader> at
/// 0x10002b0dc..0x10002b15c: each read uses either prefix or socket, not both.
pub struct PrefixedTcpReader {
    stream: TcpStream,
    prefix: Vec<u8>,
    position: usize,
}
impl PrefixedTcpReader {
    pub fn new(stream: TcpStream, prefix: Vec<u8>) -> Self {
        Self {
            stream,
            prefix,
            position: 0,
        }
    }
}
impl Read for PrefixedTcpReader {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        if self.position < self.prefix.len() {
            let count = buffer.len().min(self.prefix.len() - self.position);
            buffer[..count].copy_from_slice(&self.prefix[self.position..self.position + count]);
            self.position += count;
            Ok(count)
        } else {
            self.stream.read(buffer)
        }
    }
}
