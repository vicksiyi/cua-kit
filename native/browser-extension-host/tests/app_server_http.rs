use core_browser_extension_host::{
    app_server_http::{read_headers, PrefixedTcpReader},
    app_server_websocket::read_client_frame,
};
use std::io::{self, Cursor, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::Duration;

#[test]
fn header_delimiter_split_and_limit_match_native_read_order() {
    struct Chunks(Cursor<Vec<u8>>, usize);
    impl Read for Chunks {
        fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
            let len = buf.len().min(self.1);
            self.0.read(&mut buf[..len])
        }
    }
    for size in 1..10 {
        let mut reader = Chunks(Cursor::new(b"GET / HTTP/1.1\r\n\r\nframe".to_vec()), size);
        let result = read_headers(&mut reader).unwrap();
        assert_eq!(result.headers, b"GET / HTTP/1.1\r\n\r\n");
        let mut remaining = result.remaining;
        reader.read_to_end(&mut remaining).unwrap();
        assert_eq!(remaining, b"frame");
    }
    let mut bytes = vec![b'x'; 65536];
    bytes.extend_from_slice(b"\r\n\r\nframe");
    let result = read_headers(&mut Cursor::new(bytes)).unwrap();
    assert_eq!(result.headers.len(), 65540);
    assert_eq!(result.remaining, b"frame");
    let error = read_headers(&mut Cursor::new(vec![b'x'; 65537]))
        .err()
        .unwrap();
    assert_eq!(error.kind(), io::ErrorKind::InvalidData);
    assert_eq!(error.to_string(), "HTTP headers exceeded 64KiB");
    let error = read_headers(&mut Cursor::new(vec![b'x'; 65536]))
        .err()
        .unwrap();
    assert_eq!(error.kind(), io::ErrorKind::UnexpectedEof);
}

#[test]
fn handshake_overread_and_live_socket_form_one_frame_without_loss() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let mut sender = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
    let (receiver, _) = listener.accept().unwrap();
    receiver
        .set_read_timeout(Some(Duration::from_secs(2)))
        .unwrap();
    // Simulate the exact bytes returned by the last handshake read: headers
    // plus frame header and half the mask; the remaining bytes arrive via TCP.
    let buffered = b"GET / HTTP/1.1\r\n\r\n\x81\x83\x01\x02";
    let collected = read_headers(&mut Cursor::new(buffered)).unwrap();
    sender
        .write_all(&[3, 4, b'a' ^ 1, b'b' ^ 2, b'c' ^ 3])
        .unwrap();
    let mut reader = PrefixedTcpReader::new(receiver, collected.remaining);
    assert_eq!(reader.read(&mut []).unwrap(), 0);
    let frame = read_client_frame(&mut reader).unwrap();
    assert_eq!(frame.opcode, 1);
    assert_eq!(frame.payload, b"abc");
    sender.write_all(&[0x89, 0x80, 0, 0, 0, 0]).unwrap();
    assert_eq!(read_client_frame(&mut reader).unwrap().opcode, 9);
}

#[test]
fn native_request_parser_preserves_permissive_and_duplicate_semantics() {
    use core_browser_extension_host::app_server_http::read_request;
    let bytes = b"\tcustom\t/path?token=a\tignored version\r\n Name : first\r\nNAME: last:with:colon \r\nignored malformed line\r\n: empty-name\r\nX-\xff: \xff\r\n\r\n\xff\0";
    let request = read_request(&mut Cursor::new(bytes)).unwrap();
    assert_eq!(request.method, "custom");
    assert_eq!(request.path, "/path?token=a");
    assert_eq!(request.headers["name"], "last:with:colon");
    assert_eq!(request.headers[""], "empty-name");
    assert_eq!(request.headers["x-\u{fffd}"], "\u{fffd}");
    assert_eq!(request.remaining, b"\xff\0");
    assert!(read_request(&mut Cursor::new(b"GET /\r\n\r\n")).is_ok());
    for (bytes, expected) in [
        (b"\r\n\r\n".as_slice(), "missing request method"),
        (b"GET\r\n\r\n".as_slice(), "missing request path"),
    ] {
        let error = read_request(&mut Cursor::new(bytes)).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::InvalidData);
        assert_eq!(error.to_string(), expected);
    }
}

#[test]
fn query_parameters_are_first_exact_raw_key_value_pair() {
    use core_browser_extension_host::app_server_http::request_query_param as get;
    assert_eq!(get("/x?token=first&token=second", "token"), Some("first"));
    assert_eq!(
        get("/x?token&token=a=b%20+c#frag", "token"),
        Some("a=b%20+c#frag")
    );
    assert_eq!(get("/x?token=", "token"), Some(""));
    assert_eq!(get("/x?Token=a&%74oken=b", "token"), None);
    assert_eq!(get("/x", "token"), None);
}

