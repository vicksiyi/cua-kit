use core_browser_extension_host::{
    app_server_configuration::{LaunchFields, LoadedLaunchConfiguration},
    app_server_manifest::{LoadedManifestEntry, RawManifestConfiguration, SelectedManifestEntry},
    app_server_runtime_state::ProxyRuntimeState,
};

#[test]
fn projection_uses_effective_launch_and_preserves_service_from_selection() {
    let mut config = LoadedLaunchConfiguration {
        launch: LaunchFields {
            codex_cli_path: Some("cli".into()),
            node_path: Some("node-custom".into()),
            browser_client_path: Some("client".into()),
            codex_home: Some("home".into()),
            node_repl_path: Some("repl".into()),
            ..Default::default()
        }
        .resolve(|_| None),
        selection: LoadedManifestEntry {
            registry_path: "unused".into(),
            selected: SelectedManifestEntry {
                index: 0,
                configuration: RawManifestConfiguration {
                    browser_service_path: Some("service".into()),
                    codex_cli_path: Some("raw-cli".into()),
                    ..Default::default()
                },
            },
        },
    };
    let snapshot = ProxyRuntimeState::from(&config);
    assert_eq!(snapshot.codex_cli_path, "cli");
    assert_eq!(snapshot.node_path, "node-custom");
    assert_eq!(snapshot.platform, "darwin");
    assert_eq!(snapshot.browser_service_path.as_deref(), Some("service"));
    assert_eq!(snapshot.browser_client_path.as_deref(), Some("client"));
    assert_eq!(snapshot.codex_home.as_deref(), Some("home"));
    assert_eq!(snapshot.node_repl_path.as_deref(), Some("repl"));
    config.launch = LaunchFields::default().resolve(|_| None);
    config.selection.selected.configuration.browser_service_path = None;
    let empty = ProxyRuntimeState::from(&config);
    assert!(
        empty.browser_service_path.is_none()
            && empty.browser_client_path.is_none()
            && empty.codex_home.is_none()
            && empty.node_repl_path.is_none()
    );
    assert_eq!(snapshot.codex_cli_path, "cli");
}

#[test]
fn cleanup_preserves_new_generation_runtime_configuration() {
    use core_browser_extension_host::app_server_output::{finish_output, OutputState};
    use std::sync::{Arc, Mutex};
    let state = Arc::new(Mutex::new(OutputState {
        generation: 7,
        runtime_state: Some(ProxyRuntimeState { codex_cli_path: "cli".into(), node_path: "node".into(), platform: "darwin".into(), browser_client_path: None, browser_service_path: None, codex_home: None, node_repl_path: None }),
        ..Default::default()
    }));
    finish_output(&state, 6);
    assert!(state.lock().unwrap().runtime_state.is_some());
    finish_output(&state, 7);
    assert!(state.lock().unwrap().runtime_state.is_none());
}
