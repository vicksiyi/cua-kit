use core_browser_extension_host::{
    app_server_configuration::{LaunchFields, LoadedLaunchConfiguration},
    app_server_error::RuntimeErrorKind,
    app_server_manifest::{LoadedManifestEntry, RawManifestConfiguration, SelectedManifestEntry},
    app_server_proxy::{bind_listener, prepare},
};
use std::net::TcpListener;
#[test]
fn occupied_port_falls_back_and_preparation_creates_native_token_and_origin() {
    let occupied = TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let port = occupied.local_addr().unwrap().port();
    let config = LoadedLaunchConfiguration {
        launch: LaunchFields {
            proxy_port: Some(port),
            extension_id: Some("fixture".into()),
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
    let prepared = prepare(&config).unwrap_or_else(|e| panic!("{}", e.message));
    assert_ne!(prepared.port, port);
    assert_ne!(prepared.port, 0);
    assert_eq!(
        prepared.port,
        prepared.listener.local_addr().unwrap().port()
    );
    assert_eq!(prepared.token.len(), 64);
    assert!(prepared
        .token
        .bytes()
        .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)));
    for part in [&prepared.token[..32], &prepared.token[32..]] {
        let id = uuid::Uuid::parse_str(part).unwrap();
        assert_eq!(id.get_version_num(), 4);
    }
    assert_eq!(
        prepared.origin.lock().unwrap().as_deref(),
        Some("chrome-extension://fixture")
    );
    assert!(prepared.processes.lock().unwrap().is_empty());
}
#[test]
fn bind_errors_use_native_runtime_category_and_distinguish_fallback() {
    // Numeric TEST-NET address cannot be bound locally; no DNS query is involved.
    for port in [0, 12345] {
        let error = bind_listener("192.0.2.1", port)
            .err()
            .expect("nonlocal bind must fail");
        assert_eq!(error.kind, RuntimeErrorKind::Runtime);
        let expected = if port == 0 {
            "Failed to bind Codex app-server proxy to 192.0.2.1:0:"
        } else {
            "Failed to bind Codex app-server proxy to 192.0.2.1:12345 or an available fallback port:"
        };
        assert!(error.message.starts_with(expected));
    }
}

#[test]
fn started_proxy_serves_rejections_and_handle_drop_does_not_stop_listener() {
    use std::{
        io::{Read, Write},
        net::TcpStream,
        time::Duration,
    };
    let config = LoadedLaunchConfiguration {
        launch: LaunchFields::default().resolve(|_| None),
        selection: LoadedManifestEntry {
            registry_path: "unused".into(),
            selected: SelectedManifestEntry {
                index: 0,
                configuration: RawManifestConfiguration::default(),
            },
        },
    };
    let proxy = prepare(&config)
        .unwrap_or_else(|e| panic!("{}", e.message))
        .start();
    let id = proxy.runtime_session_id.lock().unwrap().clone();
    let parsed = uuid::Uuid::parse_str(&id).unwrap();
    assert_eq!(parsed.get_version_num(), 4);
    assert_eq!(id.len(), 36);
    let port = proxy.port;
    for _ in 0..2 {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        stream
            .write_all(b"GET /?token=wrong HTTP/1.1\r\n\r\n")
            .unwrap();
        let mut response = String::new();
        stream.read_to_string(&mut response).unwrap();
        assert!(response.starts_with("HTTP/1.1 403 Forbidden"));
        assert!(proxy.processes.lock().unwrap().is_empty());
    }
    drop(proxy);
    let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
    stream
        .set_read_timeout(Some(Duration::from_secs(3)))
        .unwrap();
    stream.write_all(b"GET / HTTP/1.1\r\n\r\n").unwrap();
    let mut response = String::new();
    stream.read_to_string(&mut response).unwrap();
    assert!(response.starts_with("HTTP/1.1 403 Forbidden"));
    // The listener is owned by this isolated test executable and ends when it exits.
}