#[test]
fn upgrade_gate_authenticates_before_checking_upgrade_shape() {
    use core_browser_extension_host::app_server_http::{
        read_request, validate_upgrade, RequestRejection::*,
    };
    let mut request=read_request(&mut Cursor::new(b"GET /arbitrary?token=secret\r\nOrigin: chrome-extension://example///\r\nConnection: keep-alive, UpGrAdE\r\nUpgrade: WebSocket\r\nSec-WebSocket-Key: \r\n\r\n")).unwrap();
    // Presence alone is checked for key; no key decoding or version/path gate.
    assert_eq!(
        validate_upgrade(&request, "secret", Some("chrome-extension://example")),
        Ok("")
    );
    request.method = "POST".into();
    assert_eq!(validate_upgrade(&request, "wrong", None), Err(Forbidden));
    assert_eq!(validate_upgrade(&request, "secret", None), Err(NotFound));
    request.method = "GET".into();
    assert_eq!(
        validate_upgrade(&request, "secret", Some("chrome-extension://example/")),
        Err(Forbidden)
    );
    request.headers.remove("origin");
    assert_eq!(
        validate_upgrade(&request, "secret", Some("chrome-extension://example")),
        Err(Forbidden)
    );
    assert_eq!(validate_upgrade(&request, "secret", None), Ok(""));
    request.path = "/?token=wrong&token=secret".into();
    assert_eq!(validate_upgrade(&request, "secret", None), Err(Forbidden));
    request.path = "/?token=secret".into();
    request
        .headers
        .insert("connection".into(), "xupgrade".into());
    assert_eq!(validate_upgrade(&request, "secret", None), Err(NotFound));
    request
        .headers
        .insert("connection".into(), "upgrade".into());
    request
        .headers
        .insert("upgrade".into(), "websocket, other".into());
    assert_eq!(validate_upgrade(&request, "secret", None), Err(NotFound));
    request.headers.insert("upgrade".into(), "websocket".into());
    request.headers.remove("sec-websocket-key");
    assert_eq!(validate_upgrade(&request, "secret", None), Err(NotFound));
}

#[test]
fn real_tcp_rejection_writes_exact_native_response() {
    use core_browser_extension_host::app_server_http::read_validated_request;
    for (request, status, body) in [
        ("POST /?token=wrong\r\n\r\n", "403 Forbidden", "Forbidden"),
        ("POST /?token=secret\r\n\r\n", "404 Not Found", "Not Found"),
    ] {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let mut client = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
        let (mut server, _) = listener.accept().unwrap();
        client
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        server
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        client.write_all(request.as_bytes()).unwrap();
        assert!(read_validated_request(&mut server, "secret", None)
            .unwrap()
            .is_none());
        drop(server);
        let mut response = String::new();
        client.read_to_string(&mut response).unwrap();
        assert_eq!(response,format!("HTTP/1.1 {status}\r\nContent-Length: 9\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n{body}"));
    }
}

#[test]
fn rejection_short_writes_and_failures_are_propagated_without_flush() {
    use core_browser_extension_host::app_server_http::{write_rejection, RequestRejection};
    struct Failing {
        bytes: Vec<u8>,
        limit: usize,
    }
    impl Write for Failing {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            if self.bytes.len() == self.limit {
                return Err(io::Error::new(io::ErrorKind::BrokenPipe, "fixture"));
            }
            let count = bytes.len().min(1);
            self.bytes.extend_from_slice(&bytes[..count]);
            Ok(count)
        }
        fn flush(&mut self) -> io::Result<()> {
            panic!("native response has no flush")
        }
    }
    for limit in [0, 10, 50, 89] {
        let mut writer = Failing {
            bytes: vec![],
            limit,
        };
        assert_eq!(
            write_rejection(&mut writer, RequestRejection::Forbidden)
                .unwrap_err()
                .kind(),
            io::ErrorKind::BrokenPipe
        );
        assert_eq!(writer.bytes.len(), limit);
    }
}

#[test]
fn upgrade_accept_and_wire_response_match_known_vectors() {
    use core_browser_extension_host::app_server_http::{websocket_accept, write_upgrade};
    assert_eq!(
        websocket_accept("dGhlIHNhbXBsZSBub25jZQ=="),
        "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="
    );
    // Independently computed SHA-1/base64 fixtures; key is not base64 decoded.
    assert_eq!(websocket_accept(""), "Kfh9QIsMVZcl6xEPYxPHzW8SZ8w=");
    let mut bytes = vec![];
    write_upgrade(&mut bytes, "dGhlIHNhbXBsZSBub25jZQ==").unwrap();
    assert_eq!(bytes,b"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n\r\n");
}
