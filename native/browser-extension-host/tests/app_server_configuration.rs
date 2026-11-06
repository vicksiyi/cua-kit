use core_browser_extension_host::app_server_configuration::LaunchFields;
use std::{collections::BTreeMap, ffi::OsString, os::unix::ffi::OsStringExt};

#[test]
fn native_env_normalization_precedence_and_absent_defaults() {
    let defaults = LaunchFields::default().resolve(|_| None);
    assert_eq!(defaults.codex_cli_path, "codex");
    assert_eq!(defaults.node_path, "node");
    assert_eq!(defaults.proxy_host, "127.0.0.1");
    assert_eq!(defaults.proxy_port, 0);
    assert!(defaults.node_repl_path.is_none());
    let config = LaunchFields {
        codex_cli_path: Some(" /config/codex ".into()),
        extension_id: Some("config-id".into()),
        node_path: Some("/config/node".into()),
        browser_client_path: Some("/config/client".into()),
        codex_home: Some("/config/home".into()),
        node_repl_path: Some("/config/repl".into()),
        proxy_host: Some("config-host".into()),
        proxy_port: Some(1234),
    };
    let env: BTreeMap<&str, OsString> = [
        ("CODEX_CLI_PATH", "\u{2003}/env/codex \t"),
        ("CODEX_EXTENSION_ID", " env-id "),
        ("CODEX_BROWSER_USE_NODE_PATH", "\t \u{2003}"),
        ("CODEX_BROWSER_CLIENT_PATH", " /env/client "),
        ("CODEX_HOME", " /env/home "),
        ("CODEX_NODE_REPL_PATH", " /env/repl "),
        ("CODEX_APP_SERVER_PROXY_HOST", " localhost "),
        ("CODEX_APP_SERVER_PROXY_PORT", " +4321 "),
    ]
    .into_iter()
    .map(|(k, v)| (k, v.into()))
    .collect();
    let mut seen = Vec::new();
    let actual = config.clone().resolve(|key| {
        seen.push(key.to_owned());
        env.get(key).cloned()
    });
    assert_eq!(seen.len(), 8);
    assert!(seen.iter().all(|key| env.contains_key(key.as_str())));
    assert_eq!(actual.codex_cli_path, "/env/codex");
    assert_eq!(actual.extension_id.as_deref(), Some("env-id"));
    assert_eq!(actual.node_path, "/config/node");
    assert_eq!(actual.browser_client_path.as_deref(), Some("/env/client"));
    assert_eq!(actual.codex_home.as_deref(), Some("/env/home"));
    assert_eq!(actual.node_repl_path.as_deref(), Some("/env/repl"));
    assert_eq!(actual.proxy_host, "localhost");
    assert_eq!(actual.proxy_port, 4321);
    let fallback = config.resolve(|_| Some(OsString::from_vec(vec![0xff])));
    assert_eq!(fallback.codex_cli_path, " /config/codex ");
    assert_eq!(fallback.proxy_port, 1234);
}

#[test]
fn native_u16_ports_accept_zero_and_plus_and_fall_back_on_invalid() {
    for value in 0..=u16::MAX {
        let actual = LaunchFields::default().resolve(|key| {
            (key == "CODEX_APP_SERVER_PROXY_PORT").then(|| value.to_string().into())
        });
        assert_eq!(actual.proxy_port, value);
    }
    for input in [
        "",
        " ",
        "-1",
        "65536",
        "999999999999999999",
        "12.5",
        "1_000",
        "+",
        "-",
        "0x10",
        "１２",
    ] {
        let config = LaunchFields {
            proxy_port: Some(8080),
            ..Default::default()
        };
        let actual =
            config.resolve(|key| (key == "CODEX_APP_SERVER_PROXY_PORT").then(|| input.into()));
        assert_eq!(actual.proxy_port, 8080, "{input}");
    }
    let actual = LaunchFields {
        proxy_port: Some(8080),
        ..Default::default()
    }
    .resolve(|key| (key == "CODEX_APP_SERVER_PROXY_PORT").then(|| " +0 ".into()));
    assert_eq!(actual.proxy_port, 0);
}

