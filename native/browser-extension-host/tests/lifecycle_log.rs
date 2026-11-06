#![cfg(unix)]
use core_browser_extension_host::lifecycle_log::LifecycleLog;
use std::{
    fs,
    os::unix::fs::{symlink, MetadataExt, PermissionsExt},
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};
static NEXT: AtomicUsize = AtomicUsize::new(0);
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let path = PathBuf::from("/tmp").join(format!(
            "cua-life-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
#[test]
fn lifecycle_is_private_metadata_only_and_bounded() {
    let fixture = Fixture::new();
    let path = fixture.0.join("lifecycle.jsonl");
    let log = LifecycleLog::open(&path).unwrap();
    log.record("starting").unwrap();
    let row: serde_json::Value =
        serde_json::from_str(fs::read_to_string(&path).unwrap().trim()).unwrap();
    assert_eq!(
        row.as_object().unwrap().keys().cloned().collect::<Vec<_>>(),
        vec!["event", "pid", "time"]
    );
    assert!(row["time"].as_str().unwrap().ends_with('Z'));
    assert_eq!(fs::metadata(&path).unwrap().mode() & 0o777, 0o600);
    fs::write(&path, vec![b'x'; 1024 * 1024]).unwrap();
    log.record("ready").unwrap();
    assert!(fs::metadata(&path).unwrap().len() < 200);
    assert!(log.record("request-payload-must-not-be-logged").is_err());
}
#[test]
fn lifecycle_rejects_symlinks_and_hardlinks() {
    let fixture = Fixture::new();
    let path = fixture.0.join("real");
    drop(LifecycleLog::open(&path).unwrap());
    let link = fixture.0.join("symlink");
    symlink(&path, &link).unwrap();
    assert!(LifecycleLog::open(&link).is_err());
    fs::hard_link(&path, fixture.0.join("hardlink")).unwrap();
    assert!(LifecycleLog::open(&path).is_err());
}
#[test]
fn lifecycle_rejects_shared_permissions_without_changing_them() {
    let fixture = Fixture::new();
    let path = fixture.0.join("shared");
    fs::write(&path, "fixture").unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).unwrap();
    assert!(LifecycleLog::open(&path).is_err());
    assert_eq!(fs::read_to_string(&path).unwrap(), "fixture");
    assert_eq!(fs::metadata(&path).unwrap().mode() & 0o777, 0o644);
}
