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
