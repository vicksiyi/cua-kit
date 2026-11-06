#![cfg(unix)]
use core_runtime_supervisor::{process_port::ProcessSpec, repl_manager::ReplManager};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, HashSet},
    path::PathBuf,
    time::Duration,
};
use tokio::{sync::oneshot, time::timeout};
struct Fixture {
    root: PathBuf,
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}
fn fixture() -> (Fixture, ReplManager) {
    let project = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let root = PathBuf::from("/tmp").join(format!("core-rust-repl-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&root).unwrap();
    let root = root.canonicalize().unwrap();
    let service = root.join("service.mjs");
    std::fs::write(&service,r#"export async function handleRpc(x){if(x.suspend)return await nodeRepl.withSuspendedTimeout(()=>nodeRepl.withSuspendedTimeout(async()=>{await new Promise(r=>setTimeout(r,x.suspend));return 'waited';}));return {echo:x,meta:nodeRepl.requestMeta};}"#).unwrap();
    let root_string = root.to_string_lossy().to_string();
    let env = BTreeMap::from([
        ("HOME".into(), root_string.clone()),
        ("TMPDIR".into(), root_string.clone()),
        ("NODE_REPL_TRUSTED_RPC_ENABLED".into(), "1".into()),
        ("NODE_REPL_ENABLE_AUDIO".into(), "1".into()),
        (
            "NODE_REPL_TRUSTED_SERVICES".into(),
            json!({"fixture":service}).to_string(),
        ),
        ("NODE_REPL_TRUSTED_CODE_PATHS".into(), root_string.clone()),
    ]);
    let kernel = ProcessSpec {
        command: PathBuf::from(std::env::var("CUA_TEST_NODE").expect("Set CUA_TEST_NODE")),
        args: vec![
            "--experimental-vm-modules".into(),
            project
                .join("packages/node-repl/dist/kernel.js")
                .to_string_lossy()
                .into(),
            "--session-id".into(),
            "rust-repl".into(),
            "--working-dir".into(),
            root_string.clone(),
        ],
        cwd: root.clone(),
        env: env.clone(),
        max_frame_bytes: 8 * 1024 * 1024,
        max_queued_bytes: 16 * 1024 * 1024,
        terminate_grace: Duration::from_millis(20),
    };
    let mut trusted = kernel.clone();
    trusted.args = vec![
        project
            .join("packages/node-repl/dist/trusted_worker.js")
            .to_string_lossy()
            .into(),
        root_string,
    ];
    (
        Fixture { root },
        ReplManager::new(kernel, trusted, HashSet::from(["fixture".into()])),
    )
}
async fn run(session: &mut ReplManager, code: &str) -> Value {
    let result = timeout(
        Duration::from_secs(8),
        session.execute(code, Duration::from_secs(5), json!({"test":"rust"}), None),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(result["ok"], true, "{result}");
    result
}
#[tokio::test]
async fn persistent_state_rpc_metadata_and_reset() {
    let (_fixture, mut session) = fixture();
    assert_eq!(
        run(&mut session, "let count=40;nodeRepl.write(count)").await["output"],
        "40"
    );
    assert_eq!(
        run(&mut session, "count+=2;nodeRepl.write(count)").await["output"],
        "42"
    );
    let rpc = run(
        &mut session,
        "nodeRepl.write(await nodeRepl.rpc('fixture',{value:42}))",
    )
    .await;
    assert!(rpc["output"].as_str().unwrap().contains("rust"), "{rpc}");
    assert!(rpc["output"].as_str().unwrap().contains("42"), "{rpc}");
    session.reset().await.unwrap();
    assert_eq!(
        run(&mut session, "nodeRepl.write(typeof count)").await["output"],
        "undefined"
    );
    session.close().await.unwrap();
    assert!(session
        .execute("1", Duration::from_secs(1), Value::Null, None)
        .await
        .is_err());
}
#[tokio::test]
async fn timeout_cancel_and_dropped_future_discard_worker_state() {
    let (_fixture, mut session) = fixture();
    run(&mut session, "let old=1").await;
    let error = session
        .execute(
            "while(true){}",
            Duration::from_millis(50),
            Value::Null,
            None,
        )
        .await
        .unwrap_err();
    assert!(error.contains("timed out"), "{error}");
    assert_eq!(
        run(&mut session, "nodeRepl.write(typeof old)").await["output"],
        "undefined"
    );
    run(&mut session, "let cancelled=1").await;
    let (send, recv) = oneshot::channel();
    tokio::spawn(async {
        tokio::time::sleep(Duration::from_millis(50)).await;
        let _ = send.send(());
    });
    let error = session
        .execute(
            "while(true){}",
            Duration::from_secs(5),
            Value::Null,
            Some(recv),
        )
        .await
        .unwrap_err();
    assert!(error.contains("cancelled"), "{error}");
    assert_eq!(
        run(&mut session, "nodeRepl.write(typeof cancelled)").await["output"],
        "undefined"
    );
    run(&mut session, "let dropped=1").await;
    assert!(timeout(
        Duration::from_millis(50),
        session.execute("while(true){}", Duration::from_secs(5), Value::Null, None)
    )
    .await
    .is_err());
    assert_eq!(
        run(&mut session, "nodeRepl.write(typeof dropped)").await["output"],
        "undefined"
    );
    session.close().await.unwrap();
}
#[tokio::test]
async fn nested_timeout_suspension_and_unconfigured_service() {
    let (_fixture, mut session) = fixture();
    run(&mut session, "await nodeRepl.rpc('fixture',{})").await;
    let result = session
        .execute(
            "nodeRepl.write(await nodeRepl.rpc('fixture',{suspend:250}))",
            Duration::from_millis(150),
            Value::Null,
            None,
        )
        .await
        .unwrap();
    assert_eq!(result["output"], "waited", "{result}");
    let denied = session
        .execute(
            "await nodeRepl.rpc('not-allowed',{})",
            Duration::from_secs(5),
            Value::Null,
            None,
        )
        .await
        .unwrap();
    assert_eq!(denied["ok"], false);
    assert!(denied["error"].as_str().unwrap().contains("not configured"));
    session.close().await.unwrap();
}

#[tokio::test]
async fn trusted_worker_native_pipe_roundtrip_and_endpoint_denial() {
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::UnixListener,
    };
    let (fixture, session) = fixture();
    let path = fixture.root.join("socket");
    let listener = UnixListener::bind(&path).unwrap();
    let mut session = session.with_pipe_paths(vec![path.clone()]).unwrap();
    std::fs::write(fixture.root.join("service.mjs"),r#"
export async function handleRpc(x){
 const socket=await nodeRepl.nativePipe.createConnection(x.path);
 return await new Promise((resolve,reject)=>{
  let result='';socket.on('error',reject);
  socket.on('data',bytes=>{result+=Buffer.from(bytes).toString();if(result.length===x.size){socket.end();resolve(result.length);}});
  socket.write(Buffer.alloc(x.size,97));
 });
}"#).unwrap();
    let peer = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut bytes = vec![0; 315_000];
        socket.read_exact(&mut bytes).await.unwrap();
        assert!(bytes.iter().all(|byte| *byte == 97));
        socket.write_all(&bytes).await.unwrap();
    });
    let code = format!(
        "nodeRepl.write(await nodeRepl.rpc('fixture',{{path:{},size:315000}}))",
        json!(path)
    );
    assert_eq!(run(&mut session, &code).await["output"], "315000");
    peer.await.unwrap();
    let denied = session
        .execute(
            "await nodeRepl.rpc('fixture',{path:'/tmp/unauthorized.sock',size:1})",
            Duration::from_secs(5),
            Value::Null,
            None,
        )
        .await
        .unwrap();
    assert_eq!(denied["ok"], false, "{denied}");
    assert!(
        denied["error"].as_str().unwrap().contains("not authorized"),
        "{denied}"
    );
    session.close().await.unwrap();
}

#[tokio::test]
async fn turn_ended_metadata_deduplication_and_reset_scope() {
    let (fixture, mut session) = fixture();
    std::fs::write(fixture.root.join("service.mjs"),r#"
const events=[];
nodeRepl.addTurnEndedHandler({timeoutMs:5000,run:async(event)=>{
 await nodeRepl.withSuspendedTimeout(()=>nodeRepl.withSuspendedTimeout(async()=>{await new Promise(r=>setTimeout(r,200));}));
 nodeRepl.setResponseMeta({first:1,replace:'old'});nodeRepl.setResponseMeta({replace:'new'});
 events.push({event,meta:nodeRepl.requestMeta});
}});
export async function handleRpc(){return events;}
"#).unwrap();
    run(&mut session, "await nodeRepl.rpc('fixture',{})").await;
    let event = json!({"hook_event_name":"turn_ended","session_id":"session","turn_id":"one"});
    let first = session
        .turn_ended(
            event.clone(),
            Duration::from_millis(150),
            json!({"host":"turn-meta"}),
            None,
        )
        .await
        .unwrap();
    assert_eq!(first["type"], "turn_ended_result");
    assert_eq!(first["response_meta"], json!({"first":1,"replace":"new"}));
    let second = session
        .turn_ended(event.clone(), Duration::from_secs(1), Value::Null, None)
        .await
        .unwrap();
    assert_eq!(first, second);
    let observed = run(
        &mut session,
        "nodeRepl.write(JSON.stringify(await nodeRepl.rpc('fixture',{})))",
    )
    .await;
    let events: Value = serde_json::from_str(observed["output"].as_str().unwrap()).unwrap();
    assert_eq!(events.as_array().unwrap().len(), 1);
    assert_eq!(events[0]["event"], event);
    assert_eq!(events[0]["meta"], json!({"host":"turn-meta"}));
    session.reset().await.unwrap();
    assert_eq!(
        session
            .turn_ended(event, Duration::from_secs(1), Value::Null, None)
            .await
            .unwrap(),
        first
    );
    assert_eq!(
        run(
            &mut session,
            "nodeRepl.write((await nodeRepl.rpc('fixture',{})).length)"
        )
        .await["output"],
        "0"
    );
    session.close().await.unwrap();
}

#[tokio::test]
async fn failed_turn_can_retry_and_invalid_events_do_not_run() {
    let (fixture, mut session) = fixture();
    std::fs::write(
        fixture.root.join("service.mjs"),
        r#"
nodeRepl.addTurnEndedHandler({timeoutMs:5000,run:async()=>{await new Promise(()=>{});}});
export async function handleRpc(){return 'ready';}
"#,
    )
    .unwrap();
    run(&mut session, "await nodeRepl.rpc('fixture',{})").await;
    for event in [
        json!({}),
        json!({"hook_event_name":"turn_ended","session_id":"s","turn_id":"t","extra":true}),
        json!({"hook_event_name":"turn_ended","session_id":"s","turn_id":""}),
    ] {
        assert!(session
            .turn_ended(event, Duration::from_secs(1), Value::Null, None)
            .await
            .unwrap_err()
            .contains("Invalid"));
    }
    let event = json!({"hook_event_name":"turn_ended","session_id":"s","turn_id":"t"});
    let error = session
        .turn_ended(event.clone(), Duration::from_millis(50), Value::Null, None)
        .await
        .unwrap_err();
    assert!(error.contains("timed out"), "{error}");
    std::fs::write(fixture.root.join("service.mjs"),"let count=0;nodeRepl.addTurnEndedHandler({timeoutMs:1000,run:async()=>{count++;}});export async function handleRpc(){return count;}").unwrap();
    run(&mut session, "await nodeRepl.rpc('fixture',{})").await;
    session
        .turn_ended(event, Duration::from_secs(1), Value::Null, None)
        .await
        .unwrap();
    assert_eq!(
        run(
            &mut session,
            "nodeRepl.write(JSON.stringify(await nodeRepl.rpc('fixture',{})))"
        )
        .await["output"],
        "1"
    );
    session.close().await.unwrap();
}

#[tokio::test]
async fn host_callbacks_preserve_denial_metadata_config_and_media() {
    use core_runtime_supervisor::host::HostReply;
    use std::sync::{Arc, Mutex};
    let (fixture, session) = fixture();
    std::fs::write(fixture.root.join("service.mjs"),r#"
export async function handleRpc(x){
 if(x.ask)return await nodeRepl.withSuspendedTimeout(()=>nodeRepl.createElicitation({message:'fixture decision'}));
 if(x.config)return await nodeRepl.config.read();
 return 'ready';
}"#).unwrap();
    let calls = Arc::new(Mutex::new(Vec::new()));
    let observed = calls.clone();
    let mut session = session.with_host_handler(
        Arc::new(move |request| {
            let calls = calls.clone();
            Box::pin(async move {
                calls.lock().unwrap().push((
                    request.message.clone(),
                    request.request_meta.clone(),
                    request.execution_id,
                ));
                match request.message["type"].as_str().unwrap() {
                    "elicit" => {
                        tokio::time::sleep(Duration::from_millis(200)).await;
                        Ok(HostReply::message(
                            json!({"ok":true,"action":"decline","content":null}),
                        ))
                    }
                    "config_action" => Ok(HostReply::message(
                        json!({"ok":true,"value":{"config":{"fixture":true}}}),
                    )),
                    "emit_image" => Ok(HostReply {
                        message: json!({"ok":true}),
                        content: vec![json!({"type":"text","text":"fixture host processed media"})],
                    }),
                    _ => Err("unsupported fixture request".into()),
                }
            })
        }),
        true,
    );
    run(&mut session, "await nodeRepl.rpc('fixture',{})").await;
    let result = session
        .execute(
            "nodeRepl.write(await nodeRepl.rpc('fixture',{ask:true}))",
            Duration::from_millis(150),
            json!({"trusted_host":42}),
            None,
        )
        .await
        .unwrap();
    assert_eq!(result["ok"], true, "{result}");
    assert!(result["output"].as_str().unwrap().contains("decline"));
    let config = run(
        &mut session,
        "nodeRepl.write(await nodeRepl.rpc('fixture',{config:true}))",
    )
    .await;
    assert!(
        config["output"].as_str().unwrap().contains("fixture: true"),
        "{config}"
    );
    let media=run(&mut session,"nodeRepl.emitImage('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=');nodeRepl.write('finished')").await;
    assert!(media["content_items"]
        .as_array()
        .unwrap()
        .iter()
        .any(|item| item["text"] == "fixture host processed media"));
    let calls = observed.lock().unwrap();
    assert_eq!(calls.len(), 3);
    assert_eq!(calls[0].1, json!({"trusted_host":42}));
    assert_eq!(calls[0].0["exec_id"], calls[0].2);
    drop(calls);
    session.close().await.unwrap();
}

#[tokio::test]
async fn missing_host_and_missing_form_capability_never_approve() {
    let (fixture, mut session) = fixture();
    std::fs::write(fixture.root.join("service.mjs"),"export async function handleRpc(x){return x.ask?await nodeRepl.createElicitation({message:'fixture'}):await nodeRepl.config.read();}").unwrap();
    let config = session
        .execute(
            "await nodeRepl.rpc('fixture',{})",
            Duration::from_secs(5),
            Value::Null,
            None,
        )
        .await
        .unwrap();
    assert_eq!(config["ok"], false);
    assert!(config["error"].as_str().unwrap().contains("not configured"));
    let form = session
        .execute(
            "await nodeRepl.rpc('fixture',{ask:true})",
            Duration::from_secs(5),
            Value::Null,
            None,
        )
        .await
        .unwrap();
    assert_eq!(form["ok"], false);
    assert!(form["error"]
        .as_str()
        .unwrap()
        .contains("does not support form"));
    session.close().await.unwrap();
}

#[tokio::test]
async fn cancelled_host_callback_is_dropped_and_state_is_retired() {
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };
    struct Guard(Arc<AtomicBool>);
    impl Drop for Guard {
        fn drop(&mut self) {
            self.0.store(true, Ordering::SeqCst);
        }
    }
    let (fixture, session) = fixture();
    std::fs::write(
        fixture.root.join("service.mjs"),
        "export async function handleRpc(){return await nodeRepl.config.read();}",
    )
    .unwrap();
    let dropped = Arc::new(AtomicBool::new(false));
    let flag = dropped.clone();
    let entered = Arc::new(tokio::sync::Notify::new());
    let started = entered.clone();
    let mut session = session.with_host_handler(
        Arc::new(move |_request| {
            let guard = Guard(flag.clone());
            let started = started.clone();
            Box::pin(async move {
                let _guard = guard;
                started.notify_one();
                std::future::pending().await
            })
        }),
        false,
    );
    run(&mut session, "let stale=1").await;
    let (send, recv) = oneshot::channel();
    tokio::spawn(async move {
        entered.notified().await;
        let _ = send.send(());
    });
    let error = timeout(
        Duration::from_secs(5),
        session.execute(
            "await nodeRepl.rpc('fixture',{})",
            Duration::from_secs(4),
            Value::Null,
            Some(recv),
        ),
    )
    .await
    .unwrap()
    .unwrap_err();
    assert!(error.contains("cancelled"));
    timeout(Duration::from_secs(1), async {
        while !dropped.load(Ordering::SeqCst) {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    assert_eq!(
        run(&mut session, "nodeRepl.write(typeof stale)").await["output"],
        "undefined"
    );
    session.close().await.unwrap();
}

#[tokio::test]
async fn restored_trusted_worker_reads_and_persists_actual_toml() {
    use core_runtime_supervisor::{
        config_manager::{ConfigManager, ConfigSources},
        deployment_host::deployment_host,
    };
    use std::{collections::HashMap, os::unix::fs::PermissionsExt, sync::Arc};
    let (fixture, session) = fixture();
    std::fs::set_permissions(&fixture.root, std::fs::Permissions::from_mode(0o700)).unwrap();
    for (name, text) in [
        ("config.toml", "[browser_use]\nallow_history_access=false\n"),
        (
            "requirements.toml",
            "[featureRequirements]\nbrowser_use_full_cdp_access=false\n",
        ),
        ("browser.toml", "count=0\n"),
    ] {
        std::fs::write(fixture.root.join(name), text).unwrap();
    }
    std::fs::write(fixture.root.join("service.mjs"),r#"
export async function handleRpc(x){
 if(x.write)await nodeRepl.config.writeToml('browser/config.toml',{count:42});
 return {config:await nodeRepl.config.read({cwd:nodeRepl.cwd}),requirements:await nodeRepl.config.readRequirements(),preference:await nodeRepl.config.readToml('browser/config.toml')};
}"#).unwrap();
    let manager = Arc::new(
        ConfigManager::new(
            ConfigSources {
                config: fixture.root.join("config.toml"),
                requirements: fixture.root.join("requirements.toml"),
                working_directories: HashSet::from([fixture.root.clone()]),
                toml_files: HashMap::from([(
                    "browser/config.toml".into(),
                    fixture.root.join("browser.toml"),
                )]),
            },
            HashSet::from(["browser/config.toml".into()]),
        )
        .unwrap(),
    );
    let mut session = session.with_host_handler(deployment_host(manager), false);
    let result = run(
        &mut session,
        "nodeRepl.write(JSON.stringify(await nodeRepl.rpc('fixture',{write:true})))",
    )
    .await;
    let value: Value = serde_json::from_str(result["output"].as_str().unwrap()).unwrap();
    assert_eq!(value["preference"]["count"], 42);
    assert_eq!(
        value["config"]["config"]["browser_use"]["allow_history_access"],
        false
    );
    assert_eq!(
        value["requirements"]["requirements"]["featureRequirements"]["browser_use_full_cdp_access"],
        false
    );
    let written: toml::Value =
        toml::from_str(&std::fs::read_to_string(fixture.root.join("browser.toml")).unwrap())
            .unwrap();
    assert_eq!(written["count"].as_integer(), Some(42));
    let image = run(
        &mut session,
        "await nodeRepl.emitImage('data:image/png;base64,iVBORw0KGgo=')",
    )
    .await;
    assert_eq!(
        image["content_items"],
        json!([{"type":"image","mimeType":"image/png","data":"iVBORw0KGgo="}])
    );
    let audio = run(
        &mut session,
        "await nodeRepl.emitAudio('data:audio/wav;base64,AQID')",
    )
    .await;
    assert_eq!(
        audio["content_items"],
        json!([{"type":"audio","mimeType":"audio/wav","data":"AQID"}])
    );
    let rejected = session
        .execute(
            "await nodeRepl.emitImage('https://example.invalid/not-fetched')",
            Duration::from_secs(5),
            Value::Null,
            None,
        )
        .await
        .unwrap();
    assert_eq!(rejected["ok"], false);
    session.close().await.unwrap();
}

#[tokio::test]
async fn authenticated_fetch_uses_originating_host_context() {
    use core_runtime_supervisor::host::{HostHandler, HostReply};
    use std::sync::Arc;
    let (fixture, session) = fixture();
    std::fs::write(fixture.root.join("service.mjs"), r#"
export async function handleRpc(x) { return await (await nodeRepl.fetch('https://fixture.invalid/'+x.path)).text(); }
"#).unwrap();
    let handler: HostHandler = Arc::new(|request| {
        Box::pin(async move {
            assert_eq!(request.message["type"], "authenticated_fetch");
            assert_eq!(request.request_meta, json!({"test":"rust"}));
            assert_eq!(request.message["exec_id"], request.execution_id);
            if request.message["request"]["url"] != "https://fixture.invalid/allowed" {
                return Err("URL denied".into());
            }
            Ok(HostReply::message(
                json!({"ok":true,"response":{"status":200,"headers":[],"body_base64":"b2s="}}),
            ))
        })
    });
    let mut session = session.with_host_handler(handler, false);
    assert_eq!(
        run(
            &mut session,
            "nodeRepl.write(await nodeRepl.rpc('fixture',{path:'allowed'}))"
        )
        .await["output"],
        "ok"
    );
    let denied = run(
        &mut session,
        "try{await nodeRepl.rpc('fixture',{path:'denied'})}catch(e){nodeRepl.write(e.message)}",
    )
    .await;
    assert!(denied["output"].as_str().unwrap().contains("URL denied"));
    session.close().await.unwrap();
}

#[tokio::test]
async fn authenticated_fetch_finishes_between_cells_with_original_metadata() {
    use core_runtime_supervisor::host::{HostHandler, HostReply};
    use std::sync::Arc;
    let (fixture, session) = fixture();
    let marker = fixture.root.join("fetch-result");
    std::fs::write(fixture.root.join("service.mjs"), format!(r#"
export async function handleRpc() {{
 setTimeout(async()=>{{try {{ const result=await (await nodeRepl.fetch('https://fixture.invalid/late')).text(); await (await import('node:fs/promises')).writeFile({},result); }} catch(e) {{ await (await import('node:fs/promises')).writeFile({},'ERROR:'+e.message); }} }},200);
 return 'scheduled';
}}
"#,json!(marker),json!(marker))).unwrap();
    let handler: HostHandler = Arc::new(|r| {
        Box::pin(async move {
            assert_eq!(r.request_meta, json!({"test":"rust"}));
            Ok(HostReply::message(
                json!({"ok":true,"response":{"status":200,"headers":[],"body_base64":"bGF0ZQ=="}}),
            ))
        })
    });
    let mut session = session.with_host_handler(handler, false);
    assert_eq!(
        run(
            &mut session,
            "nodeRepl.write(await nodeRepl.rpc('fixture',{}))"
        )
        .await["output"],
        "scheduled"
    );
    session
        .execute("1", Duration::from_secs(3), json!({"later":true}), None)
        .await
        .unwrap();
    let wake = tokio::sync::Notify::new();
    let shutdown = tokio_util::sync::CancellationToken::new();
    timeout(Duration::from_secs(5), async {
        while !marker.exists() {
            session.idle_once(&wake, &shutdown).await.unwrap();
        }
    })
    .await
    .unwrap();
    assert_eq!(std::fs::read_to_string(marker).unwrap(), "late");
    session.close().await.unwrap();
}

#[tokio::test]
async fn cancelling_real_worker_fetch_drops_host_callback_before_reuse() {
    use core_runtime_supervisor::host::HostHandler;
    use std::sync::{Arc, Mutex};
    let (fixture, session) = fixture();
    std::fs::write(fixture.root.join("service.mjs"), r#"
export async function handleRpc() { return await (await nodeRepl.fetch('https://fixture.invalid/pending')).text(); }
"#).unwrap();
    let (cancel, cancellation) = oneshot::channel();
    let (dropped, drop_observed) = oneshot::channel();
    struct DropSignal(Option<oneshot::Sender<()>>);
    impl Drop for DropSignal {
        fn drop(&mut self) {
            if let Some(sender) = self.0.take() {
                let _ = sender.send(());
            }
        }
    }
    let state = Arc::new(Mutex::new(Some((cancel, dropped))));
    let handler: HostHandler = Arc::new(move |request| {
        assert_eq!(request.message["type"], "authenticated_fetch");
        assert_eq!(request.request_meta, json!({"source":"cancel-fixture"}));
        let (cancel, dropped) = state.lock().unwrap().take().expect("one host request");
        Box::pin(async move {
            let _guard = DropSignal(Some(dropped));
            // Cancel only after the actual worker fetch reached the host callback.
            let _ = cancel.send(());
            std::future::pending().await
        })
    });
    let mut session = session.with_host_handler(handler, false);
    run(&mut session, "let oldFetchState=1").await;
    let result = timeout(
        Duration::from_secs(8),
        session.execute(
            "await nodeRepl.rpc('fixture',{})",
            Duration::from_secs(5),
            json!({"source":"cancel-fixture"}),
            Some(cancellation),
        ),
    )
    .await
    .unwrap();
    assert!(result.unwrap_err().contains("cancel"));
    timeout(Duration::from_secs(2), drop_observed)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        run(&mut session, "nodeRepl.write(typeof oldFetchState)").await["output"],
        "undefined"
    );
    session.close().await.unwrap();
}

#[tokio::test]
async fn restored_worker_fetch_uses_native_service_and_real_owned_http() {
    use core_runtime_supervisor::{
        authenticated_fetch::{
            http_client_builder, AuthenticatedFetchService, FetchAuthProvider, FetchCredentials,
            FetchFuture, FetchRuntimeMode,
        },
        config_manager::{ConfigManager, ConfigSources},
        deployment_host::deployment_host_with_fetch,
    };
    use std::{collections::HashMap, sync::Arc};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    struct NoCredentials;
    impl FetchAuthProvider for NoCredentials {
        fn current_auth(&self) -> FetchFuture<'_, FetchCredentials> {
            Box::pin(async { panic!("local passthrough must not read credentials") })
        }
        fn refetch_auth(&self) -> FetchFuture<'_, FetchCredentials> {
            Box::pin(async { panic!("local passthrough must not refresh credentials") })
        }
    }
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut request = Vec::new();
        loop {
            let mut byte = [0];
            socket.read_exact(&mut byte).await.unwrap();
            request.push(byte[0]);
            if request.ends_with(b"\r\n\r\n") {
                break;
            }
            assert!(request.len() < 8192);
        }
        assert!(String::from_utf8(request)
            .unwrap()
            .starts_with("GET /fixture HTTP/1.1\r\n"));
        socket.write_all(b"HTTP/1.1 418 I'm a teapot\r\nContent-Type: text/plain\r\nX-Not-Exposed: secret-fixture\r\nContent-Length: 13\r\nConnection: close\r\n\r\nowned payload").await.unwrap();
        drop(socket);
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut request = Vec::new();
        loop {
            let mut byte = [0];
            socket.read_exact(&mut byte).await.unwrap();
            request.push(byte[0]);
            if request.ends_with(b"\r\n\r\n") { break; }
            assert!(request.len() < 8192);
        }
        let headers = String::from_utf8(request).unwrap().to_ascii_lowercase();
        assert!(headers.starts_with("POST /body HTTP/1.1\r\n".to_ascii_lowercase().as_str()));
        assert!(headers.contains("content-length: 4\r\n"));
        assert!(headers.contains("x-fixture: roundtrip\r\n"));
        let mut body = [0; 4];
        socket.read_exact(&mut body).await.unwrap();
        assert_eq!(body, [0, 127, 128, 255]);
        socket.write_all(b"HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n").await.unwrap();
    });
    let (fixture, session) = fixture();
    std::fs::write(fixture.root.join("config.toml"), "").unwrap();
    std::fs::write(fixture.root.join("requirements.toml"), "").unwrap();
    let config = Arc::new(
        ConfigManager::new(
            ConfigSources {
                config: fixture.root.join("config.toml"),
                requirements: fixture.root.join("requirements.toml"),
                working_directories: HashSet::from([fixture.root.clone()]),
                toml_files: HashMap::new(),
            },
            HashSet::new(),
        )
        .unwrap(),
    );
    let http = http_client_builder().no_proxy().build().unwrap();
    let fetch = Arc::new(AuthenticatedFetchService::with_components(
        FetchRuntimeMode::Default,
        Arc::new(NoCredentials),
        Arc::new(http),
    ));
    std::fs::write(fixture.root.join("service.mjs"),format!(r#"
export async function handleRpc() {{
 const response=await nodeRepl.fetch('http://{address}/fixture');
 const first={{status:response.status,statusText:response.statusText,body:await response.text(),type:response.headers.get('content-type'),hidden:response.headers.get('x-not-exposed')}};
 const empty=await nodeRepl.fetch('http://{address}/body',{{method:'POST',headers:{{'X-Fixture':'roundtrip'}},body:new Uint8Array([0,127,128,255])}});
 return {{first,second:{{status:empty.status,body:await empty.text()}}}};
}}
"#)).unwrap();
    let mut session =
        session.with_host_handler(deployment_host_with_fetch(config, Some(fetch)), false);
    let result = run(
        &mut session,
        "nodeRepl.write(JSON.stringify(await nodeRepl.rpc('fixture',{})))",
    )
    .await;
    let value: Value = serde_json::from_str(result["output"].as_str().unwrap()).unwrap();
    assert_eq!(
        value,
        json!({"first":{"status":418,"statusText":"I'm a teapot","body":"owned payload","type":"text/plain","hidden":null},"second":{"status":204,"body":""}})
    );
    server.await.unwrap();
    session.close().await.unwrap();
}
