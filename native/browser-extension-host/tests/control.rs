use core_browser_extension_host::control::NativeControl;
use serde_json::{json, Value};

#[test]
fn status_never_loads_configuration_and_runtime_errors_keep_id_and_category() {
    let root = std::env::temp_dir().join(format!("core-control-{}", uuid::Uuid::new_v4()));
    let mut control = NativeControl::new(root.clone());
    let status = control
        .handle_with_environment(
            &json!({"method":"codexRuntime/status","id":{"x":3}}),
            None,
            |_| panic!("status read environment"),
        )
        .unwrap();
    assert_eq!(
        status,
        json!({"jsonrpc":"2.0","id":{"x":3},"result":{"phase":"idle"}})
    );
    for method in ["codexRuntime/ensure", "codexRuntime/restart"] {
        let result = control
            .handle_with_environment(&json!({"method":method,"id":[1,2]}), None, |_| None)
            .unwrap();
        assert_eq!(result["id"], json!([1, 2]));
        assert_eq!(result["error"]["code"], 1);
        assert_eq!(result["error"]["data"]["type"], "manifest_missing");
    }
    assert!(!root.exists());
    assert!(control.handle(&json!({"method":"unrelated"})).is_none());
    assert_eq!(
        control
            .handle(&json!({"method":"codexRuntime/status"}))
            .unwrap()["id"],
        Value::Null
    );
}

#[test]
fn dispatcher_ensure_status_restart_share_one_proxy() {
    let root = std::env::temp_dir().join(format!("core-control-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&root).unwrap();
    let entry = json!({"schemaVersion":2,"entryId":"fixture",
        "paths":{"codexCliPath":root,"codexHome":root,"nodePath":root,"resourcesPath":root}});
    std::fs::write(
        root.join("chrome-native-hosts-v2.json"),
        json!({"schemaVersion":2,"entries":[entry]}).to_string(),
    )
    .unwrap();
    let assets = root.join("assets");
    let mut control = NativeControl::new(assets.clone());
    let env = |key: &str| (key == "CODEX_HOME").then(|| root.clone().into_os_string());
    let first = control
        .handle_with_environment(
            &json!({"id":"first","method":"codexRuntime/ensure"}),
            None,
            env,
        )
        .unwrap();
    assert_eq!(first["result"]["entryId"], "fixture");
    let session = &first["result"]["runtimeSessionId"];
    assert!(session.as_str().is_some());
    let status = control
        .handle(&json!({"id":2,"method":"codexRuntime/status"}))
        .unwrap();
    assert_eq!(&status["result"]["runtimeSessionId"], session);
    let second = control
        .handle_with_environment(&json!({"id":3,"method":"codexRuntime/restart"}), None, env)
        .unwrap();
    assert_ne!(&second["result"]["runtimeSessionId"], session);
    assert_eq!(
        second["result"]["localAppServerUrl"],
        first["result"]["localAppServerUrl"]
    );
    assert!(!assets.exists());
    drop(control);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn hello_is_static_without_configuration_or_proxy_initialization() {
    let root = std::env::temp_dir().join(format!("core-hello-{}", uuid::Uuid::new_v4()));
    let mut control = NativeControl::new(root.clone());
    for id in [Value::Null, json!({"nested":[3]}), json!("hello")] {
        let result = control.handle_with_environment(
            &json!({"method":"codexRuntime/hello","id":id,"params":{"constraints":false}}),
            None, |_| panic!("hello must not load configuration"),
        ).unwrap();
        assert_eq!(result, json!({"jsonrpc":"2.0","id":id,"result":{
            "manifestSchemaVersion":2,"nativeHostProtocolVersion":2,
            "nativeHostVersion":"0.1.0",
            "supportedMethods":["codexRuntime/openLocalFile"],"supportedProtocolVersions":[2]
        }}));
    }
    assert_eq!(control.handle(&json!({"method":"codexRuntime/hello"})).unwrap()["id"], Value::Null);
    assert_eq!(control.handle(&json!({"method":"codexRuntime/status"})).unwrap()["result"], json!({"phase":"idle"}));
    assert!(!root.exists());
}
