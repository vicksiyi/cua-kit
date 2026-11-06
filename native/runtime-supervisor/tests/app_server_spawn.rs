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

#[tokio::test]
async fn initialization_precedes_auth_and_does_not_insert_an_extra_notification() {
    let fixture = rpc_fixture(
        r#"
r=json.loads(sys.stdin.readline())
expected={'id':'1','method':'initialize','params':{'capabilities':{'experimentalApi':True,'optOutNotificationMethods':[]},'clientInfo':{'name':'codex-browser-use','title':'Codex Browser Use','version':'0.1.0'}}}
if r != expected:
 print(json.dumps({'id':r.get('id'),'error':{'message':'unexpected handshake'}}),flush=True)
 sys.exit(0)
# Any successful result is sufficient; native code discards its value.
print(json.dumps({'id':'1','result':False}),flush=True)
r=json.loads(sys.stdin.readline())
print(json.dumps({'id':r.get('id'),'result':r}),flush=True)
"#,
    );
    let mut connection = CodexAppServerConnection::spawn_initialized_with_cli_lookup(
        FetchRuntimeMode::Default,
        || Ok(fixture.cli()),
    )
    .await
    .unwrap();
    let params = core_runtime_supervisor::codex_app_server_auth::auth_status_params(false);
    let response = connection
        .send_request("getAuthStatus", Some(params.clone()))
        .await
        .unwrap();
    assert_eq!(
        response,
        serde_json::json!({"id":"2","method":"getAuthStatus","params":params})
    );
    connection.child.wait().await.unwrap();
}

#[tokio::test]
async fn initialization_rejection_returns_error_and_drops_owned_child() {
    let fixture = rpc_fixture(
        r#"
import os
with open(os.path.join(os.path.dirname(__file__),'pid'),'w') as f: f.write(str(os.getpid()))
r=json.loads(sys.stdin.readline())
print(json.dumps({'id':r['id'],'error':{'message':'synthetic init refusal'}}),flush=True)
time.sleep(10)
"#,
    );
    let result = CodexAppServerConnection::spawn_initialized_with_cli_lookup(
        FetchRuntimeMode::Default,
        || Ok(fixture.cli()),
    )
    .await;
    assert_eq!(result.err().unwrap(), "synthetic init refusal");
    let pid: i32 = std::fs::read_to_string(fixture.0.join("pid"))
        .unwrap()
        .parse()
        .unwrap();
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
    .expect("initialization failure must release owned child");
}

use core_runtime_supervisor::codex_app_server::{AppServerEnvironment, CodexAppServerClient};
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc, Mutex,
};
struct ClientEnvironment {
    path: String,
    lookups: AtomicUsize,
    mode: Mutex<Result<FetchRuntimeMode, String>>,
}
impl AppServerEnvironment for ClientEnvironment {
    fn runtime_mode(&self) -> Result<FetchRuntimeMode, String> {
        self.mode.lock().unwrap().clone()
    }
    fn cli_path(&self) -> Result<String, VarError> {
        self.lookups.fetch_add(1, Ordering::SeqCst);
        Ok(self.path.clone())
    }
}
fn client(fixture: &OwnedFixture) -> (Arc<CodexAppServerClient>, Arc<ClientEnvironment>) {
    let environment = Arc::new(ClientEnvironment {
        path: fixture.cli(),
        lookups: AtomicUsize::new(0),
        mode: Mutex::new(Ok(FetchRuntimeMode::Default)),
    });
    (
        Arc::new(CodexAppServerClient::with_environment(environment.clone())),
        environment,
    )
}

