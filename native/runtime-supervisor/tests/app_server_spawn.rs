#![cfg(unix)]
use core_runtime_supervisor::{
    authenticated_fetch::FetchRuntimeMode,
    codex_app_server::{resolve_cli_path, CodexAppServerConnection},
};
use std::{
    env::VarError,
    ffi::OsString,
    os::unix::{ffi::OsStringExt, fs::PermissionsExt},
    path::PathBuf,
    time::Duration,
};
use tokio::io::AsyncWriteExt;

#[test]
fn executable_fallback_preserves_present_values() {
    assert_eq!(resolve_cli_path(Err(VarError::NotPresent)), "codex");
    assert_eq!(
        resolve_cli_path(Err(VarError::NotUnicode(OsString::from_vec(vec![255])))),
        "codex"
    );
    for value in ["", " /tmp/with spaces ", "/owned/codex"] {
        assert_eq!(resolve_cli_path(Ok(value.into())), value);
    }
}

#[test]
fn gaas_rejects_before_lookup_or_process_creation() {
    let result =
        CodexAppServerConnection::spawn_with_cli_lookup(FetchRuntimeMode::GaasBrowser, || {
            panic!("lookup must not run")
        });
    assert_eq!(
        result.err().unwrap(),
        "Codex app-server is unavailable in gaas-browser runtime mode"
    );
}

struct OwnedFixture(PathBuf);
impl OwnedFixture {
    fn new() -> Self {
        let directory =
            std::env::temp_dir().join(format!("cua-owned-app-server-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&directory).unwrap();
        std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o700)).unwrap();
        let path = directory.join("fixture cli");
        std::fs::write(&path, "#!/usr/bin/python3\nimport json,sys,os\nprint(json.dumps({'args':sys.argv[1:],'pid':os.getpid()}),flush=True)\nfor line in sys.stdin:\n print(line.rstrip('\\n'),flush=True)\n").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700)).unwrap();
        Self(directory)
    }
    fn cli(&self) -> String {
        self.0.join("fixture cli").to_str().unwrap().to_owned()
    }
}
impl Drop for OwnedFixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[tokio::test]
async fn owned_process_has_exact_arguments_and_bidirectional_pipes() {
    let fixture = OwnedFixture::new();
    let mut connection =
        CodexAppServerConnection::spawn_with_cli_lookup(FetchRuntimeMode::Default, || {
            Ok(fixture.cli())
        })
        .unwrap();
    let line = tokio::time::timeout(Duration::from_secs(5), connection.stdout.next_line())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    let ready: serde_json::Value = serde_json::from_str(&line).unwrap();
    assert_eq!(
        ready["args"],
        serde_json::json!(["app-server", "--listen", "stdio://"])
    );
    assert_eq!(ready["pid"].as_u64(), connection.child.id().map(u64::from));
    assert!(connection.child.stderr.is_none());
    connection
        .stdin
        .write_all(b"owned fixture request\n")
        .await
        .unwrap();
    connection.stdin.flush().await.unwrap();
    let line = tokio::time::timeout(Duration::from_secs(5), connection.stdout.next_line())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert_eq!(line, "owned fixture request");
    // Reap only this explicitly owned child.
    connection.child.kill().await.unwrap();
    assert!(connection.child.wait().await.unwrap().code().is_none());
}

