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
        runtime_state: Some(ProxyRuntimeState {
            codex_cli_path: "cli".into(),
            node_path: "node".into(),
            platform: "darwin".into(),
            browser_client_path: None,
            browser_service_path: None,
            codex_home: None,
            node_repl_path: None,
        }),
        ..Default::default()
    }));
    finish_output(&state, 6);
    assert!(state.lock().unwrap().runtime_state.is_some());
    finish_output(&state, 7);
    assert!(state.lock().unwrap().runtime_state.is_none());
}

#[test]
fn reuse_requires_stdin_and_exact_runtime_fields_not_child_or_writer() {
    use core_browser_extension_host::app_server_output::OutputState;
    use std::process::{Command, Stdio};
    let base = ProxyRuntimeState {
        codex_cli_path: "cli".into(),
        node_path: "node".into(),
        platform: "darwin".into(),
        browser_client_path: Some("client".into()),
        browser_service_path: Some("service".into()),
        codex_home: Some("home".into()),
        node_repl_path: Some("repl".into()),
    };
    let mut child = Command::new("/bin/cat")
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .spawn()
        .unwrap();
    let mut state = OutputState {
        runtime_state: Some(base.clone()),
        ..Default::default()
    };
    assert!(!state.can_reuse(&base));
    state.stdin = child.stdin.take();
    assert!(state.can_reuse(&base)); // no child handle or websocket in state
    for field in 0..7 {
        let mut changed = base.clone();
        match field {
            0 => changed.codex_cli_path.push(' '),
            1 => changed.node_path = "./node".into(),
            2 => changed.platform = "linux".into(),
            3 => changed.browser_client_path = None,
            4 => changed.browser_service_path = None,
            5 => changed.codex_home = Some("./home".into()),
            _ => changed.node_repl_path = None,
        }
        assert!(!state.can_reuse(&changed), "field {field}");
    }
    state.runtime_state = None;
    assert!(!state.can_reuse(&base));
    drop(state); // close retained stdin before wait
    assert!(child.wait().unwrap().success());
}

#[test]
fn runtime_response_preserves_raw_paths_and_explicit_nulls_without_extra_fields() {
    let state = ProxyRuntimeState {
        codex_cli_path: "relative/../cli".into(),
        node_path: "node".into(),
        platform: "darwin".into(),
        browser_client_path: Some("".into()),
        browser_service_path: None,
        codex_home: None,
        node_repl_path: Some("./repl".into()),
    };
    assert_eq!(
        state.response_value(),
        serde_json::json!({
            "browserClientPath":"", "browserServicePath":null,
            "codexCliPath":"relative/../cli", "desktopAgentModeDefaults":null,
            "nodePath":"node", "nodeReplPath":"./repl", "platform":"darwin"
        })
    );
}

#[test]
fn persisted_defaults_use_only_two_maps_and_reread_file() {
    use core_browser_extension_host::app_server_runtime_state::desktop_agent_mode_defaults;
    use serde_json::json;
    let root = std::env::temp_dir().join(format!("core-defaults-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&root).unwrap();
    let path = root.join(".codex-global-state.json");
    let home = root.to_str().unwrap();
    let empty = json!({"agentModesByHostId":{},"preferredNonFullAccessModesByHostId":{}});
    assert_eq!(desktop_agent_mode_defaults(None), serde_json::Value::Null);
    assert_eq!(desktop_agent_mode_defaults(Some(home)), empty);
    for data in [
        b"bad".as_slice(),
        b"null",
        b"{}",
        b"{\"electron-persisted-atom-state\":[]}",
        &[0xff],
    ] {
        std::fs::write(&path, data).unwrap();
        assert_eq!(desktop_agent_mode_defaults(Some(home)), empty);
    }
    std::fs::write(
        &path,
        json!({"unrelated":"not returned", "electron-persisted-atom-state":{
            "agent-mode-by-host-id":{"host":null,"arbitrary":[1,{"x":true}]},
            "preferred-non-full-access-agent-mode-by-host-id":{"h":"read-only"},
            "extra":"not returned"
        }})
        .to_string(),
    )
    .unwrap();
    assert_eq!(
        desktop_agent_mode_defaults(Some(home)),
        json!({
            "agentModesByHostId":{"host":null,"arbitrary":[1,{"x":true}]},
            "preferredNonFullAccessModesByHostId":{"h":"read-only"}
        })
    );
    std::fs::write(
        &path,
        json!({"electron-persisted-atom-state":{
            "agent-mode-by-host-id":false,
            "preferred-non-full-access-agent-mode-by-host-id":{"new":12}
        }})
        .to_string(),
    )
    .unwrap();
    assert_eq!(
        desktop_agent_mode_defaults(Some(home)),
        json!({
            "agentModesByHostId":{},"preferredNonFullAccessModesByHostId":{"new":12}
        })
    );
    std::fs::remove_dir_all(root).unwrap();
}
