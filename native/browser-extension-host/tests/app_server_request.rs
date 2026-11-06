use core_browser_extension_host::app_server_request::EnsureConstraints;
use serde_json::json;

#[test]
fn constraints_are_nested_strings_trimmed_and_versions_strict_unsigned() {
    let params = json!({"extensionId":"ignored", "constraints":{
        "extensionBuildChannel":" \u{2003}beta\t", "extensionId":" id ", "nativeHostName":" host ",
        "requiredAppServerProtocolVersion":0,"requiredNativeHostProtocolVersion":u64::MAX
    }});
    let c = EnsureConstraints::parse(Some(&params));
    assert_eq!(c.extension_build_channel, Some("beta"));
    assert_eq!(c.extension_id, Some("id"));
    assert_eq!(c.native_host_name, Some("host"));
    assert_eq!(c.protocols.app_server, Some(0));
    assert_eq!(c.protocols.native_host, Some(u64::MAX));
    for value in [
        json!(null),
        json!(false),
        json!("2"),
        json!(-1),
        json!(2.0),
        json!([]),
    ] {
        let params = json!({"constraints":{
            "extensionId":value,"nativeHostName":" \t", "extensionBuildChannel":3,
            "requiredAppServerProtocolVersion":value,"requiredNativeHostProtocolVersion":value
        }});
        let c = EnsureConstraints::parse(Some(&params));
        assert!(
            c.extension_id == value.as_str()
                && c.native_host_name.is_none()
                && c.extension_build_channel.is_none()
        );
        assert!(c.protocols.app_server.is_none() && c.protocols.native_host.is_none());
    }
    for value in [
        json!(null),
        json!([]),
        json!({}),
        json!({"extensionId":"top-level"}),
        json!({"constraints":false}),
    ] {
        let c = EnsureConstraints::parse(Some(&value));
        assert!(c.extension_id.is_none() && c.protocols.app_server.is_none());
    }
    assert!(EnsureConstraints::parse(None).extension_id.is_none());
}

#[test]
fn request_loads_owned_registry_and_constraints_before_environment_overrides() {
    use core_browser_extension_host::{
        app_server_proxy::shutdown_proxy, app_server_request::ensure_with_environment,
    };
    let root = std::env::temp_dir().join(format!("core-request-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&root).unwrap();
    let entry = json!({"schemaVersion":2,"entryId":"selected-entry",
        "nativeHostNames":["fixture-host"],"extensionIds":["fixture-id"],"extensionBuildChannels":["beta"],
        "appServerProtocolVersion":5,"nativeHostProtocolVersion":7,
        "paths":{"codexCliPath":root,"codexHome":root,"nodePath":root,"resourcesPath":root}
    });
    std::fs::write(
        root.join("chrome-native-hosts-v2.json"),
        json!({"schemaVersion":2,"entries":[entry]}).to_string(),
    )
    .unwrap();
    let params = json!({"constraints":{"nativeHostName":" fixture-host ","extensionId":" fixture-id ",
        "extensionBuildChannel":" beta ","requiredAppServerProtocolVersion":5,"requiredNativeHostProtocolVersion":7}});
    let env = |key: &str| match key {
        "CODEX_HOME" => Some(root.clone().into_os_string()),
        "CODEX_EXTENSION_ID" => Some(" effective-origin ".into()),
        _ => None,
    };
    let mut slot = None;
    let response = ensure_with_environment(&mut slot, Some(&params), false, None, env)
        .unwrap_or_else(|e| panic!("{}", e.message));
    assert_eq!(response["entryId"], "selected-entry");
    assert_eq!(response["selected"]["appServerProtocolVersion"], 5);
    let proxy = slot.as_ref().unwrap();
    assert_eq!(
        proxy.origin.lock().unwrap().as_deref(),
        Some("chrome-extension://effective-origin")
    );
    assert!(proxy.processes.lock().unwrap().is_empty());
    let session = proxy.runtime_session_id();
    // A subsequent invocation reloads the registry; deletion fails before restart.
    std::fs::remove_file(root.join("chrome-native-hosts-v2.json")).unwrap();
    assert!(ensure_with_environment(&mut slot, Some(&params), true, None, env).is_err());
    assert_eq!(slot.as_ref().unwrap().runtime_session_id(), session);
    shutdown_proxy(&mut slot);
    std::fs::remove_dir_all(root).unwrap();
}
