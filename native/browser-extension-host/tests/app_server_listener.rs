use core_browser_extension_host::{
    app_server_listener::dispatch_incoming, app_server_runtime_state::ProxyRuntimeState,
};
use std::{
    io::{self, Read, Write},
    net::{Shutdown, TcpListener, TcpStream},
    sync::{Arc, Mutex},
    time::Duration,
};
fn pair() -> (TcpStream, TcpStream) {
    let l = TcpListener::bind("127.0.0.1:0").unwrap();
    let c = TcpStream::connect(l.local_addr().unwrap()).unwrap();
    let (s, _) = l.accept().unwrap();
    c.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
    s.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
    (s, c)
}
#[test]
fn ignored_accept_error_and_slow_client_do_not_block_next_connection() {
    let runtime = Arc::new(Mutex::new(ProxyRuntimeState {
        codex_cli_path: "/nonexistent/listener-test".into(),
        node_path: "node".into(),
        platform: "darwin".into(),
        browser_client_path: None,
        browser_service_path: None,
        codex_home: None,
        node_repl_path: None,
    }));
    let processes = Arc::new(Mutex::new(Default::default()));
    let origin = Arc::new(Mutex::new(Some("chrome-extension://fixture".into())));
    let (slow_server, mut slow_client) = pair();
    let (fast_server, mut fast_client) = pair();
    dispatch_incoming(
        vec![
            Err(io::Error::other("accept fixture")),
            Ok(slow_server),
            Ok(fast_server),
        ],
        runtime,
        "fixture".into(),
        origin,
        processes.clone(),
    );
    // The first connection is deliberately left idle while the second completes.
    fast_client
        .write_all(b"GET /?token=fixture HTTP/1.1\r\n\r\n")
        .unwrap();
    let mut response = String::new();
    fast_client.read_to_string(&mut response).unwrap();
    assert!(response.starts_with("HTTP/1.1 403 Forbidden\r\n"));
    assert!(processes.lock().unwrap().is_empty());
    slow_client.shutdown(Shutdown::Write).unwrap();
    let mut remainder = vec![];
    slow_client.read_to_end(&mut remainder).unwrap();
    assert!(remainder.is_empty());
}
