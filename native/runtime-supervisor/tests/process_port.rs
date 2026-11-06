#![cfg(unix)]
use core_runtime_supervisor::process_port::{ProcessSpec, ProcessWorker};
use serde_json::json;
use std::{collections::BTreeMap, path::PathBuf, time::Duration};
use tokio::time::timeout;
fn spec(code: &str) -> ProcessSpec {
    ProcessSpec {
        command: PathBuf::from(
            std::env::var("CUA_TEST_NODE")
                .expect("Set CUA_TEST_NODE to an absolute Node executable"),
        ),
        args: vec!["-e".into(), code.into()],
        cwd: std::env::temp_dir(),
        env: BTreeMap::new(),
        max_frame_bytes: 1024 * 1024,
        max_queued_bytes: 2 * 1024 * 1024,
        terminate_grace: Duration::from_millis(20),
    }
}
#[tokio::test]
async fn fragmented_utf8_exact_env_and_final_frame() {
    let mut worker=ProcessWorker::start(spec(r#"const b=Buffer.from(JSON.stringify({text:'你好🌍',path:process.env.PATH??null})+'\n');process.stdout.write(b.subarray(0,12));setTimeout(()=>process.stdout.write(b.subarray(12)),10)"#)).await.unwrap();
    assert_eq!(
        timeout(Duration::from_secs(5), worker.next_message())
            .await
            .unwrap()
            .unwrap(),
        Some(json!({"text":"你好🌍","path":null}))
    );
    assert_eq!(worker.next_message().await.unwrap(), None);
    worker.close().await.unwrap();
}
#[tokio::test]
async fn truncated_invalid_utf8_and_overflow_retire_worker() {
    for code in [
        r#"process.stdout.write('{"a":1}')"#,
        r#"process.stdout.write(Buffer.from([123,34,97,34,58,34,255,34,125,10]))"#,
        r#"process.stdout.write('x'.repeat(1025));setInterval(()=>{},1000)"#,
    ] {
        let mut config = spec(code);
        config.max_frame_bytes = 1024;
        config.max_queued_bytes = 2048;
        let mut worker = ProcessWorker::start(config).await.unwrap();
        assert!(timeout(Duration::from_secs(5), worker.next_message())
            .await
            .unwrap()
            .is_err());
        assert!(worker.close().await.is_err());
    }
}
#[tokio::test]
async fn shutdown_retires_owned_descendants() {
    let mut worker=ProcessWorker::start(spec(r#"const child=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',env:{}});console.log(JSON.stringify({pid:child.pid}));setInterval(()=>{},1000)"#)).await.unwrap();
    let event = timeout(Duration::from_secs(5), worker.next_message())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    let pid = event["pid"].as_u64().unwrap();
    worker.close().await.unwrap();
    for attempt in 0..100 {
        let output = tokio::process::Command::new("/bin/ps")
            .args(["-o", "stat=", "-p", &pid.to_string()])
            .output()
            .await
            .unwrap();
        let state = String::from_utf8_lossy(&output.stdout);
        if state.trim().is_empty() || state.trim().starts_with('Z') {
            return;
        }
        assert!(attempt < 99, "Owned worker descendant survived retirement");
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}
#[tokio::test]
async fn real_restored_kernel_preserves_bindings() {
    let project = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let mut config = spec("");
    config.args = vec![
        "--experimental-vm-modules".into(),
        project
            .join("packages/node-repl/dist/kernel.js")
            .to_string_lossy()
            .into(),
        "--session-id".into(),
        "rust-worker-test".into(),
        "--working-dir".into(),
        config.cwd.to_string_lossy().into(),
    ];
    let mut worker = ProcessWorker::start(config).await.unwrap();
    for (id, code, expected) in [
        ("one", "var result = 6 * 7; nodeRepl.write(result)", "42"),
        ("two", "nodeRepl.write(result + 1)", "43"),
    ] {
        worker
            .send(&json!({"type":"exec","id":id,"code":code}))
            .await
            .unwrap();
        let message = timeout(Duration::from_secs(5), async {
            loop {
                let message = worker.next_message().await.unwrap().unwrap();
                if message["type"] == "exec_redacted_source"
                    || message["type"] == "submitted_code_complete"
                {
                    continue;
                }
                return message;
            }
        })
        .await
        .unwrap();
        assert_eq!(message["type"], "exec_result");
        assert_eq!(message["id"], id);
        assert_eq!(message["ok"], true, "{message}");
        assert!(message.to_string().contains(expected), "{message}");
    }
    worker.close().await.unwrap();
}
#[tokio::test]
async fn bounded_startup_output_and_invalid_launch() {
    let mut config =
        spec(r#"process.stdout.write(('{}\n').repeat(1000));setInterval(()=>{},1000)"#);
    config.max_frame_bytes = 128;
    config.max_queued_bytes = 256;
    let mut worker = ProcessWorker::start(config).await.unwrap();
    tokio::time::sleep(Duration::from_millis(150)).await;
    let mut count = 0;
    loop {
        match worker.next_message().await {
            Ok(Some(_)) => count += 1,
            Err(_) => break,
            Ok(None) => panic!("overflow must fail"),
        }
    }
    assert!(count <= 128);
    assert!(worker.close().await.is_err());
    let mut missing = spec("");
    missing.command = PathBuf::from("/nonexistent/core-worker");
    assert!(ProcessWorker::start(missing).await.is_err());
}


#[tokio::test]
async fn fetch_frames_validate_raw_fields_before_value_and_continue_after_failure() {
    // A Value-only transport would silently accept the last repeated method.
    let code = r#"
for (const line of [
 '{"type":"authenticated_fetch","id":"dup","exec_id":"e","request":{"method":"GET","method":"POST","url":"https://example.test/"}}',
 '{"type":"authenticated_fetch","id":"missing-exec","request":{"method":"GET","url":"https://example.test/"}}',
 '{"type":"authenticated_fetch","id":"dup-id","id":"last","exec_id":"e","request":{"method":"GET","url":"https://example.test/"}}',
 '{"type":"authenticated_fetch","id":"null-headers","exec_id":"e","request":{"method":"GET","url":"https://example.test/","headers":null}}',
 '{"type":"authenticated_fetch","type":"fixture-end","id":"wrong-route"}',
 '{"type":"fixture-end","type":"authenticated_fetch","id":"dup-type","exec_id":"e","request":{"method":"GET","url":"https://example.test/"}}',
 '{"type":"authenticated_fetch","type":"authenticated_fetch","id":"same-type","exec_id":"e","request":{"method":"GET","url":"https://example.test/"}}',
 '{"type":null}',
 '{"type":42}',
 '{"type":"authenticated_fetch","id":"valid","exec_id":"e","request":{"method":"GET","url":"https://example.test/"}}',
 '{"type":"fixture-end"}'
]) process.stdout.write(line+'\n');
"#;
    let mut worker = ProcessWorker::start(spec(code)).await.unwrap();
    let first = timeout(Duration::from_secs(5), worker.next_message()).await.unwrap().unwrap().unwrap();
    assert_eq!(first["id"], "valid");
    assert_eq!(worker.next_message().await.unwrap(), Some(json!({"type":"fixture-end"})));
    assert_eq!(worker.next_message().await.unwrap(), None);
    worker.close().await.unwrap();
}

#[tokio::test]
async fn malformed_json_lines_are_dropped_without_retiring_worker_or_losing_following_frames() {
    let mut config = spec(r#"
        process.stdout.write('bad\n{\nnull\n42\n[]\n"text"\n   \n\n'.repeat(300));
        process.stdout.write(JSON.stringify({ready:true})+'\n');
        process.stdin.once('data',()=>process.stdout.write('not-json\n'+JSON.stringify({stillAlive:true})+'\n'));
    "#);
    config.max_frame_bytes = 1024;
    config.max_queued_bytes = 2048;
    let mut worker = ProcessWorker::start(config).await.unwrap();
    assert_eq!(timeout(Duration::from_secs(5), worker.next_message()).await.unwrap().unwrap(), Some(json!({"ready":true})));
    worker.send(&json!({"continue":true})).await.unwrap();
    assert_eq!(timeout(Duration::from_secs(5), worker.next_message()).await.unwrap().unwrap(), Some(json!({"stillAlive":true})));
    worker.close().await.unwrap();
}

#[tokio::test]
async fn kernel_protocol_drops_unknown_missing_and_duplicate_tags_before_queueing() {
    let mut config = spec(r#"
        for(let i=0;i<300;i++) process.stdout.write(
          '{}\n{"type":"future_message"}\n{"type":"exec_result","type":"future_message"}\n{"type":"future_message","type":"exec_result"}\n{"type":"trusted_service_response"}\n');
        process.stdout.write(JSON.stringify({type:'exec_result',id:'first',ok:true,output:''})+'\n');
        process.stdin.once('data',()=>process.stdout.write(JSON.stringify({type:'exec_result',id:'second',ok:true,output:''})+'\n'));
    "#);
    config.max_frame_bytes = 1024;
    config.max_queued_bytes = 2048;
    let mut worker = ProcessWorker::start_kernel(config).await.unwrap();
    assert_eq!(timeout(Duration::from_secs(5),worker.next_message()).await.unwrap().unwrap().unwrap()["id"], "first");
    worker.send(&json!({"type":"exec","id":"second"})).await.unwrap();
    assert_eq!(timeout(Duration::from_secs(5),worker.next_message()).await.unwrap().unwrap().unwrap()["id"], "second");
    worker.close().await.unwrap();
}

#[tokio::test]
async fn kernel_exec_result_payload_is_decoded_from_raw_fields_before_dispatch() {
    let mut worker=ProcessWorker::start_kernel(spec(r#"
        for(const line of [
          '{"type":"exec_result","id":"bad","ok":true}',
          '{"type":"exec_result","id":"bad","ok":"true","output":""}',
          '{"type":"exec_result","id":"bad","id":"last","ok":true,"output":""}',
          '{"type":"exec_result","id":"bad","ok":true,"output":"","content_items":[{}]}',
          '{"type":"exec_result","id":"valid","ok":false,"output":"","error_kind":null,"extra":42}'
        ]) process.stdout.write(line+'\n');
    "#)).await.unwrap();
    let result=timeout(Duration::from_secs(5),worker.next_message()).await.unwrap().unwrap().unwrap();
    assert_eq!(result["id"],"valid");
    assert_eq!(result["error_kind"],"unknown");
    assert_eq!(result["content_items"],json!([]));
    assert!(result.get("extra").is_none());
    assert!(worker.next_message().await.unwrap().is_none());
    worker.close().await.unwrap();
}
