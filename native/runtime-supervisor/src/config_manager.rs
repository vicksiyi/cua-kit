//! Explicit TOML sources and opt-in preference persistence. No implicit ~/.codex access.
use serde_json::{json, Value};
use std::sync::Arc;
use std::{
    collections::{HashMap, HashSet},
    ffi::CString,
    fs::{File, OpenOptions},
    io::{Read, Write},
    os::{
        fd::{AsRawFd, FromRawFd},
        unix::{
            ffi::OsStrExt,
            fs::{MetadataExt, OpenOptionsExt},
        },
    },
    path::{Path, PathBuf},
};
use tokio::sync::Mutex;
const LIMIT: u64 = 1024 * 1024;
const READ_ERROR: &str =
    "Configured TOML source is unavailable, invalid, or exceeds its size limit";

pub struct ConfigSources {
    pub config: PathBuf,
    pub requirements: PathBuf,
    pub working_directories: HashSet<PathBuf>,
    pub toml_files: HashMap<String, PathBuf>,
}
struct Preference {
    path: PathBuf,
    parent: PathBuf,
    directory: File,
    name: CString,
    lock: Arc<Mutex<()>>,
}
pub struct ConfigManager {
    sources: ConfigSources,
    writable: HashMap<String, Preference>,
    protected: HashSet<(u64, u64)>,
}
impl ConfigManager {
    pub fn new(sources: ConfigSources, writable: HashSet<String>) -> Result<Self, String> {
        if [&sources.config, &sources.requirements]
            .into_iter()
            .chain(sources.toml_files.values())
            .chain(sources.working_directories.iter())
            .any(|path| !path.is_absolute())
        {
            return Err("Configuration sources must be explicit absolute paths".into());
        }
        let mut protected = HashSet::new();
        for path in [&sources.config, &sources.requirements] {
            let file = open_read(path)?;
            let meta = file.metadata().map_err(|_| READ_ERROR)?;
            protected.insert((meta.dev(), meta.ino()));
        }
        let mut files = HashMap::new();
        let mut locks: HashMap<PathBuf, Arc<Mutex<()>>> = HashMap::new();
        for key in writable {
            if key.eq_ignore_ascii_case("config.toml") {
                return Err("Writable preference path must be explicitly mapped".into());
            }
            let selected = sources
                .toml_files
                .get(&key)
                .ok_or("Writable preference path must be explicitly mapped")?;
            let file = open_read(selected)?;
            let info = file.metadata().map_err(|_| READ_ERROR)?;
            if info.nlink() != 1 || protected.contains(&(info.dev(), info.ino())) {
                return Err("Preference cannot target hardlinks, config or requirements".into());
            }
            let path = selected.canonicalize().map_err(|_| READ_ERROR)?;
            let parent = path
                .parent()
                .ok_or("Preference parent unavailable")?
                .to_path_buf();
            let directory = OpenOptions::new()
                .read(true)
                .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC)
                .open(&parent)
                .map_err(|_| "Preference directory unavailable")?;
            private_directory(&directory)?;
            let name = CString::new(path.file_name().unwrap().as_bytes())
                .map_err(|_| "Invalid preference filename")?;
            let lock = locks
                .entry(path.clone())
                .or_insert_with(|| Arc::new(Mutex::new(())))
                .clone();
            files.insert(
                key,
                Preference {
                    path,
                    parent,
                    directory,
                    name,
                    lock,
                },
            );
        }
        Ok(Self {
            sources,
            writable: files,
            protected,
        })
    }
    pub async fn request(&self, message: &Value) -> Result<Value, String> {
        if message["type"] != "config_action" {
            return Err("Unsupported configuration host operation".into());
        }
        let value = match message["action"].as_str() {
            Some("read_config") => {
                let cwd = message["cwd"].as_str().ok_or("Missing configuration cwd")?;
                if !self.sources.working_directories.contains(Path::new(cwd))
                    || message["include_layers"] != false
                {
                    return Err("Configuration scope or layer request is not supported".into());
                }
                json!({"config":read_toml(open_read(&self.sources.config)?)?})
            }
            Some("read_config_requirements") => {
                json!({"requirements":read_toml(open_read(&self.sources.requirements)?)?})
            }
            Some("read_toml") => {
                let key = message["path"].as_str().ok_or("Missing TOML path")?;
                let path = self
                    .sources
                    .toml_files
                    .get(key)
                    .ok_or("Configuration path is not authorized")?;
                read_toml(open_read(path)?)?
            }
            Some("write_toml") => {
                let key = message["path"].as_str().ok_or("Missing TOML path")?;
                let file = self
                    .writable
                    .get(key)
                    .ok_or("Preference write path is not authorized")?;
                let input = &message["value"];
                if !input.is_object() {
                    return Err("Preference value must be a TOML table".into());
                }
                let text = toml::to_string(input)
                    .map_err(|_| "Preference value cannot be serialized as TOML")?;
                if text.len() as u64 > LIMIT {
                    return Err("Preference write exceeds size limit".into());
                }
                let _lock = file.lock.lock().await;
                file.validate_directory()?;
                let current = open_at(
                    &file.directory,
                    &file.name,
                    libc::O_RDONLY | libc::O_NONBLOCK,
                    0,
                )?;
                let meta = current.metadata().map_err(|_| READ_ERROR)?;
                if !meta.is_file()
                    || meta.nlink() != 1
                    || self.protected.contains(&(meta.dev(), meta.ino()))
                {
                    return Err("Preference file is not an authorized ordinary file".into());
                }
                read_toml(current)?;
                let temp_name =
                    CString::new(format!(".core-config-{}.tmp", uuid::Uuid::new_v4())).unwrap();
                let temp = Temporary {
                    directory: &file.directory,
                    name: temp_name,
                };
                let mut output = open_at(
                    &file.directory,
                    &temp.name,
                    libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL,
                    0o600,
                )?;
                output
                    .write_all(text.as_bytes())
                    .and_then(|_| output.sync_all())
                    .map_err(|_| "Preference write failed")?;
                drop(output);
                // Cancellation here removes the private temporary file before commit.
                tokio::task::yield_now().await;
                file.validate_directory()?;
                let latest = open_at(
                    &file.directory,
                    &file.name,
                    libc::O_RDONLY | libc::O_NONBLOCK,
                    0,
                )?;
                let latest_meta = latest.metadata().map_err(|_| READ_ERROR)?;
                if latest_meta.nlink() != 1
                    || self
                        .protected
                        .contains(&(latest_meta.dev(), latest_meta.ino()))
                {
                    return Err("Preference target changed to a protected file".into());
                }
                read_toml(latest)?;
                let result = unsafe {
                    libc::renameat(
                        file.directory.as_raw_fd(),
                        temp.name.as_ptr(),
                        file.directory.as_raw_fd(),
                        file.name.as_ptr(),
                    )
                };
                if result != 0 {
                    return Err("Preference commit failed".into());
                }
                json!({})
            }
            _ => return Err("Unsupported configuration host operation".into()),
        };
        Ok(json!({"ok":true,"value":value}))
    }
}
impl Preference {
    fn validate_directory(&self) -> Result<(), String> {
        private_directory(&self.directory)?;
        let expected = self
            .directory
            .metadata()
            .map_err(|_| "Preference directory unavailable")?;
        let current =
            std::fs::symlink_metadata(&self.parent).map_err(|_| "Preference directory changed")?;
        if !current.is_dir() || (expected.dev(), expected.ino()) != (current.dev(), current.ino()) {
            return Err("Preference directory changed after registration".into());
        }
        // Reject replacement links even though renameat would replace the link itself.
        let current =
            std::fs::symlink_metadata(&self.path).map_err(|_| "Preference file unavailable")?;
        if !current.is_file() || current.nlink() != 1 {
            return Err("Preference file is not an ordinary file".into());
        }
        Ok(())
    }
}
fn private_directory(directory: &File) -> Result<(), String> {
    let meta = directory
        .metadata()
        .map_err(|_| "Preference directory unavailable")?;
    if !meta.is_dir() || meta.mode() & 0o077 != 0 || meta.uid() != unsafe { libc::geteuid() } {
        return Err("Preference directory must be private and owned by current user".into());
    }
    Ok(())
}
fn open_read(path: &Path) -> Result<File, String> {
    let file = OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK | libc::O_CLOEXEC)
        .open(path)
        .map_err(|_| READ_ERROR)?;
    if !file.metadata().map_err(|_| READ_ERROR)?.is_file() {
        return Err(READ_ERROR.into());
    }
    Ok(file)
}
fn open_at(
    directory: &File,
    name: &CString,
    flags: i32,
    mode: libc::mode_t,
) -> Result<File, String> {
    let fd = unsafe {
        libc::openat(
            directory.as_raw_fd(),
            name.as_ptr(),
            flags | libc::O_NOFOLLOW | libc::O_CLOEXEC,
            mode as libc::c_uint,
        )
    };
    if fd < 0 {
        return Err(READ_ERROR.into());
    }
    Ok(unsafe { File::from_raw_fd(fd) })
}
fn read_toml(file: File) -> Result<Value, String> {
    let meta = file.metadata().map_err(|_| READ_ERROR)?;
    if !meta.is_file() || meta.len() > LIMIT {
        return Err(READ_ERROR.into());
    }
    let mut bytes = Vec::new();
    file.take(LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| READ_ERROR)?;
    if bytes.len() as u64 > LIMIT {
        return Err(READ_ERROR.into());
    }
    let text = std::str::from_utf8(&bytes).map_err(|_| READ_ERROR)?;
    let parsed: toml::Value = toml::from_str(text).map_err(|_| READ_ERROR)?;
    validate_json_toml(&parsed)?;
    serde_json::to_value(parsed).map_err(|_| READ_ERROR.into())
}
struct Temporary<'a> {
    directory: &'a File,
    name: CString,
}
impl Drop for Temporary<'_> {
    fn drop(&mut self) {
        unsafe {
            libc::unlinkat(self.directory.as_raw_fd(), self.name.as_ptr(), 0);
        }
    }
}

fn validate_json_toml(value: &toml::Value) -> Result<(), String> {
    match value {
        toml::Value::Float(value) if !value.is_finite() => Err(READ_ERROR.into()),
        toml::Value::Datetime(_) => Err(READ_ERROR.into()),
        toml::Value::Array(values) => values.iter().try_for_each(validate_json_toml),
        toml::Value::Table(values) => values.values().try_for_each(validate_json_toml),
        _ => Ok(()),
    }
}
