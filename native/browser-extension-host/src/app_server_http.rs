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

#[derive(Debug)]
pub struct HttpRequest {
    pub method: String,
    pub path: String,
    pub headers: std::collections::HashMap<String, String>,
    pub remaining: Vec<u8>,
}

/// Native parser uses lossy UTF-8 and CRLF splitting, then only the first two
/// whitespace-separated request-line tokens. HTTP version validation is absent.
pub fn read_request(reader: &mut impl Read) -> io::Result<HttpRequest> {
    let collected = read_headers(reader)?;
    let text = String::from_utf8_lossy(&collected.headers[..collected.headers.len() - 4]);
    let mut lines = text.split("\r\n");
    let line = lines
        .next()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "missing request line"))?;
    let mut parts = line.split_whitespace();
    let method = parts
        .next()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "missing request method"))?
        .to_owned();
    let path = parts
        .next()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "missing request path"))?
        .to_owned();
    let mut headers = std::collections::HashMap::new();
    for line in lines {
        if let Some((name, value)) = line.split_once(':') {
            headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_owned());
        }
    }
    Ok(HttpRequest {
        method,
        path,
        headers,
        remaining: collected.remaining,
    })
}

/// First matching query pair, with no percent decoding, plus conversion, case
/// folding, or fragment stripping (request_query_param, 0x1000217e4..0x100021970).
pub fn request_query_param<'a>(path: &'a str, name: &str) -> Option<&'a str> {
    path.split_once('?')?.1.split('&').find_map(|pair| {
        let (key, value) = pair.split_once('=')?;
        (key == name).then_some(value)
    })
}
