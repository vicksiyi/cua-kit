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
    let service = root.join("service.mjs");
    std::fs::write(&service,r#"export async function handleRpc(x){if(x.suspend)return await nodeRepl.withSuspendedTimeout(()=>nodeRepl.withSuspendedTimeout(async()=>{await new Promise(r=>setTimeout(r,x.suspend));return 'waited';}));return {echo:x,meta:nodeRepl.requestMeta};}"#).unwrap();
    let root_string = root.to_string_lossy().to_string();
    let env = BTreeMap::from([
        ("HOME".into(), root_string.clone()),
        ("TMPDIR".into(), root_string.clone()),
        ("NODE_REPL_TRUSTED_RPC_ENABLED".into(), "1".into()),
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
