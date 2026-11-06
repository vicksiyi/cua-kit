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
use tokio::io::{AsyncBufReadExt, AsyncWriteExt};

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
    let mut line = String::new();
    tokio::time::timeout(
        Duration::from_secs(5),
        connection.stdout.read_line(&mut line),
    )
    .await
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
    line.clear();
    tokio::time::timeout(
        Duration::from_secs(5),
        connection.stdout.read_line(&mut line),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(line, "owned fixture request\n");
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
    let mut line = String::new();
    tokio::time::timeout(
        Duration::from_secs(5),
        connection.stdout.read_line(&mut line),
    )
    .await
    .unwrap()
    .unwrap();
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
