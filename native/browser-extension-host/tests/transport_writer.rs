use core_browser_extension_host::transport::{encode, receive};
use serde_json::json;
use std::io::{self, Cursor, Read};
struct OneByte<R>(R);
impl<R: Read> Read for OneByte<R> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let length = buf.len().min(1);
        self.0.read(&mut buf[..length])
    }
}
#[test]
fn fragmented_and_coalesced_native_endian_frames() {
    let a = json!({"jsonrpc":"2.0","id":"一","result":7});
    let b = json!({"jsonrpc":"2.0","id":2});
    let mut bytes = encode(&a, 1024).unwrap();
    let size = bytes.len();
    assert_eq!(
        u32::from_ne_bytes(bytes[..4].try_into().unwrap()) as usize,
        size - 4
    );
    bytes.extend(encode(&b, 1024).unwrap());
    let mut reader = OneByte(Cursor::new(bytes));
    assert_eq!(receive(&mut reader, 1024).unwrap(), Some(a));
    assert_eq!(receive(&mut reader, 1024).unwrap(), Some(b));
    assert_eq!(receive(&mut reader, 1024).unwrap(), None);
}
#[test]
fn truncation_is_not_clean_eof() {
    for bytes in [vec![1], vec![1, 0, 0], {
        let mut v = 5u32.to_ne_bytes().to_vec();
        v.extend(b"{}");
        v
    }] {
        assert_eq!(
            receive(&mut Cursor::new(bytes), 1024).unwrap_err().kind(),
            io::ErrorKind::UnexpectedEof
        );
    }
}
#[test]
fn oversize_prefix_is_rejected_before_reading_payload() {
    let mut reader = Cursor::new(u32::MAX.to_ne_bytes());
    assert_eq!(
        receive(&mut reader, 1024).unwrap_err().kind(),
        io::ErrorKind::InvalidData
    );
    assert_eq!(reader.position(), 4);
    assert_eq!(
        encode(&json!("12345"), 4).unwrap_err().kind(),
        io::ErrorKind::InvalidData
    );
}
#[test]
fn invalid_json_and_utf8_are_rejected_without_payload_in_errors() {
    for bytes in [
        b"secret-invalid-json".to_vec(),
        vec![b'"', 255, b'"'],
        vec![],
    ] {
        let mut frame = (bytes.len() as u32).to_ne_bytes().to_vec();
        frame.extend(bytes);
        let error = receive(&mut Cursor::new(frame), 1024).unwrap_err();
        assert_eq!(error.to_string(), "invalid native host JSON frame");
    }
}
#[cfg(unix)]
mod unix {
    use super::*;
    use core_browser_extension_host::{
        client_writer::{ClientWriter, DisconnectReason, QueueLimits},
        rpc_router::{Destination, RpcRouter},
    };
    use std::os::unix::net::UnixStream;
    use std::sync::mpsc;
    use std::time::Duration;
    fn limits() -> QueueLimits {
        QueueLimits {
            max_messages: 16,
            max_bytes: 4096,
            max_frame_bytes: 1024,
        }
    }
    #[test]
    fn routed_colliding_ids_and_notifications_cross_real_unix_writers() {
        let (events, notices) = mpsc::channel();
        let mut router = RpcRouter::new(100, 16);
        let mut writers = Vec::new();
        let mut readers = Vec::new();
        for id in ["a", "b"] {
            let (stream, reader) = UnixStream::pair().unwrap();
            reader
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            writers.push(ClientWriter::start(id.into(), stream, limits(), events.clone()).unwrap());
            readers.push(reader);
            router.add_client(id).unwrap();
        }
        let left = router
            .from_client("a", json!({"jsonrpc":"2.0","id":1,"method":"getInfo"}), 0)
            .unwrap();
        let right = router
            .from_client("b", json!({"jsonrpc":"2.0","id":1,"method":"getInfo"}), 0)
            .unwrap();
        for (request, index) in [(&right, 1), (&left, 0)] {
            let result = router
                .from_extension(
                    json!({"jsonrpc":"2.0","id":request[0].message["id"],"result":index}),
                    1,
                )
                .unwrap();
            assert_eq!(
                result[0].destination,
                Destination::Client(if index == 0 { "a" } else { "b" }.into())
            );
            writers[index].enqueue(&result[0].message).unwrap();
        }
        for (index, reader) in readers.iter_mut().enumerate() {
            assert_eq!(
                receive(reader, 1024).unwrap(),
                Some(json!({"jsonrpc":"2.0","id":1,"result":index}))
            );
        }
        let notification = json!({"jsonrpc":"2.0","method":"onCDPEvent"});
        for delivery in router.from_extension(notification.clone(), 2).unwrap() {
            let index = if delivery.destination == Destination::Client("a".into()) {
                0
            } else {
                1
            };
            writers[index].enqueue(&delivery.message).unwrap();
        }
        for reader in &mut readers {
            assert_eq!(receive(reader, 1024).unwrap(), Some(notification.clone()));
        }
        for writer in &mut writers {
            writer.disconnect();
        }
        let mut ids = vec![
            notices.recv_timeout(Duration::from_secs(1)).unwrap().client,
            notices.recv_timeout(Duration::from_secs(1)).unwrap().client,
        ];
        ids.sort();
        assert_eq!(ids, vec!["a", "b"]);
        assert_eq!(router.pending_counts(), (0, 0));
    }
    #[test]
    fn slow_client_budget_includes_inflight_frame_and_does_not_block_healthy_client() {
        let (events, notices) = mpsc::channel();
        let (blocked, _unread) = UnixStream::pair().unwrap();
        let mut slow = ClientWriter::start(
            "slow".into(),
            blocked,
            QueueLimits {
                max_messages: 1,
                max_bytes: 8 * 1024 * 1024,
                max_frame_bytes: 8 * 1024 * 1024,
            },
            events.clone(),
        )
        .unwrap();
        slow.enqueue(&json!({"data":"x".repeat(5*1024*1024)}))
            .unwrap();
        assert_eq!(
            slow.enqueue(&json!({"next":true})).unwrap_err().kind(),
            io::ErrorKind::WouldBlock
        );
        let event = notices.recv_timeout(Duration::from_secs(1)).unwrap();
        assert_eq!(event.client, "slow");
        assert_eq!(event.reason, DisconnectReason::QueueOverflow);
        slow.disconnect(); // Must wake/join an in-flight write without reading the peer.
        let (stream, mut reader) = UnixStream::pair().unwrap();
        reader
            .set_read_timeout(Some(Duration::from_secs(1)))
            .unwrap();
        let mut healthy = ClientWriter::start("healthy".into(), stream, limits(), events).unwrap();
        healthy.enqueue(&json!({"ok":true})).unwrap();
        assert_eq!(
            receive(&mut reader, 1024).unwrap(),
            Some(json!({"ok":true}))
        );
        healthy.disconnect();
        let event = notices.recv_timeout(Duration::from_secs(1)).unwrap();
        assert_eq!(event.client, "healthy");
        assert_eq!(event.reason, DisconnectReason::Explicit);
        assert!(notices.try_recv().is_err());
    }
    #[test]
    fn broken_peer_and_rejected_frame_emit_one_disconnect() {
        let (events, notices) = mpsc::channel();
        let (stream, peer) = UnixStream::pair().unwrap();
        drop(peer);
        let mut writer =
            ClientWriter::start("broken".into(), stream, limits(), events.clone()).unwrap();
        writer.enqueue(&json!({"value":1})).unwrap();
        assert_eq!(
            notices.recv_timeout(Duration::from_secs(1)).unwrap().reason,
            DisconnectReason::WriteFailed
        );
        writer.disconnect();
        assert!(notices.try_recv().is_err());
        let (stream, _peer) = UnixStream::pair().unwrap();
        let mut writer = ClientWriter::start("oversize".into(), stream, limits(), events).unwrap();
        assert!(writer.enqueue(&json!("x".repeat(1024))).is_err());
        assert_eq!(
            notices.recv_timeout(Duration::from_secs(1)).unwrap().reason,
            DisconnectReason::FrameRejected
        );
        writer.disconnect();
        assert!(notices.try_recv().is_err());
    }
    #[test]
    fn queue_bytes_are_bounded_independently_of_message_count() {
        let (events, notices) = mpsc::channel();
        let (stream, _peer) = UnixStream::pair().unwrap();
        let mut writer = ClientWriter::start(
            "byte-limit".into(),
            stream,
            QueueLimits {
                max_bytes: 8,
                ..limits()
            },
            events,
        )
        .unwrap();
        assert!(writer.enqueue(&json!({"larger":"than eight"})).is_err());
        assert_eq!(
            notices.recv_timeout(Duration::from_secs(1)).unwrap().reason,
            DisconnectReason::QueueOverflow
        );
        writer.disconnect();
    }
}