#[test]
fn real_file_loading_composes_identity_sidecar_and_environment_precedence() {
    use core_browser_extension_host::{
        app_server_configuration::load_configuration,
        app_server_manifest::{ManifestError, ProtocolRequirements},
    };
    use serde_json::json;
    use std::fs;
    let root = std::env::temp_dir().join(format!("core-load-config-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&root).unwrap();
    struct Cleanup(std::path::PathBuf);
    impl Drop for Cleanup {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    let _cleanup = Cleanup(root.clone());
    let exe = root.join("host");
    let registry = root.join("chrome-native-hosts-v2.json");
    let entry = json!({"schemaVersion":2,"extensionIds":["invocation-id"],"nativeHostNames":["host-name"],"extensionBuildChannels":["stable"],"appServerProtocolVersion":2,"channel":"registry","proxyPort":1234,"paths":{"extensionHostPath":exe,"codexCliPath":root,"codexHome":root,"nodePath":root,"resourcesPath":root}});
    fs::write(
        &registry,
        json!({"schemaVersion":2,"entries":[entry]}).to_string(),
    )
    .unwrap();
    fs::write(
        root.join("extension-host-config.json"),
        json!({"nodeReplPath":" /sidecar/repl ","proxyHost":" sidecar-host ","proxyPort":5678})
            .to_string(),
    )
    .unwrap();
    let mut env: BTreeMap<&str, OsString> = [
        ("CODEX_HOME", root.as_os_str().to_owned()),
        ("CODEX_EXTENSION_ID", " env-id ".into()),
        ("CODEX_BROWSER_USE_NODE_PATH", " /env/node ".into()),
        ("CODEX_APP_SERVER_PROXY_PORT", " +0 ".into()),
    ]
    .into_iter()
    .collect();
    let protocols = ProtocolRequirements {
        app_server: Some(2),
        native_host: None,
    };
    let load = |env: &BTreeMap<&str, OsString>| {
        load_configuration(
            Some(&exe),
            Some("host-name"),
            Some("invocation-id"),
            Some("stable"),
            &protocols,
            |key| env.get(key).cloned(),
        )
    };
    let result = load(&env).unwrap();
    assert_eq!(result.selection.registry_path, registry);
    assert_eq!(
        result.selection.selected.configuration.channel.as_deref(),
        Some("registry")
    );
    assert_eq!(result.launch.extension_id.as_deref(), Some("env-id"));
    assert_eq!(result.launch.node_path, "/env/node");
    assert_eq!(
        result.launch.node_repl_path.as_deref(),
        Some("/sidecar/repl")
    );
    assert_eq!(result.launch.proxy_host, "sidecar-host");
    assert_eq!(result.launch.proxy_port, 0);
    env.insert("CODEX_EXTENSION_ID", " \t".into());
    env.insert("CODEX_APP_SERVER_PROXY_PORT", "invalid".into());
    let fallback = load(&env).unwrap();
    assert_eq!(
        fallback.launch.extension_id.as_deref(),
        Some("invocation-id")
    );
    assert_eq!(fallback.launch.proxy_port, 1234);
    // Environment ID is a final launch override, not the candidate selector.
    assert!(matches!(
        load_configuration(
            Some(&exe),
            Some("host-name"),
            Some("env-id"),
            Some("stable"),
            &protocols,
            |key| env.get(key).cloned()
        ),
        Err(ManifestError::NoCompatibleEntry)
    ));
    fs::remove_file(&registry).unwrap();
    let mut seen = Vec::new();
    let result = load_configuration(Some(&exe), None, None, None, &protocols, |key| {
        seen.push(key.to_owned());
        env.get(key).cloned()
    });
    assert!(matches!(result, Err(ManifestError::MissingRegistry)));
    assert!(seen
        .iter()
        .all(|key| ["HOME", "USERPROFILE", "CODEX_HOME"].contains(&key.as_str())));
}