#[tokio::test]
async fn spawn_errors_keep_native_prefix_and_drop_terminates_owned_child() {
    let fixture = OwnedFixture::new();
    let missing = fixture.0.join("does-not-exist");
    let result = CodexAppServerConnection::spawn_with_cli_lookup(FetchRuntimeMode::Default, || {
        Ok(missing.to_str().unwrap().into())
    });
    assert!(result
        .err()
        .unwrap()
        .starts_with("failed to start codex app-server: "));
    let mut connection =
        CodexAppServerConnection::spawn_with_cli_lookup(FetchRuntimeMode::Default, || {
            Ok(fixture.cli())
        })
        .unwrap();
    let line = tokio::time::timeout(Duration::from_secs(5), connection.stdout.next_line())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    let ready: serde_json::Value = serde_json::from_str(&line).unwrap();
    assert_eq!(ready["pid"].as_u64(), connection.child.id().map(u64::from));
    let pid = connection.child.id().unwrap() as i32;
    drop(connection);
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if unsafe { libc::kill(pid, 0) } == -1
                && std::io::Error::last_os_error().raw_os_error() == Some(libc::ESRCH)
            {
                break;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("owned child should be killed and reaped after drop");
}

fn rpc_fixture(body: &str) -> OwnedFixture {
    let fixture = OwnedFixture::new();
    std::fs::write(
        fixture.cli(),
        format!("#!/usr/bin/python3\nimport json,sys,time\n{body}\n"),
    )
    .unwrap();
    fixture
}
fn connect(fixture: &OwnedFixture) -> CodexAppServerConnection {
    CodexAppServerConnection::spawn_with_cli_lookup(FetchRuntimeMode::Default, || Ok(fixture.cli()))
        .unwrap()
}

#[tokio::test]
async fn rpc_uses_string_ids_optional_params_and_ignores_unrelated_lines() {
    let fixture = rpc_fixture(
        r#"
for line in sys.stdin:
 r=json.loads(line)
 print('',flush=True)
 print(json.dumps({'id':int(r['id']),'result':'wrong-number'}),flush=True)
 print(json.dumps({'id':'unrelated','error':{'message':'must ignore'}}),flush=True)
 print(json.dumps({'method':'notification'}),flush=True)
 print(json.dumps({'id':r['id'],'result':r}),flush=True)
"#,
    );
    let mut connection = connect(&fixture);
    for (i, params) in [
        None,
        Some(serde_json::Value::Null),
        Some(serde_json::json!({"text":"换行\n内容"})),
    ]
    .into_iter()
    .enumerate()
    {
        let response = connection
            .send_request("fixture", params.clone())
            .await
            .unwrap();
        assert_eq!(response["id"], (i + 1).to_string());
        assert_eq!(response["method"], "fixture");
        assert_eq!(response.get("params"), params.as_ref());
        assert!(response.get("jsonrpc").is_none());
    }
    connection.child.kill().await.unwrap();
}

#[tokio::test]
async fn rpc_error_presence_wins_over_result_and_missing_result_is_null() {
    let fixture = rpc_fixture(
        r#"
for line in sys.stdin:
 r=json.loads(line)
 out={'id':r['id']}
 if r['method']=='empty-error': out.update(error={'message':''},result='ignored')
 elif r['method']=='message': out.update(error={'message':'synthetic rejection','code':42})
 elif r['method']=='null-error': out.update(error=None,result='ignored')
 elif r['method']=='wrong-message': out.update(error={'message':42})
 print(json.dumps(out),flush=True)
"#,
    );
    let mut connection = connect(&fixture);
    for (method, error) in [
        ("empty-error", ""),
        ("message", "synthetic rejection"),
        ("null-error", "codex app-server rejected null-error"),
        ("wrong-message", "codex app-server rejected wrong-message"),
    ] {
        assert_eq!(
            connection.send_request(method, None).await.unwrap_err(),
            error
        );
    }
    assert_eq!(
        connection.send_request("missing", None).await.unwrap(),
        serde_json::Value::Null
    );
    connection.child.kill().await.unwrap();
}

#[tokio::test]
async fn rpc_malformed_json_whitespace_utf8_and_eof_have_distinct_errors() {
    for (body, prefix) in [
        (
            "sys.stdin.readline(); print('not-json',flush=True)",
            "codex app-server returned invalid JSON: ",
        ),
        (
            "sys.stdin.readline(); print('   ',flush=True)",
            "codex app-server returned invalid JSON: ",
        ),
        (
            "sys.stdin.readline(); sys.stdout.buffer.write(b'\\xff\\n'); sys.stdout.flush()",
            "failed to read codex app-server response: ",
        ),
        (
            "sys.stdin.readline()",
            "codex app-server exited before returning fixture",
        ),
    ] {
        let fixture = rpc_fixture(body);
        let mut connection = connect(&fixture);
        assert!(connection
            .send_request("fixture", None)
            .await
            .unwrap_err()
            .starts_with(prefix));
        connection.child.wait().await.unwrap();
    }
}

#[tokio::test]
async fn rpc_times_out_waiting_for_a_line() {
    let fixture = rpc_fixture("sys.stdin.readline(); time.sleep(40)");
    let mut connection = connect(&fixture);
    let started = std::time::Instant::now();
    assert_eq!(
        connection.send_request("fixture", None).await.unwrap_err(),
        "timed out waiting for fixture from codex app-server"
    );
    assert!(started.elapsed() >= Duration::from_secs(30));
    connection.child.kill().await.unwrap();
}
