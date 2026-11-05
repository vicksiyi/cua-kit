#![cfg(unix)]
use core_browser_extension_host::{
    endpoint::OwnedEndpoint,
    transport::{encode, receive},
};
use serde_json::{json, Value};
use std::os::unix::{
    fs::{symlink, DirBuilderExt, MetadataExt, PermissionsExt},
    net::UnixStream,
};
use std::{
    fs,
    io::{Read, Write},
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
    thread,
    time::{Duration, Instant},
};
static NEXT: AtomicUsize = AtomicUsize::new(0);
struct Parent(PathBuf);
impl Parent {
    fn new() -> Self {
        let path = PathBuf::from("/tmp").join(format!(
            "cua-host-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::DirBuilder::new().mode(0o700).create(&path).unwrap();
        Self(fs::canonicalize(path).unwrap())
    }
}
impl Drop for Parent {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn descriptor(endpoint: &OwnedEndpoint) -> Value {
    serde_json::from_slice(&fs::read(endpoint.descriptor_path()).unwrap()).unwrap()
}
#[test]
fn private_listener_handshake_preserves_pipelined_frame_and_cleans_owned_files() {
    let parent = Parent::new();
    let endpoint = OwnedEndpoint::bind(&parent.0).unwrap();
    let descriptor = descriptor(&endpoint);
    let file = endpoint.descriptor_path();
    let directory = file.parent().unwrap().to_owned();
    for (path, mode) in [
        (&directory, 0o700),
        (&file, 0o600),
        (
            &PathBuf::from(descriptor["socketPath"].as_str().unwrap()),
            0o600,
        ),
    ] {
        assert_eq!(fs::metadata(path).unwrap().mode() & 0o777, mode);
    }
    thread::scope(|scope| {
        let server = scope.spawn(|| {
            let (mut stream, _) = endpoint.listener().accept().unwrap();
            endpoint
                .authenticate(&mut stream, Duration::from_secs(1))
                .unwrap();
            assert_eq!(stream.read_timeout().unwrap(), None);
            assert_eq!(
                receive(&mut stream, 1024).unwrap(),
                Some(json!({"marker":"after-auth"}))
            );
        });
        let mut stream = UnixStream::connect(descriptor["socketPath"].as_str().unwrap()).unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        let mut frame = encode(
            &json!({"type":"core-cua-auth","version":1,"token":descriptor["token"]}),
            4096,
        )
        .unwrap();
        frame.extend(encode(&json!({"marker":"after-auth"}), 1024).unwrap());
        for chunk in frame.chunks(3) {
            stream.write_all(chunk).unwrap();
        }
        assert_eq!(
            receive(&mut stream, 4096).unwrap(),
            Some(json!({"type":"core-cua-auth-ok","version":1}))
        );
        server.join().unwrap();
    });
    drop(endpoint);
    assert!(!file.exists());
    assert!(!directory.exists());
    assert!(parent.0.exists());
}
#[test]
fn incorrect_tokens_versions_and_types_close_without_authorizing() {
    let parent = Parent::new();
    let endpoint = OwnedEndpoint::bind(&parent.0).unwrap();
    let token = descriptor(&endpoint)["token"].clone();
    for request in [
        json!({"type":"core-cua-auth","version":1,"token":"0".repeat(64)}),
        json!({"type":"core-cua-auth","version":2,"token":token}),
        json!({"type":"wrong","version":1,"token":token}),
        json!({"type":"core-cua-auth","version":1,"token":null}),
    ] {
        let (mut server, mut client) = UnixStream::pair().unwrap();
        client.write_all(&encode(&request, 4096).unwrap()).unwrap();
        assert!(endpoint
            .authenticate(&mut server, Duration::from_millis(100))
            .is_err());
        assert_eq!(client.read(&mut [0]).unwrap(), 0);
    }
}
#[test]
fn authentication_has_an_absolute_deadline_even_when_bytes_keep_arriving() {
    let parent = Parent::new();
    let endpoint = OwnedEndpoint::bind(&parent.0).unwrap();
    let token = descriptor(&endpoint)["token"].clone();
    let (mut server, mut client) = UnixStream::pair().unwrap();
    let frame = encode(
        &json!({"type":"core-cua-auth","version":1,"token":token}),
        4096,
    )
    .unwrap();
    let sender = thread::spawn(move || {
        for byte in frame {
            if client.write_all(&[byte]).is_err() {
                break;
            }
            thread::sleep(Duration::from_millis(20));
        }
    });
    let start = Instant::now();
    assert!(endpoint
        .authenticate(&mut server, Duration::from_millis(80))
        .is_err());
    assert!(start.elapsed() < Duration::from_secs(1));
    sender.join().unwrap();
}
#[test]
fn rejects_shared_symlink_and_relative_parent_without_repairing_permissions() {
    let parent = Parent::new();
    fs::set_permissions(&parent.0, fs::Permissions::from_mode(0o755)).unwrap();
    assert!(OwnedEndpoint::bind(&parent.0).is_err());
    assert_eq!(fs::metadata(&parent.0).unwrap().mode() & 0o777, 0o755);
    fs::set_permissions(&parent.0, fs::Permissions::from_mode(0o700)).unwrap();
    let link = parent.0.join("alias");
    symlink(&parent.0, &link).unwrap();
    assert!(OwnedEndpoint::bind(&link).is_err());
    assert!(OwnedEndpoint::bind(std::path::Path::new("relative")).is_err());
}
#[test]
fn failed_socket_bind_rolls_back_its_child_directory() {
    let parent = Parent::new();
    let long = parent.0.join("x".repeat(100));
    fs::DirBuilder::new().mode(0o700).create(&long).unwrap();
    assert!(OwnedEndpoint::bind(&long).is_err());
    assert_eq!(fs::read_dir(long).unwrap().count(), 0);
}
#[test]
fn cleanup_does_not_delete_replacement_directory() {
    let parent = Parent::new();
    let endpoint = OwnedEndpoint::bind(&parent.0).unwrap();
    let directory = endpoint.descriptor_path().parent().unwrap().to_owned();
    let moved = parent.0.join("original");
    fs::rename(&directory, &moved).unwrap();
    fs::create_dir(&directory).unwrap();
    let marker = directory.join("endpoint.json");
    fs::write(&marker, "replacement").unwrap();
    drop(endpoint);
    assert_eq!(fs::read_to_string(marker).unwrap(), "replacement");
}
