//! Core deployment registration, not a recovered vendor RPC or permission bypass.
//! Only host-configured private installation roots can authorize late browser sockets.
use serde_json::Value;
use std::{
    fs,
    io::Read,
    os::unix::fs::{FileTypeExt, MetadataExt},
    path::{Path, PathBuf},
};

fn private_metadata(path: &Path) -> Result<fs::Metadata, String> {
    let value =
        fs::symlink_metadata(path).map_err(|_| "Missing browser registration".to_string())?;
    if value.file_type().is_symlink()
        || value.uid() != unsafe { libc::geteuid() }
        || value.mode() & 0o077 != 0
    {
        return Err("Browser registration must be private and owned by the current user".into());
    }
    Ok(value)
}
pub fn validate_roots(roots: Vec<PathBuf>) -> Result<Vec<PathBuf>, String> {
    roots
        .into_iter()
        .map(|root| {
            if !root.is_absolute() || !private_metadata(&root)?.is_dir() {
                return Err("Browser endpoint root must be an absolute private directory".into());
            }
            fs::canonicalize(root).map_err(|_| "Cannot resolve browser endpoint root".into())
        })
        .collect()
}
pub fn registered_socket(roots: &[PathBuf], path: &Path) -> bool {
    validate_socket(roots, path).is_ok()
}
fn validate_socket(roots: &[PathBuf], path: &Path) -> Result<(), String> {
    let directory = path.parent().ok_or("Missing endpoint directory")?;
    let root = directory.parent().ok_or("Missing installation root")?;
    if !path.is_absolute()
        || !roots.iter().any(|allowed| allowed == root)
        || !directory
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with("core-cua-"))
    {
        return Err("Socket outside registered browser installation".into());
    }
    if !private_metadata(root)?.is_dir()
        || !private_metadata(directory)?.is_dir()
        || !private_metadata(path)?.file_type().is_socket()
    {
        return Err("Invalid browser socket registration".into());
    }
    let descriptor = directory.join("endpoint.json");
    let metadata = private_metadata(&descriptor)?;
    if !metadata.is_file() || metadata.len() > 4096 {
        return Err("Invalid browser endpoint descriptor".into());
    }
    let mut bytes = Vec::new();
    fs::File::open(descriptor)
        .map_err(|_| "Cannot read browser registration")?
        .take(4097)
        .read_to_end(&mut bytes)
        .map_err(|_| "Cannot read browser registration")?;
    if bytes.len() > 4096 {
        return Err("Oversized browser registration".into());
    }
    let value: Value =
        serde_json::from_slice(&bytes).map_err(|_| "Malformed browser registration")?;
    let valid_token = value["token"].as_str().is_some_and(|token| {
        token.len() == 64
            && token
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    });
    if value["version"] != 1
        || value["socketPath"].as_str().map(Path::new) != Some(path)
        || !valid_token
    {
        return Err("Invalid browser registration fields".into());
    }
    // Authentication remains in the trusted connector; this only authorizes transport scope.
    Ok(())
}
