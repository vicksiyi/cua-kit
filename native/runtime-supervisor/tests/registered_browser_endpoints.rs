use core_runtime_supervisor::native_pipe::NativePipeHost;
use serde_json::json;
use std::{
    fs,
    os::unix::fs::{symlink, PermissionsExt},
    path::PathBuf,
};
use tokio::{net::UnixListener, sync::mpsc};
use uuid::Uuid;
struct Root(PathBuf);
impl Root {
    fn new() -> Self {
        let path = PathBuf::from("/tmp").join(format!("core-endpoints-{}", Uuid::new_v4()));
        fs::create_dir(&path).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap();
        Self(fs::canonicalize(path).unwrap())
    }
}
impl Drop for Root {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn register(root: &Root) -> (PathBuf, PathBuf, UnixListener) {
    let directory = root.0.join("core-cua-late");
    fs::create_dir(&directory).unwrap();
    fs::set_permissions(&directory, fs::Permissions::from_mode(0o700)).unwrap();
    let path = directory.join("host.sock");
    let listener = UnixListener::bind(&path).unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
    let descriptor = directory.join("endpoint.json");
    fs::write(
        &descriptor,
        json!({"version":1,"socketPath":path,"token":"a".repeat(64)}).to_string(),
    )
    .unwrap();
    fs::set_permissions(&descriptor, fs::Permissions::from_mode(0o600)).unwrap();
    (path, descriptor, listener)
}
#[tokio::test]
async fn late_registration_connects_only_inside_explicit_host_scope() {
    let root = Root::new();
    let other = Root::new();
    let (events, _receiver) = mpsc::channel(16);
    // No socket or descriptor exists when the host receives its scope.
    let mut host = NativePipeHost::new(vec![], events)
        .unwrap()
        .with_endpoint_roots(vec![root.0.clone()])
        .unwrap();
    let (path, descriptor, listener) = register(&root);
    let connected = host
        .request(&json!({"op":"connect","path":path}))
        .await
        .unwrap();
    assert!(connected["connection_id"].is_string());
    let (_peer, _) = listener.accept().await.unwrap();
    let (outside, _, _listener) = register(&other);
    assert!(host
        .request(&json!({"op":"connect","path":outside}))
        .await
        .is_err());
    // Each new connection revalidates registration; prior success is not a blanket grant.
    fs::remove_file(&descriptor).unwrap();
    assert!(host
        .request(&json!({"op":"connect","path":path}))
        .await
        .is_err());
    host.close().await;
}
#[tokio::test]
async fn rejects_unregistered_malformed_shared_and_symlinked_endpoints() {
    let root = Root::new();
    let (events, _receiver) = mpsc::channel(16);
    let mut host = NativePipeHost::new(vec![], events)
        .unwrap()
        .with_endpoint_roots(vec![root.0.clone()])
        .unwrap();
    let (path, descriptor, _listener) = register(&root);
    let original = fs::read(&descriptor).unwrap();
    for bytes in [
        b"{}".to_vec(),
        vec![b' '; 4097],
        json!({"version":1,"socketPath":path,"token":"bad"})
            .to_string()
            .into_bytes(),
        json!({"version":1,"socketPath":"/tmp/other.sock","token":"a".repeat(64)})
            .to_string()
            .into_bytes(),
    ] {
        fs::write(&descriptor, bytes).unwrap();
        assert!(host
            .request(&json!({"op":"connect","path":path}))
            .await
            .is_err());
    }
    fs::write(&descriptor, &original).unwrap();
    for target in [&root.0, path.parent().unwrap(), &path, &descriptor] {
        let mode = fs::metadata(target).unwrap().permissions().mode();
        fs::set_permissions(target, fs::Permissions::from_mode(mode | 0o044)).unwrap();
        assert!(host
            .request(&json!({"op":"connect","path":path}))
            .await
            .is_err());
        fs::set_permissions(target, fs::Permissions::from_mode(mode)).unwrap();
    }
    let actual = descriptor.with_extension("actual");
    fs::rename(&descriptor, &actual).unwrap();
    symlink(&actual, &descriptor).unwrap();
    assert!(host
        .request(&json!({"op":"connect","path":path}))
        .await
        .is_err());
    let link = root.0.join("alias.sock");
    symlink(&path, &link).unwrap();
    assert!(host
        .request(&json!({"op":"connect","path":link}))
        .await
        .is_err());
    host.close().await;
}
#[tokio::test]
async fn default_host_does_not_accept_registered_but_unconfigured_sockets() {
    let root = Root::new();
    let (path, _, _listener) = register(&root);
    let (events, _) = mpsc::channel(16);
    let mut host = NativePipeHost::new(vec![], events.clone()).unwrap();
    assert!(host
        .request(&json!({"op":"connect","path":path}))
        .await
        .is_err());
    assert!(NativePipeHost::new(vec![], events.clone())
        .unwrap()
        .with_endpoint_roots(vec![PathBuf::from("relative")])
        .is_err());
    let alias = root.0.join("alias");
    symlink(&root.0, &alias).unwrap();
    assert!(NativePipeHost::new(vec![], events)
        .unwrap()
        .with_endpoint_roots(vec![alias])
        .is_err());
}
