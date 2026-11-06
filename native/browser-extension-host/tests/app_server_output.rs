use core_browser_extension_host::app_server_output::{payload, OutputReplay, INITIALIZE_ID};
use serde_json::json;

#[test]
fn replay_distinguishes_presence_from_null_and_keeps_exact_wire_text() {
    let mut replay = OutputReplay::default();
    let response = format!(" {{\"id\":\"{INITIALIZE_ID}\",\"result\":null}} ");
    replay.observe_initialize(&response, 2, 1);
    assert!(replay.initialize_response.is_none());
    replay.observe_initialize(&response, 2, 2);
    assert_eq!(
        replay.initialize_response.as_deref(),
        Some(response.as_str())
    );
    for value in [
        json!({"id":INITIALIZE_ID,"error":{}}),
        json!({"id":INITIALIZE_ID,"result":{},"method":null}),
        json!({"id":"other","result":{}}),
    ] {
        replay.observe_initialize(&value.to_string(), 2, 2);
        assert_eq!(
            replay.initialize_response.as_deref(),
            Some(response.as_str())
        );
    }
    for id in [json!(null), json!(0), json!({}), json!([])] {
        assert!(replay.buffer_unattached(&json!({"method":"","id":id}).to_string(), 2, 2));
    }
    for line in [
        "bad json",
        "null",
        "[]",
        r#"{"method":"notification"}"#,
        r#"{"method":null,"id":1}"#,
    ] {
        assert!(!replay.buffer_unattached(line, 2, 2));
    }
    assert!(!replay.buffer_unattached(r#"{"method":"old","id":1}"#, 2, 1));
}

#[test]
fn replay_caps_at_128_without_eviction_and_line_trimming_is_only_cr_lf() {
    let mut replay = OutputReplay::default();
    for index in 0..130 {
        assert_eq!(
            replay.buffer_unattached(&json!({"method":"request","id":index}).to_string(), 3, 3),
            index < 128
        );
    }
    assert_eq!(replay.pending_requests.len(), 128);
    assert!(replay.pending_requests[0].contains("\"id\":0"));
    assert!(replay.pending_requests[127].contains("\"id\":127"));
    assert_eq!(payload(" \t\r\n\r\n"), Some(" \t"));
    assert_eq!(payload("\r\n\r"), None);
    assert_eq!(payload("{} \r\n"), Some("{} "));
}

#[test]
fn composed_delivery_uses_socket_then_buffers_only_after_disconnect() {
    use core_browser_extension_host::app_server_output::{
        deliver_line, detach_writer, Delivery, OutputState,
    };
    use std::{
        io::Read,
        net::{Shutdown, TcpListener, TcpStream},
        sync::{Arc, Mutex},
        time::Duration,
    };
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let writer = Arc::new(Mutex::new(
        TcpStream::connect(listener.local_addr().unwrap()).unwrap(),
    ));
    let (mut peer, _) = listener.accept().unwrap();
    peer.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
    let state = Arc::new(Mutex::new(OutputState {
        generation: 4,
        writer: Some(writer.clone()),
        ..Default::default()
    }));
    // Attached clients receive raw lines, including text that is not valid JSON.
    assert_eq!(deliver_line(&state, 4, "raw text\r\n"), Delivery::Sent);
    let mut frame = [0; 10];
    peer.read_exact(&mut frame).unwrap();
    assert_eq!(&frame, b"\x81\x08raw text");
    assert_eq!(
        deliver_line(&state, 3, r#"{"method":"old","id":0}"#),
        Delivery::Dropped
    );
    assert!(state.lock().unwrap().replay.pending_requests.is_empty());
    // Distinct Arc identity, even for a clone of the same underlying TCP socket.
    let other = Arc::new(Mutex::new(writer.lock().unwrap().try_clone().unwrap()));
    detach_writer(&state, &other);
    assert!(state.lock().unwrap().writer.is_some());
    writer.lock().unwrap().shutdown(Shutdown::Write).unwrap();
    let request = r#"{"method":"request","id":1}"#;
    assert_eq!(deliver_line(&state, 4, request), Delivery::WriteFailed);
    assert!(state.lock().unwrap().writer.is_none());
    assert!(state.lock().unwrap().replay.pending_requests.is_empty());
    assert_eq!(deliver_line(&state, 4, request), Delivery::Buffered);
    assert_eq!(state.lock().unwrap().replay.pending_requests, [request]);
}

#[test]
fn real_child_stdout_reaches_websocket_before_child_wait() {
    use core_browser_extension_host::{
        app_server_configuration::LaunchFields,
        app_server_output::{forward_lines, OutputState},
        app_server_process::{spawn, wait_child},
    };
    use std::{
        fs,
        io::{Read, Write},
        net::{TcpListener, TcpStream},
        os::unix::fs::PermissionsExt,
        sync::{Arc, Mutex},
        thread,
        time::Duration,
    };
    let root = std::env::temp_dir().join(format!("core-stdout-forward-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&root).unwrap();
    let executable = root.join("fake-codex");
    fs::write(&executable, b"#!/bin/sh\nexec /bin/cat\n").unwrap();
    fs::set_permissions(&executable, fs::Permissions::from_mode(0o700)).unwrap();
    let fields = LaunchFields {
        codex_cli_path: Some(executable.to_string_lossy().into()),
        ..Default::default()
    }
    .resolve(|_| None);
    let mut child = spawn(&fields).unwrap();
    let stdout = child.stdout.take().unwrap();
    let mut input = child.stdin.take().unwrap();
    let child = Arc::new(Mutex::new(child));
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let writer = Arc::new(Mutex::new(
        TcpStream::connect(listener.local_addr().unwrap()).unwrap(),
    ));
    let (mut peer, _) = listener.accept().unwrap();
    peer.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
    let state = Arc::new(Mutex::new(OutputState {
        generation: 1,
        writer: Some(writer),
        ..Default::default()
    }));
    let worker = thread::spawn(move || {
        forward_lines(stdout, &state, 1, |_| {}).unwrap();
        wait_child(child).unwrap();
    });
    input.write_all(b"\r\n{\"result\":1}\r\nfinal").unwrap();
    drop(input);
    for expected in [b"{\"result\":1}".as_slice(), b"final".as_slice()] {
        let mut header = [0; 2];
        peer.read_exact(&mut header).unwrap();
        assert_eq!(header, [0x81, expected.len() as u8]);
        let mut data = vec![0; expected.len()];
        peer.read_exact(&mut data).unwrap();
        assert_eq!(data, expected);
    }
    worker.join().unwrap();
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn reader_stops_at_invalid_utf8_and_preserves_prior_delivery() {
    use core_browser_extension_host::app_server_output::{forward_lines, Delivery, OutputState};
    use std::sync::{Arc, Mutex};
    let state = Arc::new(Mutex::new(OutputState::default()));
    let mut deliveries = Vec::new();
    let input = b"{\"method\":\"a\",\"id\":1}\n\xff\n{\"method\":\"b\",\"id\":2}\n";
    let error = forward_lines(&input[..], &state, 0, |d| deliveries.push(d)).unwrap_err();
    assert_eq!(error.kind(), std::io::ErrorKind::InvalidData);
    assert_eq!(deliveries, [Delivery::Buffered]);
    assert_eq!(state.lock().unwrap().replay.pending_requests.len(), 1);
}

#[test]
fn eof_cleanup_is_generation_guarded_and_closes_owned_resources() {
    use core_browser_extension_host::{
        app_server_output::{finish_output, forward_and_finish, OutputState},
        app_server_process::wait_child,
    };
    use std::{
        io::Read,
        net::{TcpListener, TcpStream},
        process::{Command, Stdio},
        sync::{Arc, Mutex},
        time::Duration,
    };
    let mut child = Command::new("/bin/cat")
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .spawn()
        .unwrap();
    let input = child.stdin.take().unwrap();
    let child = Arc::new(Mutex::new(child));
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let writer = Arc::new(Mutex::new(
        TcpStream::connect(listener.local_addr().unwrap()).unwrap(),
    ));
    let (mut peer, _) = listener.accept().unwrap();
    peer.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
    let state = Arc::new(Mutex::new(OutputState {
        generation: 5,
        writer: Some(writer),
        child: Some(child.clone()),
        stdin: Some(input),
        replay: OutputReplay {
            initialize_response: Some("init".into()),
            pending_requests: vec!["pending".into()],
        },
    }));
    finish_output(&state, 4);
    {
        let s = state.lock().unwrap();
        assert!(s.child.is_some() && s.stdin.is_some() && s.writer.is_some());
        assert_eq!(s.replay.pending_requests.len(), 1);
    }
    let error = forward_and_finish(&b"\xff"[..], &state, 5, |_| {}).unwrap_err();
    assert_eq!(error.kind(), std::io::ErrorKind::InvalidData);
    {
        let s = state.lock().unwrap();
        assert!(s.child.is_none() && s.stdin.is_none() && s.writer.is_none());
        assert!(s.replay.pending_requests.is_empty());
        assert!(s.replay.initialize_response.is_none());
        assert_eq!(s.generation, 5);
    }
    let mut frame = [0; 2];
    peer.read_exact(&mut frame).unwrap();
    assert_eq!(frame, [0x88, 0]);
    assert_eq!(peer.read(&mut [0]).unwrap(), 0);
    wait_child(child).unwrap(); // stdin closure lets cat exit naturally
    finish_output(&state, 5); // already cleared is harmless
}
