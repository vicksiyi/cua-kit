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
        host: prepared.host,
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

#[test]
fn restart_stops_only_trimmed_client_retains_map_and_rotates_session() {
    use core_browser_extension_host::app_server_output::{stop_process, OutputState};
    use std::{
        process::{Command, Stdio},
        sync::{Arc, Mutex},
    };
    let (_, proxy) = update_fixture();
    let mut children = vec![];
    for client in ["chosen", "other"] {
        let mut child = Command::new("/bin/cat")
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .spawn()
            .unwrap();
        let stdin = child.stdin.take();
        let child = Arc::new(Mutex::new(child));
        children.push(child.clone());
        proxy.processes.lock().unwrap().insert(
            client.into(),
            Arc::new(Mutex::new(OutputState {
                child: Some(child),
                stdin,
                ..Default::default()
            })),
        );
    }
    let selected = proxy.processes.lock().unwrap()["chosen"].clone();
    proxy
        .restart_client(Some(&serde_json::json!({"clientId":" \u{2003}chosen\t"})))
        .unwrap_or_else(|e| panic!("{}", e.message));
    assert!(children[0].lock().unwrap().try_wait().unwrap().is_some());
    assert!(children[1].lock().unwrap().try_wait().unwrap().is_none());
    assert!(Arc::ptr_eq(
        &selected,
        &proxy.processes.lock().unwrap()["chosen"]
    ));
    assert_eq!(selected.lock().unwrap().generation, 1);
    let session = proxy.runtime_session_id.lock().unwrap().clone();
    assert_eq!(
        uuid::Uuid::parse_str(&session).unwrap().get_version_num(),
        4
    );
    assert_ne!(session, "existing-session");
    assert_eq!(proxy.processes.lock().unwrap().len(), 2);
    stop_process(&proxy.processes.lock().unwrap()["other"]).unwrap();
}

#[test]
fn absent_client_rotates_session_and_invalid_client_values_select_default() {
    use core_browser_extension_host::app_server_output::OutputState;
    use std::sync::{Arc, Mutex};
    let (_, proxy) = update_fixture();
    let state = Arc::new(Mutex::new(OutputState::default()));
    proxy
        .processes
        .lock()
        .unwrap()
        .insert("default".into(), state.clone());
    let inputs = [
        serde_json::Value::Null,
        serde_json::json!({}),
        serde_json::json!({"clientId":12}),
        serde_json::json!({"clientId":" \t"}),
    ];
    for (index, input) in inputs.iter().enumerate() {
        proxy
            .restart_client(Some(input))
            .unwrap_or_else(|e| panic!("{}", e.message));
        assert_eq!(state.lock().unwrap().generation, (index + 1) as u64);
    }
    let old = proxy.runtime_session_id.lock().unwrap().clone();
    proxy
        .restart_client(Some(&serde_json::json!({"clientId":"missing"})))
        .unwrap_or_else(|e| panic!("{}", e.message));
    assert_ne!(*proxy.runtime_session_id.lock().unwrap(), old);
    assert_eq!(proxy.processes.lock().unwrap().len(), 1);
}

#[test]
fn failed_restart_does_not_rotate_session_and_session_failure_follows_stop() {
    use core_browser_extension_host::app_server_output::OutputState;
    use std::sync::{Arc, Mutex};
    let (_, proxy) = update_fixture();
    let process = Arc::new(Mutex::new(OutputState::default()));
    proxy
        .processes
        .lock()
        .unwrap()
        .insert("bad".into(), process.clone());
    assert!(std::thread::spawn(move || {
        let _guard = process.lock().unwrap();
        panic!("fixture");
    })
    .join()
    .is_err());
    let error = proxy
        .restart_client(Some(&serde_json::json!({"clientId":"bad"})))
        .err()
        .unwrap();
    assert_eq!(error.message, "Failed to restart Codex app-server for client bad: app-server process state mutex poisoned");
    assert_eq!(
        *proxy.runtime_session_id.lock().unwrap(),
        "existing-session"
    );
    let good = Arc::new(Mutex::new(OutputState::default()));
    proxy
        .processes
        .lock()
        .unwrap()
        .insert("default".into(), good.clone());
    let id = proxy.runtime_session_id.clone();
    assert!(std::thread::spawn(move || {
        let _guard = id.lock().unwrap();
        panic!("fixture");
    })
    .join()
    .is_err());
    let error = proxy.restart_client(None).err().unwrap();
    assert_eq!(error.message, "runtime session id mutex poisoned");
    assert_eq!(good.lock().unwrap().generation, 1);
}

