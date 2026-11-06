use core_browser_extension_host::{
    app_server_configuration::{LaunchFields, LoadedLaunchConfiguration},
    app_server_input::forward_frames,
    app_server_manifest::{LoadedManifestEntry, RawManifestConfiguration, SelectedManifestEntry},
    app_server_output::{OutputState, INITIALIZE_ID},
};
use std::{
    io::{Cursor, Read},
    net::{TcpListener, TcpStream},
    sync::{Arc, Mutex},
    time::Duration,
};
fn config() -> LoadedLaunchConfiguration {
    LoadedLaunchConfiguration {
        launch: LaunchFields {
            codex_cli_path: Some("/nonexistent/core-cua-input-test".into()),
            ..Default::default()
        }
        .resolve(|_| None),
        selection: LoadedManifestEntry {
            registry_path: "unused".into(),
            selected: SelectedManifestEntry {
                index: 0,
                configuration: RawManifestConfiguration::default(),
            },
        },
    }
}
fn frame(op: u8, payload: &[u8]) -> Vec<u8> {
    assert!(payload.len() < 126);
    let mut bytes = vec![op, 0x80 | payload.len() as u8, 0, 0, 0, 0];
    bytes.extend_from_slice(payload);
    bytes
}
#[test]
fn cached_initialize_ping_pong_close_do_not_start_process() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let writer = Arc::new(Mutex::new(
        TcpStream::connect(listener.local_addr().unwrap()).unwrap(),
    ));
    let (mut receiver, _) = listener.accept().unwrap();
    receiver
        .set_read_timeout(Some(Duration::from_secs(3)))
        .unwrap();
    let state = Arc::new(Mutex::new(OutputState::default()));
    state.lock().unwrap().replay.initialize_response = Some("cached".into());
    let request = format!(r#"{{"id":"{INITIALIZE_ID}","method":"initialize"}}"#);
    let bytes = [
        frame(0, request.as_bytes()),
        frame(9, b"ping"),
        frame(10, b"ignored"),
        frame(8, b"bye"),
    ]
    .concat();
    forward_frames(Cursor::new(bytes), &state, &config(), &writer).unwrap();
    let expected = [
        vec![0x81, 6],
        b"cached".to_vec(),
        vec![0x8a, 4],
        b"ping".to_vec(),
        vec![0x88, 3],
        b"bye".to_vec(),
    ]
    .concat();
    let mut actual = vec![0; expected.len()];
    receiver.read_exact(&mut actual).unwrap();
    assert_eq!(actual, expected);
    assert!(state.lock().unwrap().child.is_none());
    // Input EOF/truncated payload is a successful detach, not a process stop.
    forward_frames(Cursor::new([0x81]), &state, &config(), &writer).unwrap();
    let error = forward_frames(Cursor::new(frame(3, b"")), &state, &config(), &writer).unwrap_err();
    assert_eq!(error.to_string(), "unsupported WebSocket opcode 3");
    // A different method with the special ID must still reach ensure_started.
    let request = format!(r#"{{"id":"{INITIALIZE_ID}","method":"other"}}"#);
    assert!(forward_frames(
        Cursor::new(frame(1, request.as_bytes())),
        &state,
        &config(),
        &writer
    )
    .unwrap_err()
    .to_string()
    .starts_with("Failed to start Codex app-server"));
}

#[test]
fn data_frames_reach_owned_child_stdin_and_write_failure_clears_input() {
    use core_browser_extension_host::app_server_runtime_state::ProxyRuntimeState;
    use std::process::{Command, Stdio};
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let writer = Arc::new(Mutex::new(
        TcpStream::connect(listener.local_addr().unwrap()).unwrap(),
    ));
    let (_receiver, _) = listener.accept().unwrap();
    let config = config();
    let state = Arc::new(Mutex::new(OutputState::default()));
    let mut child = Command::new("/bin/cat")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    {
        let mut state = state.lock().unwrap();
        state.stdin = child.stdin.take();
        state.runtime_state = Some(ProxyRuntimeState::from(&config));
    }
    let bytes = [
        frame(0, b"not JSON"),
        frame(2, &[0xff, 0]),
        frame(1, b"already newline\n"),
    ]
    .concat();
    forward_frames(Cursor::new(bytes), &state, &config, &writer).unwrap();
    state.lock().unwrap().stdin = None;
    let output = child.wait_with_output().unwrap();
    assert_eq!(output.stdout, b"not JSON\n\xff\0\nalready newline\n\n");

    let mut dead = Command::new("/usr/bin/true")
        .stdin(Stdio::piped())
        .spawn()
        .unwrap();
    let stdin = dead.stdin.take().unwrap();
    dead.wait().unwrap();
    state.lock().unwrap().stdin = Some(stdin);
    let error =
        forward_frames(Cursor::new(frame(1, b"broken")), &state, &config, &writer).unwrap_err();
    assert_eq!(error.kind(), std::io::ErrorKind::BrokenPipe);
    let state = state.lock().unwrap();
    assert!(state.stdin.is_none());
    assert!(state.runtime_state.is_some());
}