#[tokio::test]
async fn client_serializes_reuses_and_recreates_only_after_failed_call() {
    let fixture = rpc_fixture(
        r#"
import os,select
for line in sys.stdin:
 r=json.loads(line)
 if r['method']=='initialize':
  print(json.dumps({'id':r['id'],'result':None}),flush=True)
  continue
 # Once a request is received, no second request may arrive before its response.
 concurrent=bool(select.select([sys.stdin],[],[],0.05)[0])
 out={'id':r['id'],'result':{'pid':os.getpid(),'id':r['id'],'concurrent':concurrent}}
 if r['method']=='reject': out={'id':r['id'],'error':{'message':'synthetic error'}}
 print(json.dumps(out),flush=True)
"#,
    );
    let (client, env) = client(&fixture);
    let (a, b) = tokio::join!(
        client.send_request("a", None),
        client.send_request("b", None)
    );
    let (a, b) = (a.unwrap(), b.unwrap());
    assert_eq!(a["pid"], b["pid"]);
    assert_eq!(a["concurrent"], false);
    assert_eq!(b["concurrent"], false);
    let mut ids = vec![a["id"].as_str().unwrap(), b["id"].as_str().unwrap()];
    ids.sort();
    assert_eq!(ids, vec!["2", "3"]);
    assert_eq!(env.lookups.load(Ordering::SeqCst), 1);
    assert_eq!(
        client.send_request("reject", None).await.unwrap_err(),
        "synthetic error"
    );
    assert_eq!(
        env.lookups.load(Ordering::SeqCst),
        1,
        "do not retry failing call"
    );
    let next = client.send_request("next", None).await.unwrap();
    assert_eq!(next["id"], "2");
    assert_ne!(next["pid"], a["pid"]);
    assert_eq!(env.lookups.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn client_mode_rejection_preserves_cached_connection_and_auth_parser_errors_do_not_reset_it()
{
    let fixture = rpc_fixture(
        r#"
for line in sys.stdin:
 r=json.loads(line)
 if r['method']=='initialize': result=None
 elif r['method']=='getAuthStatus':
  result={'authMethod':'chatgpt','authToken':'refreshed' if r['params']['refreshToken'] else ''}
 else: result=r
 print(json.dumps({'id':r['id'],'result':result}),flush=True)
"#,
    );
    let (client, env) = client(&fixture);
    use core_runtime_supervisor::codex_app_server_auth::{
        AccessTokenFetcher, CodexAppServerAccessTokenFetcher,
    };
    let fetcher = CodexAppServerAccessTokenFetcher::new(client.clone());
    assert_eq!(
        fetcher.fetch_access_token(false).await.unwrap_err(),
        "Codex auth token is unavailable"
    );
    *env.mode.lock().unwrap() = Ok(FetchRuntimeMode::GaasBrowser);
    assert_eq!(
        client.send_request("not-sent", None).await.unwrap_err(),
        "Codex app-server is unavailable in gaas-browser runtime mode"
    );
    *env.mode.lock().unwrap() = Err("synthetic mode error".into());
    assert_eq!(
        client.send_request("not-sent", None).await.unwrap_err(),
        "synthetic mode error"
    );
    *env.mode.lock().unwrap() = Ok(FetchRuntimeMode::Default);
    assert_eq!(fetcher.fetch_access_token(true).await.unwrap(), "refreshed");
    let last = client.send_request("last", None).await.unwrap();
    assert_eq!(last["id"], "4");
    assert_eq!(env.lookups.load(Ordering::SeqCst), 1);
}

#[test]
fn runtime_mode_parser_matches_empty_exact_and_lossy_error_rules() {
    use core_runtime_supervisor::runtime_mode::NodeReplRuntimeMode as Mode;
    use std::ffi::OsStr;
    assert_eq!(Mode::from_env_value(None).unwrap(), Mode::Default);
    assert_eq!(
        Mode::from_env_value(Some(OsStr::new(""))).unwrap(),
        Mode::Default
    );
    assert_eq!(
        Mode::from_env_value(Some(OsStr::new("gaas-browser"))).unwrap(),
        Mode::GaasBrowser
    );
    for value in ["default", " GAAS-BROWSER", "gaas-browser "] {
        assert_eq!(
            Mode::from_env_value(Some(OsStr::new(value))).unwrap_err(),
            format!("unsupported NODE_REPL_RUNTIME_MODE value: {value}")
        );
    }
    assert_eq!(
        Mode::from_env_value(Some(&OsString::from_vec(vec![255]))).unwrap_err(),
        "unsupported NODE_REPL_RUNTIME_MODE value: �"
    );
}
