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