#[test]
fn shutdown_takes_proxy_drains_map_and_reaps_children_despite_one_poisoned_state() {
    use core_browser_extension_host::{
        app_server_output::OutputState, app_server_proxy::shutdown_proxy,
    };
    use std::{
        process::{Command, Stdio},
        sync::{Arc, Mutex},
    };
    let config = LoadedLaunchConfiguration {
        launch: LaunchFields::default().resolve(|_| None),
        selection: LoadedManifestEntry {
            registry_path: "unused".into(),
            selected: SelectedManifestEntry {
                index: 0,
                configuration: RawManifestConfiguration::default(),
            },
        },
    };
    let proxy = prepare(&config)
        .unwrap_or_else(|e| panic!("{}", e.message))
        .start();
    let map = proxy.processes.clone();
    let mut children = vec![];
    for key in ["one", "two"] {
        let mut child = Command::new("/bin/cat")
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .spawn()
            .unwrap();
        let stdin = child.stdin.take();
        let child = Arc::new(Mutex::new(child));
        children.push(child.clone());
        let state = OutputState {
            child: Some(child),
            stdin,
            ..Default::default()
        };
        map.lock()
            .unwrap()
            .insert(key.into(), Arc::new(Mutex::new(state)));
    }
    let poisoned = Arc::new(Mutex::new(OutputState::default()));
    let fixture = poisoned.clone();
    assert!(std::thread::spawn(move || {
        let _guard = fixture.lock().unwrap();
        panic!("poison fixture")
    })
    .join()
    .is_err());
    map.lock().unwrap().insert("poisoned".into(), poisoned);
    let mut slot = Some(proxy);
    shutdown_proxy(&mut slot);
    assert!(slot.is_none());
    assert!(map.lock().unwrap().is_empty());
    for child in children {
        assert!(child.lock().unwrap().try_wait().unwrap().is_some());
    }
    shutdown_proxy(&mut slot);
}

fn update_fixture() -> (
    LoadedLaunchConfiguration,
    core_browser_extension_host::app_server_proxy::AppServerProxy,
) {
    use std::sync::{Arc, Mutex};
    let config = LoadedLaunchConfiguration {
        launch: LaunchFields::default().resolve(|_| None),
        selection: LoadedManifestEntry {
            registry_path: "unused".into(),
            selected: SelectedManifestEntry {
                index: 0,
                configuration: RawManifestConfiguration::default(),
            },
        },
    };
    // No detached listener is necessary for this shared-state lifecycle fixture.
    let prepared = prepare(&config).unwrap_or_else(|e| panic!("{}", e.message));
    let proxy = core_browser_extension_host::app_server_proxy::AppServerProxy {
        port: prepared.port,
        token: prepared.token,
        origin: prepared.origin,
        runtime: prepared.runtime,
        processes: prepared.processes,
        runtime_session_id: Arc::new(Mutex::new("existing-session".into())),
    };
    (config, proxy)
}

#[test]
fn configuration_update_preserves_processes_identity_and_endpoint() {
    use core_browser_extension_host::{
        app_server_output::OutputState, app_server_runtime_state::ProxyRuntimeState,
    };
    use std::sync::{Arc, Mutex};
    let (mut config, proxy) = update_fixture();
    let process = Arc::new(Mutex::new(OutputState::default()));
    process.lock().unwrap().generation = 19;
    proxy
        .processes
        .lock()
        .unwrap()
        .insert("fixture".into(), process.clone());
    let endpoint = (proxy.port, proxy.token.clone());
    config.launch.extension_id = Some("new-id/".into());
    config.launch.codex_cli_path = "changed-cli".into();
    config.launch.proxy_port = 1;
    proxy.update_configuration(&config);
    assert_eq!(
        *proxy.runtime.lock().unwrap(),
        ProxyRuntimeState::from(&config)
    );
    assert_eq!(
        proxy.origin.lock().unwrap().as_deref(),
        Some("chrome-extension://new-id/")
    );
    assert_eq!((proxy.port, proxy.token.clone()), endpoint);
    assert_eq!(
        &*proxy.runtime_session_id.lock().unwrap(),
        "existing-session"
    );
    assert!(Arc::ptr_eq(
        &proxy.processes.lock().unwrap()["fixture"],
        &process
    ));
    assert_eq!(process.lock().unwrap().generation, 19);
    config.launch.extension_id = None;
    proxy.update_configuration(&config);
    assert_eq!(*proxy.origin.lock().unwrap(), None);
}

#[test]
fn poisoned_origin_update_panics_after_runtime_replacement_and_poisons_runtime() {
    use core_browser_extension_host::app_server_runtime_state::ProxyRuntimeState;
    use std::sync::Arc;
    let (mut config, proxy) = update_fixture();
    let origin = Arc::clone(&proxy.origin);
    assert!(std::thread::spawn(move || {
        let _guard = origin.lock().unwrap();
        panic!("fixture");
    })
    .join()
    .is_err());
    config.launch.codex_cli_path = "replacement-before-origin-failure".into();
    assert!(std::panic::catch_unwind(|| proxy.update_configuration(&config)).is_err());
    let runtime = proxy
        .runtime
        .lock()
        .expect_err("runtime guard must unwind while held")
        .into_inner();
    assert_eq!(*runtime, ProxyRuntimeState::from(&config));
}