#[test]
fn poisoned_restart_map_returns_client_error_before_session_rotation() {
    let (_, proxy) = update_fixture();
    let map = proxy.processes.clone();
    assert!(std::thread::spawn(move || {
        let _guard = map.lock().unwrap();
        panic!("fixture");
    })
    .join()
    .is_err());
    let error = proxy.restart_client(None).err().unwrap();
    assert_eq!(error.message, "Failed to restart Codex app-server for client default: app-server process map mutex poisoned");
    assert_eq!(error.kind, RuntimeErrorKind::Runtime);
    assert_eq!(
        *proxy.runtime_session_id.lock().unwrap(),
        "existing-session"
    );
}

#[test]
fn endpoint_uses_bound_host_and_port_after_config_refresh() {
    let (mut config, mut proxy) = update_fixture();
    proxy.host = "original.example".into();
    proxy.port = 45678;
    proxy.token = "fixture-token".into();
    config.launch.proxy_host = "changed.example".into();
    config.launch.proxy_port = 123;
    proxy.update_configuration(&config);
    assert_eq!(
        proxy.local_app_server_url(),
        "ws://original.example:45678?token=fixture-token"
    );
    assert_eq!(proxy.runtime_session_id(), "existing-session");
    // The formatter preserves host text, including brackets provided by caller.
    proxy.host = "[::1]".into();
    assert_eq!(
        proxy.local_app_server_url(),
        "ws://[::1]:45678?token=fixture-token"
    );
}

#[test]
fn session_accessor_clones_empty_string_and_panics_on_poison() {
    let (_, proxy) = update_fixture();
    proxy.runtime_session_id.lock().unwrap().clear();
    assert_eq!(proxy.runtime_session_id(), "");
    let session = proxy.runtime_session_id.clone();
    assert!(std::thread::spawn(move || {
        let _guard = session.lock().unwrap();
        panic!("fixture");
    })
    .join()
    .is_err());
    let error = std::panic::catch_unwind(|| proxy.runtime_session_id()).unwrap_err();
    let message = error.downcast_ref::<String>().unwrap();
    assert!(message.starts_with("app-server proxy runtime session id mutex poisoned"));
}

#[test]
fn live_proxy_status_tracks_restart_and_shutdown_without_child_health_checks() {
    use core_browser_extension_host::{
        app_server_proxy::shutdown_proxy, app_server_status::from_proxy,
    };
    let (_, proxy) = update_fixture();
    let mut slot = Some(proxy);
    assert_eq!(
        from_proxy(slot.as_ref()),
        serde_json::json!({"phase":"connected","runtimeSessionId":"existing-session"})
    );
    slot.as_ref()
        .unwrap()
        .restart_client(None)
        .unwrap_or_else(|e| panic!("{}", e.message));
    let snapshot = from_proxy(slot.as_ref());
    assert_eq!(snapshot["phase"], "connected");
    assert_ne!(snapshot["runtimeSessionId"], "existing-session");
    assert!(slot.as_ref().unwrap().processes.lock().unwrap().is_empty());
    shutdown_proxy(&mut slot);
    assert_eq!(
        from_proxy(slot.as_ref()),
        serde_json::json!({"phase":"idle"})
    );
}

#[test]
fn ensure_payload_composes_exact_shape_without_launching_a_child() {
    use core_browser_extension_host::app_server_response::{
        ensure_response, SelectedRuntimeMetadata,
    };
    let (config, mut proxy) = update_fixture();
    proxy.host = "fixture.local".into();
    proxy.port = 12345;
    proxy.token = "fixture-token".into();
    let metadata = SelectedRuntimeMetadata {
        entry_id: "entry-1",
        app_server_protocol_version: u64::MAX,
        app_version: "v1",
        channel: "beta",
        cli_version: "cli-v2",
        native_host_protocol_version: 0,
        native_host_version: "host-v3",
    };
    let response = ensure_response(&proxy, &metadata);
    assert_eq!(
        response,
        serde_json::json!({
            "entryId":"entry-1", "localAppServerUrl":"ws://fixture.local:12345?token=fixture-token",
            "runtimeSessionId":"existing-session", "selected":{
                "appServerProtocolVersion":u64::MAX,"appVersion":"v1","channel":"beta",
                "cliVersion":"cli-v2","nativeHostProtocolVersion":0,"nativeHostVersion":"host-v3"
            },
            "runtimeConfig":{
                "browserClientPath":null,"browserServicePath":null,
                "codexCliPath":config.launch.codex_cli_path,"desktopAgentModeDefaults":null,
                "nodePath":config.launch.node_path,"nodeReplPath":null,"platform":"darwin"
            }
        })
    );
    assert!(proxy.processes.lock().unwrap().is_empty());
    proxy
        .restart_client(None)
        .unwrap_or_else(|e| panic!("{}", e.message));
    assert_ne!(
        ensure_response(&proxy, &metadata)["runtimeSessionId"],
        response["runtimeSessionId"]
    );
}

