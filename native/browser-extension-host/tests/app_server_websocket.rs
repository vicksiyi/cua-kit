use core_browser_extension_host::app_server_websocket::{close, write_frame, SharedWriter};
use std::{
    io::Read,
    net::{TcpListener, TcpStream},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

fn pair() -> (SharedWriter, TcpStream) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let sender = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
    let (receiver, _) = listener.accept().unwrap();
    sender
        .set_write_timeout(Some(Duration::from_secs(5)))
        .unwrap();
    receiver
        .set_read_timeout(Some(Duration::from_secs(5)))
        .unwrap();
    (Arc::new(Mutex::new(sender)), receiver)
}

#[test]
fn real_tcp_frames_preserve_boundaries_payload_and_close_eof() {
    let (writer, mut receiver) = pair();
    let sender = thread::spawn(move || {
        for len in [0, 125, 126, 65535, 65536] {
            write_frame(&writer, 1, &vec![0xa5; len]).unwrap();
        }
        close(&writer);
    });
    for len in [0usize, 125, 126, 65535, 65536] {
        let mut base = [0; 2];
        receiver.read_exact(&mut base).unwrap();
        assert_eq!(base[0], 0x81);
        let decoded = match base[1] {
            126 => {
                let mut bytes = [0; 2];
                receiver.read_exact(&mut bytes).unwrap();
                u16::from_be_bytes(bytes) as usize
            }
            127 => {
                let mut bytes = [0; 8];
                receiver.read_exact(&mut bytes).unwrap();
                u64::from_be_bytes(bytes) as usize
            }
            n => n as usize,
        };
        assert_eq!(decoded, len);
        let mut payload = vec![0; len];
        receiver.read_exact(&mut payload).unwrap();
        assert!(payload.iter().all(|b| *b == 0xa5));
    }
    let mut close_frame = [0; 2];
    receiver.read_exact(&mut close_frame).unwrap();
    assert_eq!(close_frame, [0x88, 0]);
    assert_eq!(receiver.read(&mut [0]).unwrap(), 0);
    sender.join().unwrap();
}

#[test]
fn concurrent_writers_do_not_interleave_frames() {
    let (writer, mut receiver) = pair();
    let threads: Vec<_> = (0..8)
        .map(|id| {
            let writer = writer.clone();
            thread::spawn(move || {
                for _ in 0..50 {
                    write_frame(&writer, 2, &[id; 100]).unwrap();
                }
            })
        })
        .collect();
    let mut counts = [0; 8];
    for _ in 0..400 {
        let mut frame = [0; 102];
        receiver.read_exact(&mut frame).unwrap();
        assert_eq!(&frame[..2], &[0x82, 100]);
        let id = frame[2];
        assert!(id < 8);
        assert!(frame[2..].iter().all(|b| *b == id));
        counts[id as usize] += 1;
    }
    for handle in threads {
        handle.join().unwrap();
    }
    assert_eq!(counts, [50; 8]);
    close(&writer);
}

fn masked(payload: &[u8], encoding: u8) -> Vec<u8> {
    let mut bytes = vec![0xf2, 0x80 | encoding];
    match encoding {
        126 => bytes.extend_from_slice(&(payload.len() as u16).to_be_bytes()),
        127 => bytes.extend_from_slice(&(payload.len() as u64).to_be_bytes()),
        _ => assert_eq!(encoding as usize, payload.len()),
    }
    let mask = [0x13, 0xab, 0, 0xff];
    bytes.extend_from_slice(&mask);
    bytes.extend(payload.iter().enumerate().map(|(i, b)| b ^ mask[i % 4]));
    bytes
}

#[test]
fn client_decoder_handles_partial_and_coalesced_reads_without_extra_validation() {
    use core_browser_extension_host::app_server_websocket::read_client_frame;
    struct OneByte(std::io::Cursor<Vec<u8>>);
    impl Read for OneByte {
        fn read(&mut self, out: &mut [u8]) -> std::io::Result<usize> {
            let len = out.len().min(1);
            self.0.read(&mut out[..len])
        }
    }
    let cases = [
        (0, 0),
        (125, 125),
        (126, 126),
        (65535, 126),
        (65536, 127),
        (3, 126),
        (3, 127),
    ];
    let bytes = cases
        .iter()
        .flat_map(|&(len, enc)| masked(&vec![0xff; len], enc))
        .collect();
    let mut reader = OneByte(std::io::Cursor::new(bytes));
    for (len, _) in cases {
        let frame = read_client_frame(&mut reader).unwrap();
        assert_eq!(frame.opcode, 2);
        assert_eq!(frame.payload, vec![0xff; len]);
    }
    assert_eq!(
        read_client_frame(&mut reader).unwrap_err().kind(),
        std::io::ErrorKind::UnexpectedEof
    );
}

#[test]
fn client_decoder_checks_size_before_mask_and_reports_truncation() {
    use core_browser_extension_host::app_server_websocket::read_client_frame;
    use std::io::{Cursor, ErrorKind};
    for length in [67_108_865u64, u64::MAX] {
        let mut bytes = vec![0x81, 127]; // deliberately unmasked
        bytes.extend_from_slice(&length.to_be_bytes());
        let error = read_client_frame(&mut Cursor::new(bytes)).unwrap_err();
        assert_eq!(error.kind(), ErrorKind::InvalidData);
        assert_eq!(
            error.to_string(),
            "WebSocket message exceeded maximum allowed size"
        );
    }
    let mut at_limit = vec![0x81, 127];
    at_limit.extend_from_slice(&67_108_864u64.to_be_bytes());
    assert_eq!(
        read_client_frame(&mut Cursor::new(at_limit))
            .unwrap_err()
            .to_string(),
        "client WebSocket frame was not masked"
    );
    let bytes = masked(b"abcdef", 127);
    for end in 0..bytes.len() {
        assert_eq!(
            read_client_frame(&mut Cursor::new(&bytes[..end]))
                .unwrap_err()
                .kind(),
            ErrorKind::UnexpectedEof
        );
    }
    assert_eq!(
        read_client_frame(&mut Cursor::new([0x81, 0]))
            .unwrap_err()
            .to_string(),
        "client WebSocket frame was not masked"
    );
}
