use core_browser_extension_host::{
    app_server_configuration::{LaunchFields, LoadedLaunchConfiguration},
    app_server_manifest::{LoadedManifestEntry, RawManifestConfiguration, SelectedManifestEntry},
    app_server_output::{stop_process, OutputState},
    app_server_process_map::{handle_connection, ProcessMap},
    app_server_session::attach_and_replay,
};
use std::{
    io::{Read, Write},
    net::{Shutdown, TcpListener, TcpStream},
    sync::{Arc, Mutex},
    time::Duration,
};
fn pair() -> (TcpStream, TcpStream) {
    let l = TcpListener::bind("127.0.0.1:0").unwrap();
    let client = TcpStream::connect(l.local_addr().unwrap()).unwrap();
    let (server, _) = l.accept().unwrap();
    for stream in [&client, &server] {
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        stream
            .set_write_timeout(Some(Duration::from_secs(5)))
            .unwrap();
    }
    (server, client)
}
#[test]
fn attach_replaces_closes_and_drains_without_replaying_initialize() {
    let (old, mut old_peer) = pair();
    let old = Arc::new(Mutex::new(old));
    let (new, mut peer) = pair();
    let new = Arc::new(Mutex::new(new));
    let state = Arc::new(Mutex::new(OutputState::default()));
    {
        let mut s = state.lock().unwrap();
        s.writer = Some(old);
        s.replay.pending_requests = vec!["one".into(), "two".into()];
        s.replay.initialize_response = Some("cache".into());
    }
    attach_and_replay(&state, &new).unwrap();
    let mut closed = vec![];
    old_peer.read_to_end(&mut closed).unwrap();
    assert_eq!(closed, [0x88, 0]);
    let mut actual = [0; 10];
    peer.read_exact(&mut actual).unwrap();
    assert_eq!(&actual, b"\x81\x03one\x81\x03two");
    {
        let s = state.lock().unwrap();
        assert!(s.replay.pending_requests.is_empty());
        assert_eq!(s.replay.initialize_response.as_deref(), Some("cache"));
    }
    new.lock().unwrap().shutdown(Shutdown::Both).unwrap();
    state.lock().unwrap().replay.pending_requests =
        vec!["discarded".into(), "also discarded".into()];
    // Even a failed replay leaves the newly stored writer and drops the queue.
    assert!(attach_and_replay(&state, &new).is_err());
    let s = state.lock().unwrap();
    assert!(s.replay.pending_requests.is_empty());
    assert!(Arc::ptr_eq(s.writer.as_ref().unwrap(), &new));
}
#[test]
fn authenticated_tcp_session_upgrades_forwards_and_detaches_live_process() {
    use std::{fs, os::unix::fs::PermissionsExt};
    let root = std::env::temp_dir().join(format!("core-session-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&root).unwrap();
    let cli = root.join("cli");
    fs::write(&cli, b"#!/bin/sh\nexec /bin/cat\n").unwrap();
    fs::set_permissions(&cli, fs::Permissions::from_mode(0o700)).unwrap();
    let config = LoadedLaunchConfiguration {
        launch: LaunchFields {
            codex_cli_path: Some(cli.to_string_lossy().into()),
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
    };
    let processes: ProcessMap = Arc::new(Mutex::new(Default::default()));
    let (server, mut client) = pair();
    let worker_processes = processes.clone();
    let worker = std::thread::spawn(move || {
        handle_connection(server, &worker_processes, &config, "fixture", None).unwrap();
    });
    // Coalesced HTTP and masked first frame exercises preserved handshake bytes.
    client.write_all(b"GET /?token=fixture HTTP/1.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n\x81\x85\0\0\0\0hello").unwrap();
    let mut response = vec![];
    while !response.ends_with(b"\r\n\r\n") {
        let mut b = [0];
        client.read_exact(&mut b).unwrap();
        response.push(b[0]);
    }
    assert!(response.starts_with(b"HTTP/1.1 101 Switching Protocols\r\n"));
    let mut echo = [0; 7];
    client.read_exact(&mut echo).unwrap();
    assert_eq!(&echo, b"\x81\x05hello");
    client.write_all(b"\x88\x80\0\0\0\0").unwrap();
    let mut close = [0; 2];
    client.read_exact(&mut close).unwrap();
    assert_eq!(close, [0x88, 0]);
    worker.join().unwrap();
    let state = processes.lock().unwrap().get("default").unwrap().clone();
    {
        let s = state.lock().unwrap();
        assert!(s.writer.is_none());
        assert!(s.stdin.is_some());
        assert!(s.child.is_some());
    }
    stop_process(&state).unwrap();
    fs::remove_dir_all(root).unwrap();
}