#[test]
fn ensure_loaded_initializes_once_refreshes_metadata_and_restarts_lazily() {
    use core_browser_extension_host::app_server_response::ensure_loaded;
    let (mut config, _) = update_fixture();
    let mut slot = None;
    let first =
        ensure_loaded(&mut slot, &config, None, false).unwrap_or_else(|e| panic!("{}", e.message));
    assert_eq!(first["entryId"], "env");
    assert_eq!(
        first["selected"],
        serde_json::json!({
            "appServerProtocolVersion":2,"appVersion":"0.0.0","channel":"unknown",
            "cliVersion":"0.0.0","nativeHostProtocolVersion":2,"nativeHostVersion":"0.0.0"
        })
    );
    config.launch.proxy_host = "unusable-rebind-host.invalid".into();
    config.launch.proxy_port = 1;
    config.launch.codex_cli_path = "new-cli".into();
    let raw = &mut config.selection.selected.configuration;
    raw.entry_id = Some("chosen".into());
    raw.app_version = Some("9.0".into());
    raw.channel = Some("".into());
    raw.cli_version = Some("cli-version".into());
    raw.native_host_version = Some("host-version".into());
    raw.app_server_protocol_version = Some(0);
    raw.native_host_protocol_version = Some(u64::MAX);
    let second =
        ensure_loaded(&mut slot, &config, None, false).unwrap_or_else(|e| panic!("{}", e.message));
    assert_eq!(first["localAppServerUrl"], second["localAppServerUrl"]);
    assert_eq!(first["runtimeSessionId"], second["runtimeSessionId"]);
    assert_eq!(second["entryId"], "chosen");
    assert_eq!(second["runtimeConfig"]["codexCliPath"], "new-cli");
    assert_eq!(
        second["selected"],
        serde_json::json!({
            "appServerProtocolVersion":0,"appVersion":"9.0","channel":"",
            "cliVersion":"cli-version","nativeHostProtocolVersion":u64::MAX,"nativeHostVersion":"host-version"
        })
    );
    let third =
        ensure_loaded(&mut slot, &config, None, true).unwrap_or_else(|e| panic!("{}", e.message));
    assert_eq!(third["localAppServerUrl"], first["localAppServerUrl"]);
    assert_ne!(third["runtimeSessionId"], second["runtimeSessionId"]);
    assert!(slot.as_ref().unwrap().processes.lock().unwrap().is_empty());
    core_browser_extension_host::app_server_proxy::shutdown_proxy(&mut slot);
}

#[test]
fn ensure_loaded_failures_preserve_native_partial_state() {
    use core_browser_extension_host::app_server_response::ensure_loaded;
    let (mut config, proxy) = update_fixture();
    let mut empty = None;
    config.launch.proxy_host = "192.0.2.1".into();
    assert!(ensure_loaded(&mut empty, &config, None, false).is_err());
    assert!(empty.is_none());
    let map = proxy.processes.clone();
    assert!(std::thread::spawn(move || {
        let _guard = map.lock().unwrap();
        panic!("fixture");
    })
    .join()
    .is_err());
    let mut slot = Some(proxy);
    config.launch.codex_cli_path = "updated-before-restart-error".into();
    let error = ensure_loaded(&mut slot, &config, None, true).err().unwrap();
    assert!(error
        .message
        .starts_with("Failed to restart Codex app-server for client default:"));
    assert_eq!(
        slot.as_ref().unwrap().runtime_config()["codexCliPath"],
        "updated-before-restart-error"
    );
    assert_eq!(
        slot.as_ref().unwrap().runtime_session_id(),
        "existing-session"
    );
}
