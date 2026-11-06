//! Reconstructed native attachment storage and filename handling.
//! Evidence: installed ARM64 host (2a5b1035...), create_tab_context_asset
//! 0x100016270..0x1000164f0 and sanitizer map 0x100029c24..0x100029ea8.
//! Wired through the extension-input native control dispatcher.

pub const MAX_ACTIVE_ASSETS: usize = 16;
pub const MAX_ASSET_BYTES: u64 = 100 * 1024 * 1024;
pub const MAX_FILE_NAME_BYTES: usize = 218;
const DEFAULT_FILE_NAME: &str = "tab-context.txt";

fn prefix_at_char_boundary(value: &str, max_bytes: usize) -> &str {
    let mut end = value.len().min(max_bytes);
    while !value.is_char_boundary(end) {
        end -= 1;
    }
    &value[..end]
}

/// The native sanitizer works on UTF-8 bytes, not character count. It takes the
/// last nonempty slash/backslash component, replaces the observed reserved
/// characters, trims whitespace, and preserves the final extension when it fits.
/// Do not use this function alone as path authorization: the original host
/// subsequently prefixes the generated UUID to the name.
pub fn sanitize_file_name(input: &str) -> String {
    let component = input
        .rsplit(['/', '\\'])
        .find(|part| !part.is_empty())
        .unwrap_or(DEFAULT_FILE_NAME);
    let replaced: String = component
        .chars()
        .map(|ch| match ch {
            '"' | '%' | '*' | ':' | '<' | '>' | '?' | '|' => '_',
            _ => ch,
        })
        .collect();
    let name = replaced.trim();
    if name.is_empty() {
        return DEFAULT_FILE_NAME.to_owned();
    }
    if name.len() <= MAX_FILE_NAME_BYTES {
        return name.to_owned();
    }
    if let Some(dot) = name.rfind('.') {
        let extension = &name[dot..];
        if dot != 0 && extension.len() < MAX_FILE_NAME_BYTES {
            let stem = prefix_at_char_boundary(&name[..dot], MAX_FILE_NAME_BYTES - extension.len())
                .trim_end();
            if !stem.is_empty() {
                return format!("{stem}{extension}");
            }
        }
    }
    prefix_at_char_boundary(name, MAX_FILE_NAME_BYTES)
        .trim()
        .to_owned()
}

use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs::{self, File, OpenOptions},
    io::{self, Write},
    os::unix::fs::{MetadataExt, OpenOptionsExt},
    path::{Path, PathBuf},
};
use uuid::Uuid;

struct Asset {
    path: PathBuf,
    identity: (u64, u64),
    size: u64,
    finished: bool,
}

/// Native attachment storage. The root is supplied by trusted deployment code.
/// Private-root/inode checks are Core ownership measures, not recovered vendor
/// authorization. This store never removes untracked files or the parent root.
pub struct AssetStore {
    root: PathBuf,
    root_identity: (u64, u64),
    assets: HashMap<String, Asset>,
}
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}
fn identity(metadata: &fs::Metadata) -> (u64, u64) {
    (metadata.dev(), metadata.ino())
}
impl AssetStore {
    pub fn new(root: &Path) -> io::Result<Self> {
        let metadata = fs::symlink_metadata(root)?;
        // SAFETY: geteuid has no arguments or memory preconditions.
        if !root.is_absolute()
            || !metadata.is_dir()
            || metadata.mode() & 0o077 != 0
            || metadata.uid() != unsafe { libc::geteuid() }
        {
            return Err(invalid(
                "Asset directory must be private, owned and absolute",
            ));
        }
        Ok(Self {
            root: fs::canonicalize(root)?,
            root_identity: identity(&metadata),
            assets: HashMap::new(),
        })
    }
    fn check_root(&self) -> io::Result<()> {
        let metadata = fs::symlink_metadata(&self.root)?;
        if !metadata.is_dir() || identity(&metadata) != self.root_identity {
            return Err(invalid("Asset directory was replaced"));
        }
        Ok(())
    }
    pub fn create(&mut self, file_name: &str) -> io::Result<Value> {
        if self.assets.len() >= MAX_ACTIVE_ASSETS {
            return Err(invalid("Too many active Chrome tab context assets"));
        }
        self.check_root()?;
        let asset_id = Uuid::new_v4().to_string();
        let path = self
            .root
            .join(format!("{asset_id}-{}", sanitize_file_name(file_name)));
        let file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW)
            .open(&path)?;
        let metadata = file.metadata()?;
        self.assets.insert(
            asset_id.clone(),
            Asset {
                path: path.clone(),
                identity: identity(&metadata),
                size: 0,
                finished: false,
            },
        );
        Ok(json!({"assetId": asset_id, "path": path.to_string_lossy()}))
    }
    pub fn append(&mut self, asset_id: &str, data_base64: &str) -> io::Result<Value> {
        self.check_root()?;
        let asset = self
            .assets
            .get_mut(asset_id)
            .ok_or_else(|| invalid("Chrome tab context asset was not found"))?;
        if asset.finished {
            return Err(invalid("Chrome tab context asset is already finished"));
        }
        let bytes = STANDARD
            .decode(data_base64)
            .map_err(|_| invalid("Invalid Chrome tab context asset base64"))?;
        if asset.size.saturating_add(bytes.len() as u64) > MAX_ASSET_BYTES {
            return Err(invalid("Chrome tab context asset is too large"));
        }
        let mut file = OpenOptions::new()
            .append(true)
            .custom_flags(libc::O_NOFOLLOW)
            .open(&asset.path)?;
        verify_file(&file, asset)?;
        file.write_all(&bytes)?;
        asset.size += bytes.len() as u64;
        Ok(json!({}))
    }
    pub fn finish(&mut self, asset_id: &str) -> io::Result<Value> {
        let asset = self
            .assets
            .get_mut(asset_id)
            .ok_or_else(|| invalid("Chrome tab context asset was not found"))?;
        // The observed finish operation marks the entry; it does not evict it.
        asset.finished = true;
        Ok(json!({"assetId": asset_id, "path": asset.path.to_string_lossy()}))
    }
    pub fn remove(&mut self, asset_id: &str) -> io::Result<Value> {
        self.check_root()?;
        if let Some(asset) = self.assets.remove(asset_id) {
            remove_owned(&asset)?;
        }
        Ok(json!({}))
    }
    /// Explicit cleanup reports the first failure and still attempts every entry.
    pub fn shutdown(&mut self) -> io::Result<()> {
        self.check_root()?;
        let mut first = None;
        for (_, asset) in self.assets.drain() {
            if let Err(error) = remove_owned(&asset) {
                if first.is_none() {
                    first = Some(error);
                }
            }
        }
        first.map_or(Ok(()), Err)
    }
}
fn verify_file(file: &File, asset: &Asset) -> io::Result<()> {
    let metadata = file.metadata()?;
    if !metadata.is_file()
        || identity(&metadata) != asset.identity
        || metadata.nlink() != 1
        || metadata.mode() & 0o077 != 0
        || metadata.len() != asset.size
    {
        return Err(invalid("Asset file was replaced or modified"));
    }
    Ok(())
}
fn remove_owned(asset: &Asset) -> io::Result<()> {
    let metadata = match fs::symlink_metadata(&asset.path) {
        Ok(value) => value,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };
    if !metadata.is_file() || identity(&metadata) != asset.identity {
        return Err(invalid("Asset file was replaced"));
    }
    fs::remove_file(&asset.path)
}
impl Drop for AssetStore {
    fn drop(&mut self) {
        let _ = self.shutdown();
    }
}
