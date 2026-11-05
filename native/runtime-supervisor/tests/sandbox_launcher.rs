#![cfg(target_os = "macos")]
use core_runtime_supervisor::{
    process_port::ProcessWorker,
    sandbox_launcher::{worker_spec, SandboxedWorkerOptions},
};
use serde_json::json;
use std::{collections::BTreeMap, path::PathBuf, time::Duration};
struct Fixture(PathBuf);
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
fn fixture() -> (Fixture, SandboxedWorkerOptions) {
    let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let root = PathBuf::from("/tmp").join(format!("core-rust-sandbox-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&root).unwrap();
    let root = root.canonicalize().unwrap();
    let code = root.join("code");
    let scratch = root.join("scratch");
    std::fs::create_dir(&code).unwrap();
    std::fs::create_dir(&scratch).unwrap();
    let entry = code.join("probe.mjs");
    std::fs::write(&entry, "").unwrap();
    let options = SandboxedWorkerOptions {
        node: std::env::var("CUA_TEST_NODE").unwrap().into(),
        bootstrap: repo.join("packages/runtime-supervisor/dist/sandbox-bootstrap.js"),
        addon: repo.join("native/macos-sandbox/dist/sandbox.node"),
        entry,
        args: vec![],
        directory: scratch,
        read_directories: vec![code],
        worker_environment: BTreeMap::new(),
    };
    (Fixture(root), options)
}
#[test]
fn rejects_ambient_loader_environment_and_overlapping_roots() {
    let (_fixture, mut options) = fixture();
    options
        .worker_environment
        .insert("NODE_OPTIONS".into(), "--require anything".into());
    assert!(worker_spec(options).is_err());
    let (_fixture, mut options) = fixture();
    options.read_directories.push(options.directory.clone());
    assert!(worker_spec(options).is_err());
    let (_fixture, mut options) = fixture();
    options.read_directories.push("/".into());
    assert!(worker_spec(options).is_err());
    let (_fixture, mut options) = fixture();
    options.read_directories.clear();
    assert!(worker_spec(options).is_err());
    let (fixture, mut options) = fixture();
    let alias = fixture.0.join("alias");
    std::os::unix::fs::symlink(&options.directory, &alias).unwrap();
    options.read_directories.push(alias);
    assert!(worker_spec(options).is_err());
}
#[tokio::test]
async fn rust_policy_denies_outside_io_spawn_and_network() {
    let (fixture, options) = fixture();
    let outside = fixture.0.join("outside");
    std::fs::write(&outside, "secret").unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let code = format!(
        r#"
import fs from 'node:fs';import net from 'node:net';import cp from 'node:child_process';
const result={{type:'probe'}};
fs.writeFileSync('allowed','ok');result.allowed=fs.readFileSync('allowed','utf8');
try{{fs.readFileSync({});result.outside='unexpected';}}catch(e){{result.outside=e.code;}}
result.spawn=cp.spawnSync(process.execPath,['-e','0']).error?.code;
result.scrubbed=!process.env.CORE_CUA_SANDBOX_PROFILE&&!process.env.CORE_CUA_SANDBOX_ADDON;
result.network=await new Promise(resolve=>{{const s=net.createConnection({{host:'127.0.0.1',port:{port}}});s.once('error',e=>{{s.destroy();resolve(e.code);}});s.once('connect',()=>{{s.destroy();resolve('unexpected');}});}});
console.log(JSON.stringify(result));
"#,
        json!(outside)
    );
    std::fs::write(&options.entry, code).unwrap();
    let spec = worker_spec(options).unwrap();
    assert!(!spec.env.contains_key("PATH"));
    let mut worker = ProcessWorker::start(spec).await.unwrap();
    let result = tokio::time::timeout(Duration::from_secs(8), worker.next_message())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    worker.close().await.unwrap();
    assert_eq!(
        result,
        json!({"type":"probe","allowed":"ok","outside":"EPERM","spawn":"EPERM","scrubbed":true,"network":"EPERM"})
    );
    assert!(
        tokio::time::timeout(Duration::from_millis(50), listener.accept())
            .await
            .is_err()
    );
}
