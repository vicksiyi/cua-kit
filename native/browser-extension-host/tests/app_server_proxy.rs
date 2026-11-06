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
